#!/usr/bin/env node
/**
 * Labeled sandbox reverse-proxy. Does not restyle the Vue app.
 * Injects a fixed banner so a shared URL cannot be mistaken for live money.
 */
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const provenPath = join(REPO, '.artifacts', 'uiproof', 'provenance.json');
if (!existsSync(provenPath)) {
  console.error('no provenance.json — pnpm ui:boot first');
  process.exit(1);
}
const proven = JSON.parse(readFileSync(provenPath, 'utf8'));
const TARGET = `http://127.0.0.1:${proven.port}`;
const PORT = Number(process.env.SHARE_PROXY_PORT || 18090);

const BANNER = `<div id="ix-sandbox-banner" style="position:sticky;top:0;z-index:2147483647;background:#1a1208;color:#f3e6d0;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;padding:8px 12px;border-bottom:1px solid #ff6b00;letter-spacing:.02em">INTAFACED sandbox · not live money · GitHub main ${SHA} · APIs may be down on purpose</div>`;
const DARK_LOCK = `<meta name="color-scheme" content="dark"><style>html,body,#app{background:#000!important;color-scheme:dark;overscroll-behavior:none!important}</style>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', TARGET);
  const headers = { ...req.headers, host: `127.0.0.1:${proven.port}` };
  delete headers['accept-encoding'];
  const proxy = http.request(
    {
      hostname: '127.0.0.1',
      port: proven.port,
      path: url.pathname + url.search,
      method: req.method,
      headers,
    },
    (up) => {
      const ctype = String(up.headers['content-type'] || '');
      const html = ctype.includes('text/html');
      const outHeaders = { ...up.headers };
      if (html) delete outHeaders['content-length'];
      res.writeHead(up.statusCode || 502, outHeaders);
      if (!html) {
        up.pipe(res);
        return;
      }
      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        if (body.includes('id="ix-sandbox-banner"')) {
          res.end(body);
          return;
        }
        if (body.includes('</head>') && !body.includes('color-scheme')) {
          body = body.replace('</head>', `${DARK_LOCK}</head>`);
        }
        if (body.includes('<body')) {
          body = body.replace(/<body([^>]*)>/i, `<body$1>${BANNER}`);
        } else {
          body = BANNER + body;
        }
        res.end(body);
      });
    },
  );
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('sandbox proxy: origin down');
  });
  req.pipe(proxy);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[share-proxy] http://0.0.0.0:${PORT} → ${TARGET} sha ${SHA}`);
});
