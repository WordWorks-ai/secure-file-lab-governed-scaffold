import http from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const port = Number.parseInt(process.env.REALTIME_PORT ?? '3010', 10);
const authRequired = (process.env.REALTIME_AUTH_REQUIRED ?? 'true').toLowerCase() !== 'false';
const jwtAccessSecret = process.env.JWT_ACCESS_SECRET ?? '';

const sseClients = new Map();
const wsClients = new Map();
let publishedMessagesTotal = 0;
let websocketConnectionsTotal = 0;

const sendJson = (res, statusCode, body) => {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
};

const parseBody = async (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

const base64UrlDecodeUtf8 = (value) => Buffer.from(value, 'base64url').toString('utf8');

const safeCompare = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyJwtAccessToken = (token) => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecodeUtf8(encodedHeader));
    payload = JSON.parse(base64UrlDecodeUtf8(encodedPayload));
  } catch {
    return null;
  }

  if (header?.alg !== 'HS256') {
    return null;
  }

  if (!jwtAccessSecret) {
    return null;
  }

  const expectedSignature = createHmac('sha256', jwtAccessSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  if (!safeCompare(expectedSignature, encodedSignature)) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) {
    return null;
  }

  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) {
    return null;
  }

  if (payload.type && payload.type !== 'access') {
    return null;
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return null;
  }

  return payload;
};

const getBearerTokenFromAuthorizationHeader = (req) => {
  const rawHeader = req.headers?.authorization;
  if (!rawHeader || Array.isArray(rawHeader)) {
    return null;
  }

  const [scheme, token] = rawHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token.trim();
};

const getAccessToken = (req, requestUrl) => {
  const queryToken = requestUrl.searchParams.get('accessToken');
  if (queryToken && queryToken.trim().length > 0) {
    return queryToken.trim();
  }
  return getBearerTokenFromAuthorizationHeader(req);
};

const authenticateRequest = (req, requestUrl) => {
  if (!authRequired) {
    return {
      sub: 'anonymous',
      email: null,
      role: 'anonymous',
    };
  }

  const token = getAccessToken(req, requestUrl);
  if (!token) {
    return null;
  }

  return verifyJwtAccessToken(token);
};

const encodeWsFrame = (opcode, payloadBuffer) => {
  const payloadLength = payloadBuffer.length;
  if (payloadLength < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, payloadLength]), payloadBuffer]);
  }

  if (payloadLength < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
    return Buffer.concat([header, payloadBuffer]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payloadLength), 2);
  return Buffer.concat([header, payloadBuffer]);
};

const decodeWsFrame = (buffer) => {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
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

  let maskKey;
  if (masked) {
    if (buffer.length < offset + 4) {
      return null;
    }
    maskKey = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLength) {
    return null;
  }

  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
  if (masked && maskKey) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= maskKey[index % 4];
    }
  }

  return {
    opcode,
    payload,
    remainder: buffer.subarray(offset + payloadLength),
  };
};

const sendWsText = (socket, payload) => {
  socket.write(encodeWsFrame(0x1, Buffer.from(payload, 'utf8')));
};

const sendWsPong = (socket, payload) => {
  socket.write(encodeWsFrame(0xa, payload));
};

const sendUnauthorizedUpgradeResponse = (socket) => {
  const payload = JSON.stringify({ error: 'unauthorized' });
  socket.write(
    `HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`,
  );
  socket.destroy();
};

const buildMetricsPayload = () => [
  '# HELP sfl_realtime_info Static info metric for the realtime service.',
  '# TYPE sfl_realtime_info gauge',
  'sfl_realtime_info{service="realtime",phase="phase-17-realtime-websocket-baseline"} 1',
  '# HELP sfl_realtime_connected_clients Active realtime stream connections.',
  '# TYPE sfl_realtime_connected_clients gauge',
  `sfl_realtime_connected_clients ${sseClients.size + wsClients.size}`,
  '# HELP sfl_realtime_sse_connected_clients Active SSE stream connections.',
  '# TYPE sfl_realtime_sse_connected_clients gauge',
  `sfl_realtime_sse_connected_clients ${sseClients.size}`,
  '# HELP sfl_realtime_ws_connected_clients Active WebSocket stream connections.',
  '# TYPE sfl_realtime_ws_connected_clients gauge',
  `sfl_realtime_ws_connected_clients ${wsClients.size}`,
  '# HELP sfl_realtime_ws_connections_total Total accepted WebSocket connections.',
  '# TYPE sfl_realtime_ws_connections_total counter',
  `sfl_realtime_ws_connections_total ${websocketConnectionsTotal}`,
  '# HELP sfl_realtime_published_messages_total Total published realtime messages.',
  '# TYPE sfl_realtime_published_messages_total counter',
  `sfl_realtime_published_messages_total ${publishedMessagesTotal}`,
].join('\n');

const broadcast = (event, payload) => {
  const sseMessage = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [, client] of sseClients) {
    client.write(sseMessage);
  }

  const wsMessage = JSON.stringify({
    event,
    ...payload,
    transport: 'websocket',
  });
  for (const [, client] of wsClients) {
    sendWsText(client.socket, wsMessage);
  }
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && requestUrl.pathname === '/health/live') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'realtime',
      transports: ['sse', 'websocket'],
      authRequired,
    });
  }

  if (req.method === 'GET' && req.url === '/metrics') {
    res.writeHead(200, {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(buildMetricsPayload());
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/stream') {
    const identity = authenticateRequest(req, requestUrl);
    if (!identity) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }

    const clientId = randomUUID();
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        clientId,
        userId: identity.sub,
        transport: 'sse',
      })}\n\n`,
    );
    sseClients.set(clientId, res);

    req.on('close', () => {
      sseClients.delete(clientId);
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/publish') {
    try {
      const rawBody = await parseBody(req);
      const payload = rawBody.length > 0 ? JSON.parse(rawBody) : {};
      const event = typeof payload.event === 'string' && payload.event.length > 0 ? payload.event : 'message';
      const data = payload.data ?? {};

      const envelope = {
        id: randomUUID(),
        sentAt: new Date().toISOString(),
        data,
      };
      broadcast(event, envelope);
      publishedMessagesTotal += 1;

      return sendJson(res, 202, {
        accepted: true,
        subscribers: {
          total: sseClients.size + wsClients.size,
          sse: sseClients.size,
          websocket: wsClients.size,
        },
      });
    } catch (_error) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
  }

  if (req.method === 'GET' && requestUrl.pathname === '/ws') {
    return sendJson(res, 426, { error: 'upgrade required' });
  }

  return sendJson(res, 404, { error: 'not found' });
});

server.on('upgrade', (req, socket) => {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  if (requestUrl.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const identity = authenticateRequest(req, requestUrl);
  if (!identity) {
    sendUnauthorizedUpgradeResponse(socket);
    return;
  }

  const upgradeHeader = req.headers.upgrade;
  const websocketKey = req.headers['sec-websocket-key'];
  const websocketVersion = req.headers['sec-websocket-version'];

  if (upgradeHeader !== 'websocket' || typeof websocketKey !== 'string' || websocketVersion !== '13') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const acceptKey = createHash('sha1')
    .update(`${websocketKey}${WS_MAGIC}`)
    .digest('base64');
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n'),
  );

  const clientId = randomUUID();
  websocketConnectionsTotal += 1;
  const client = {
    id: clientId,
    socket,
    userId: identity.sub,
  };
  wsClients.set(clientId, client);
  sendWsText(
    socket,
    JSON.stringify({
      event: 'connected',
      clientId,
      userId: identity.sub,
      transport: 'websocket',
    }),
  );

  let inboundBuffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    inboundBuffer = Buffer.concat([inboundBuffer, chunk]);
    while (true) {
      const decoded = decodeWsFrame(inboundBuffer);
      if (!decoded) {
        break;
      }

      inboundBuffer = Buffer.from(decoded.remainder);
      if (decoded.opcode === 0x8) {
        socket.end();
        return;
      }
      if (decoded.opcode === 0x9) {
        sendWsPong(socket, decoded.payload);
      }
    }
  });

  const cleanup = () => {
    wsClients.delete(client.id);
  };
  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', cleanup);
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[realtime] listening on ${port}`);
});
