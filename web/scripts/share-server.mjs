// Sirve el build (dist/) para compartirlo por un tunel: el dev de Astro manda
// cientos de modulos sueltos y por el tunel tarda demasiado. Hace lo mismo que
// el proxy de astro.config.mjs: /backend/* va al backend local.
//   npm run build (con PUBLIC_BACKEND_URL=/backend/api) y despues
//   node --env-file-if-exists=.env scripts/share-server.mjs
import http from 'node:http';

// Sin esto el build arranca su propio server en el mismo puerto al importarlo.
process.env.ASTRO_NODE_AUTOSTART = 'disabled';
const { handler } = await import('../dist/server/entry.mjs');

const PORT = Number(process.env.PORT || 4321);
const BACKEND = { host: 'localhost', port: 3001 };

http.createServer((req, res) => {
    if (!req.url.startsWith('/backend/')) return handler(req, res);

    const upstream = http.request(
        {
            ...BACKEND,
            method: req.method,
            path: req.url.slice('/backend'.length),
            headers: { ...req.headers, host: `${BACKEND.host}:${BACKEND.port}` },
        },
        (r) => {
            res.writeHead(r.statusCode, r.headers);
            r.pipe(res);
        }
    );
    upstream.on('error', () => {
        res.writeHead(502).end('Backend no disponible');
    });
    req.pipe(upstream);
}).listen(PORT, () => console.log(`Build compartible en http://localhost:${PORT}`));
