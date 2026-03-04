import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const SERVER_PATH = fileURLToPath(new URL('../server.mjs', import.meta.url));
const JWT_ACCESS_SECRET = 'stage17-test-access-secret';
const BASE_REALTIME_PORT = 39000 + (process.pid % 1000);
const MAX_STARTUP_PORT_ATTEMPTS = 10;

let serverProcess;
let realtimePort = BASE_REALTIME_PORT;
let exitCleanupHandler;

const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');

const signAccessToken = (payload, secret) => {
  const encodedHeader = base64UrlEncode(
    JSON.stringify({
      alg: 'HS256',
      typ: 'JWT',
    }),
  );
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const waitForSocketData = (state, timeoutMs) =>
  new Promise((resolve, reject) => {
    if (state.buffer.length > 0) {
      resolve();
      return;
    }

    if (state.error) {
      reject(state.error);
      return;
    }

    if (state.closed) {
      reject(new Error('socket closed before data'));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('socket read timeout'));
    }, timeoutMs);

    const onData = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('socket closed before data'));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      state.events.off('data', onData);
      state.events.off('close', onClose);
      state.events.off('error', onError);
    };

    state.events.once('data', onData);
    state.events.once('close', onClose);
    state.events.once('error', onError);
  });

const createSocketState = (socket) => {
  const state = {
    buffer: Buffer.alloc(0),
    events: new EventEmitter(),
    closed: false,
    error: null,
  };

  socket.on('data', (chunk) => {
    state.buffer = Buffer.concat([state.buffer, chunk]);
    state.events.emit('data');
  });
  socket.on('close', () => {
    state.closed = true;
    state.events.emit('close');
  });
  socket.on('end', () => {
    state.closed = true;
    state.events.emit('close');
  });
  socket.on('error', (error) => {
    state.error = error;
    state.events.emit('error', error);
  });

  return state;
};

const readHttpHeaders = async (state) => {
  while (true) {
    const delimiter = state.buffer.indexOf('\r\n\r\n');
    if (delimiter !== -1) {
      const headerBuffer = state.buffer.subarray(0, delimiter).toString('utf8');
      const lines = headerBuffer.split('\r\n');
      const statusLine = lines[0] ?? '';
      const statusCode = Number.parseInt(statusLine.split(' ')[1] ?? '0', 10);
      state.buffer = Buffer.from(state.buffer.subarray(delimiter + 4));
      return {
        statusCode,
      };
    }

    await waitForSocketData(state, 3000);
  }
};

const openWebSocketUpgrade = async (path) => {
  const socket = net.createConnection({
    host: '127.0.0.1',
    port: realtimePort,
  });

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  const state = createSocketState(socket);
  const key = randomBytes(16).toString('base64');
  socket.write(
    [
      `GET ${path} HTTP/1.1`,
      `Host: 127.0.0.1:${realtimePort}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      '\r\n',
    ].join('\r\n'),
  );

  const response = await readHttpHeaders(state);
  return {
    socket,
    statusCode: response.statusCode,
    state,
  };
};

const decodeWsFrame = (buffer) => {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) {
      return null;
    }
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  if (buffer.length < offset + payloadLength) {
    return null;
  }

  const payload = buffer.subarray(offset, offset + payloadLength);
  return {
    opcode,
    payload,
    remainder: buffer.subarray(offset + payloadLength),
  };
};

const readNextWsTextFrame = async (socket, state) => {
  while (true) {
    const decoded = decodeWsFrame(state.buffer);
    if (decoded) {
      state.buffer = Buffer.from(decoded.remainder);
      if (decoded.opcode === 0x1) {
        return decoded.payload.toString('utf8');
      }
      if (decoded.opcode === 0x8) {
        throw new Error('received websocket close frame');
      }
      continue;
    }

    await waitForSocketData(state, 3000);
  }
};

const postPublish = async (payload) => {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        method: 'POST',
        host: '127.0.0.1',
        port: realtimePort,
        path: '/publish',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body).toString(),
        },
      },
      (response) => {
        let responseBody = '';
        response.on('data', (chunk) => {
          responseBody += chunk.toString('utf8');
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: responseBody.length > 0 ? JSON.parse(responseBody) : {},
          });
        });
      },
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`realtime server exited during startup on port ${realtimePort} (code ${serverProcess.exitCode})`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${realtimePort}/health/live`);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(`realtime server failed to become healthy on port ${realtimePort}`);
};

const startRealtimeServer = () => {
  serverProcess = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      REALTIME_PORT: String(realtimePort),
      REALTIME_AUTH_REQUIRED: 'true',
      JWT_ACCESS_SECRET,
    },
    stdio: 'ignore',
  });
  serverProcess.unref();
};

const waitForExit = (processHandle) =>
  new Promise((resolve) => {
    if (!processHandle || processHandle.exitCode !== null) {
      resolve();
      return;
    }

    processHandle.once('exit', () => {
      resolve();
    });
  });

const stopRealtimeServer = async () => {
  if (!serverProcess) {
    return;
  }

  if (serverProcess.exitCode === null) {
    serverProcess.kill('SIGKILL');
    await waitForExit(serverProcess);
  }

  serverProcess = undefined;
};

before(async () => {
  let lastStartupError;
  for (let portOffset = 0; portOffset < MAX_STARTUP_PORT_ATTEMPTS; portOffset += 1) {
    realtimePort = BASE_REALTIME_PORT + portOffset;
    startRealtimeServer();

    try {
      await waitForHealth();
      lastStartupError = null;
      break;
    } catch (error) {
      lastStartupError = error;
      await stopRealtimeServer();
    }
  }

  if (lastStartupError) {
    throw lastStartupError;
  }

  exitCleanupHandler = () => {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGKILL');
    }
  };
  process.on('exit', exitCleanupHandler);
});

after(async () => {
  if (exitCleanupHandler) {
    process.off('exit', exitCleanupHandler);
    exitCleanupHandler = undefined;
  }

  await stopRealtimeServer();
});

test('rejects unauthenticated websocket upgrade requests', async () => {
  const connection = await openWebSocketUpgrade('/ws');
  assert.equal(connection.statusCode, 401);
  connection.socket.destroy();
});

test('accepts authenticated websocket upgrades and delivers published messages', async () => {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signAccessToken(
    {
      sub: 'stage17-user-1',
      email: 'ws-user@local.test',
      role: 'member',
      type: 'access',
      iat: now,
      exp: now + 120,
    },
    JWT_ACCESS_SECRET,
  );

  const connection = await openWebSocketUpgrade(`/ws?accessToken=${encodeURIComponent(accessToken)}`);
  assert.equal(connection.statusCode, 101);

  const connectedMessage = JSON.parse(await readNextWsTextFrame(connection.socket, connection.state));
  assert.equal(connectedMessage.event, 'connected');
  assert.equal(connectedMessage.userId, 'stage17-user-1');

  const publishResponse = await postPublish({
    event: 'stage17.delivery',
    data: {
      message: 'hello-over-websocket',
    },
  });
  assert.equal(publishResponse.statusCode, 202);
  assert.equal(publishResponse.body.accepted, true);

  const deliveryMessage = JSON.parse(await readNextWsTextFrame(connection.socket, connection.state));
  assert.equal(deliveryMessage.event, 'stage17.delivery');
  assert.equal(deliveryMessage.data.message, 'hello-over-websocket');
  assert.equal(deliveryMessage.transport, 'websocket');

  connection.socket.destroy();
});
