import { createServer } from 'node:http';

const port = Number(process.env.OCR_PORT ?? 3012);

const server = createServer((req, res) => {
  if (req.url === '/health/live') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ service: 'ocr', status: 'ok' }));
    return;
  }

  if (req.url === '/v1/ocr') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'baseline', message: 'ocr extraction shell ready' }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not Found' }));
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`ocr baseline listening on ${port}\n`);
});
