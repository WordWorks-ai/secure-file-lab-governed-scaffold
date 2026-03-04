import { createServer } from 'node:http';

const port = Number(process.env.DLP_PORT ?? 3013);

const server = createServer((req, res) => {
  if (req.url === '/health/live') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ service: 'dlp', status: 'ok' }));
    return;
  }

  if (req.url === '/v1/dlp/evaluate' && req.method === 'POST') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        policyId: 'dlp-baseline-v1',
        verdict: 'allow',
        enforcementAction: 'allow',
        matches: [],
      }),
    );
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not Found' }));
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`dlp baseline listening on ${port}\n`);
});
