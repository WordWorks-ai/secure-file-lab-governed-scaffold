import { createServer } from 'node:http';

const port = Number(process.env.PREVIEW_PORT ?? 3011);

const server = createServer((req, res) => {
  if (req.url === '/health/live') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ service: 'preview', status: 'ok' }));
    return;
  }

  if (req.url === '/v1/preview') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'baseline', message: 'preview conversion shell ready' }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not Found' }));
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`preview baseline listening on ${port}\n`);
});
