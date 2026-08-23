import { createServer } from 'node:http';

const port = Number.parseInt(process.env.HTTP_PORT ?? '4023', 10);

const server = createServer((request, response) => {
  if (request.url === '/health' || request.url === '/ready') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'svc-mining-pool' }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'mining.route_unavailable' }));
});

server.listen(port, '0.0.0.0');
