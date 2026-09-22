// Proxy mínimo: supabase-js pega a `${URL}/rest/v1/...`; PostgREST sirve en la raíz.
// Saca el prefijo y reenvía. Sólo para el sandbox local (tests/local/up.sh).
import http from 'node:http';
const [port, target] = [Number(process.argv[2] || 54321), process.argv[3] || 'http://127.0.0.1:54323'];
const t = new URL(target);
http.createServer((req, res) => {
  const path = req.url.replace(/^\/rest\/v1/, '') || '/';
  const up = http.request({ host: t.hostname, port: t.port, method: req.method, path, headers: { ...req.headers, host: t.host } }, r => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  up.on('error', e => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(port, '127.0.0.1', () => console.log(`proxy :${port} → ${target}`));
