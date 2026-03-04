import http from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number.parseInt(process.env.WEBHOOK_SINK_PORT ?? '3020', 10);
const maxEvents = Number.parseInt(process.env.WEBHOOK_SINK_MAX_EVENTS ?? '200', 10);
const events = [];

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

const trimEvents = () => {
  while (events.length > maxEvents) {
    events.shift();
  }
};

const normalizeHeaders = (headers) => {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value.join(', ') : (value ?? '');
  }
  return normalized;
};

const parseLimit = (rawLimit) => {
  if (!rawLimit) {
    return 50;
  }
  const value = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return 50;
  }
  return Math.min(value, 200);
};

const captureEvent = async (req, res) => {
  try {
    const rawBody = await parseBody(req);
    let parsedBody = rawBody;

    if ((req.headers['content-type'] ?? '').includes('application/json') && rawBody.length > 0) {
      parsedBody = JSON.parse(rawBody);
    }

    const event = {
      id: randomUUID(),
      method: req.method,
      path: req.url,
      headers: normalizeHeaders(req.headers),
      body: parsedBody,
      receivedAt: new Date().toISOString(),
    };

    events.push(event);
    trimEvents();

    sendJson(res, 202, {
      accepted: true,
      id: event.id,
      storedEvents: events.length,
    });
  } catch (_error) {
    sendJson(res, 400, { error: 'invalid payload' });
  }
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health/live') {
    return sendJson(res, 200, {
      service: 'webhook-sink',
      status: 'ok',
      storedEvents: events.length,
    });
  }

  if (req.method === 'POST' && req.url === '/v1/webhooks/capture') {
    return captureEvent(req, res);
  }

  if (req.method === 'GET' && req.url?.startsWith('/v1/webhooks/events')) {
    const requestUrl = new URL(req.url, 'http://localhost');
    const limit = parseLimit(requestUrl.searchParams.get('limit'));
    const payload = events.slice(-limit).reverse();
    return sendJson(res, 200, { count: payload.length, events: payload });
  }

  if (req.method === 'DELETE' && req.url === '/v1/webhooks/events') {
    const cleared = events.length;
    events.length = 0;
    return sendJson(res, 200, { cleared });
  }

  return sendJson(res, 404, { error: 'not found' });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[webhook-sink] listening on ${port}`);
});
