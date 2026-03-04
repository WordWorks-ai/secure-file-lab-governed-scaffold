import http from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number.parseInt(process.env.REALTIME_PORT ?? '3010', 10);
const clients = new Map();

const sendJson = (res, statusCode, body) => {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
};

const broadcast = (event, payload) => {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [, client] of clients) {
    client.write(message);
  }
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health/live') {
    return sendJson(res, 200, { status: 'ok', service: 'realtime', transport: 'sse' });
  }

  if (req.method === 'GET' && req.url === '/stream') {
    const clientId = randomUUID();
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`);
    clients.set(clientId, res);

    req.on('close', () => {
      clients.delete(clientId);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/publish') {
    try {
      const rawBody = await parseBody(req);
      const payload = rawBody.length > 0 ? JSON.parse(rawBody) : {};
      const event = typeof payload.event === 'string' && payload.event.length > 0 ? payload.event : 'message';
      const data = payload.data ?? {};

      broadcast(event, {
        id: randomUUID(),
        sentAt: new Date().toISOString(),
        data,
      });

      return sendJson(res, 202, { accepted: true, subscribers: clients.size });
    } catch (_error) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
  }

  return sendJson(res, 404, { error: 'not found' });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[realtime] listening on ${port}`);
});
