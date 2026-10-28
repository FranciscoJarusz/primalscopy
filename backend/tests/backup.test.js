// Prueba el backup contra un S3 falso y el limite de pedidos del server.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { promisify } = require('util');

const PORT = 39881;
const S3_PORT = 39882;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'admin-solo-para-tests';

require('sharp').cache(false);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-backup-'));
const DESTINO = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-restore-'));
process.env.TRAITS_PATH = TMP;
process.env.ADMIN_TOKEN = ADMIN;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.PORT = String(PORT);
process.env.RATE_LIMIT_WRITES = '3';
process.env.RATE_LIMIT_LOGIN = '2';
const S3 = {
    BACKUP_S3_ENDPOINT: `http://localhost:${S3_PORT}`,
    BACKUP_S3_BUCKET: 'primal',
    BACKUP_S3_ACCESS_KEY_ID: 'id-de-prueba',
    BACKUP_S3_SECRET_ACCESS_KEY: 'secreto-de-prueba'
};
Object.assign(process.env, S3);

const escribir = (rel, contenido) => {
    const archivo = path.join(TMP, rel);
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, contenido);
};
escribir('HAT/_GLOBAL/Crown.gif', 'GIF89a-corona');
escribir('_generated/staking/wallets.json', '{"0xabc":{"earned":10,"spent":0}}');
escribir('_generated/staking/history.jsonl', '{"event":"grant"}\n');
escribir('_generated/metadata/7', '{"name":"Primal #7"}');
escribir('_generated/images/7-123.png', 'png-del-7');
escribir('_generated/staking/prizes/premio.webp', 'webp-premio');
escribir('_generated/thumbs/HAT/Crown.webp', 'cache');
escribir('_generated/og/holder.png', 'cache');
escribir('_generated/staking/cards/x.png', 'cache');
escribir('_generated/explore/index.json', '{}');
escribir('_generated/staking/wallets.json.123.tmp', 'a medio escribir');

const objetos = new Map();
let pedidosSinFirma = 0;
const s3 = http.createServer((req, res) => {
    if (!String(req.headers.authorization || '').startsWith('AWS4-HMAC-SHA256')) pedidosSinFirma++;
    const url = new URL(req.url, 'http://x');
    const [, bucket, ...resto] = url.pathname.split('/');
    const key = resto.map(decodeURIComponent).join('/');
    if (bucket !== 'primal') return res.writeHead(404).end();
    if (req.method === 'PUT') {
        const partes = [];
        req.on('data', p => partes.push(p));
        req.on('end', () => {
            objetos.set(key, Buffer.concat(partes));
            res.writeHead(200).end();
        });
        return;
    }
    if (!key && url.searchParams.get('list-type') === '2') {
        const prefix = url.searchParams.get('prefix') || '';
        const todas = [...objetos.keys()].filter(k => k.startsWith(prefix)).sort();
        const desde = Number(url.searchParams.get('continuation-token') || 0);
        const pagina = todas.slice(desde, desde + 2);
        const sigue = desde + 2 < todas.length;
        res.writeHead(200, { 'content-type': 'application/xml' });
        return res.end(`<ListBucketResult>${pagina.map(k => `<Contents><Key>${k.replace(/&/g, '&amp;')}</Key></Contents>`).join('')}`
            + `<IsTruncated>${sigue}</IsTruncated>${sigue ? `<NextContinuationToken>${desde + 2}</NextContinuationToken>` : ''}</ListBucketResult>`);
    }
    if (!objetos.has(key)) return res.writeHead(404).end('NoSuchKey');
    res.writeHead(200).end(objetos.get(key));
});

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const admin = { 'content-type': 'application/json', authorization: `Bearer ${ADMIN}` };
const desde = ip => ({ 'content-type': 'application/json', 'x-forwarded-for': ip });

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            if ((await fetch(`${BASE}/api/admin/session`, { headers: admin })).ok) return;
        } catch { /* todavia no levanto */ }
        await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('El server no arranco.');
}

function snapshot(key) {
    return JSON.parse(zlib.gunzipSync(objetos.get(key)).toString('utf8'));
}

async function main() {
    await new Promise(res => s3.listen(S3_PORT, res));
    require('../server.js');
    await waitForServer();
    const backup = require('../lib/backup');

    console.log('\nPrimer backup');
    let r = await fetch(`${BASE}/api/admin/backup`, { headers: admin });
    let st = await r.json();
    check('sin backups todavia', r.ok && st.configured && st.lastSuccessAt === null, JSON.stringify(st));
    check('sin token de admin no', (await fetch(`${BASE}/api/admin/backup`)).status === 401);
    let last = await backup.run();
    check('todo firmado', pedidosSinFirma === 0, String(pedidosSinFirma));
    const snap = snapshot(last.snapshot);
    const datos = Object.keys(snap.files).sort();
    check('el snapshot trae los datos, con la metadata sin extension',
        datos.filter(d => !d.startsWith('.')).join() === '_generated/metadata/7,_generated/staking/history.jsonl,_generated/staking/wallets.json', datos.join());
    check('con su contenido', snap.files['_generated/staking/wallets.json'].includes('"earned":10'));
    const subidos = [...objetos.keys()].filter(k => k.startsWith('files/')).sort();
    check('sube los traits y las imagenes, no los caches ni los temporales',
        subidos.join() === 'files/HAT/_GLOBAL/Crown.gif,files/_generated/images/7-123.png,files/_generated/staking/prizes/premio.webp', subidos.join());
    st = await (await fetch(`${BASE}/api/admin/backup`, { headers: admin })).json();
    check('queda anotado', st.lastSuccessAt && st.last.uploadedFiles === 3 && st.last.dataFiles === datos.length && !st.lastError, JSON.stringify(st));

    console.log('\nLos siguientes');
    await new Promise(res => setTimeout(res, 1100));
    last = await backup.run();
    check('no vuelve a subir lo que no cambio', last.uploadedFiles === 0, JSON.stringify(last));
    check('cada uno deja su snapshot', [...objetos.keys()].filter(k => k.startsWith('snapshots/')).length === 2);
    escribir('HAT/_GLOBAL/Crown.gif', 'GIF89a-corona-nueva');
    escribir('EYES/_GLOBAL/Laser.gif', 'GIF89a-laser');
    last = await backup.run();
    check('sube lo cambiado y lo nuevo', last.uploadedFiles === 2 && objetos.get('files/HAT/_GLOBAL/Crown.gif').toString() === 'GIF89a-corona-nueva',
        JSON.stringify(last));
    const [a, b] = await Promise.all([backup.run(), backup.run()]);
    check('dos a la vez son el mismo', a === b);

    console.log('\nRestaurar');
    const correrScript = async (...args) => (await promisify(execFile)(process.execPath,
        [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), ...args], { env: { ...process.env } })).stdout;
    const lista = await correrScript('list');
    check('lista los snapshots', lista.includes(`${[...objetos.keys()].filter(k => k.startsWith('snapshots/')).length} snapshots.`), lista);
    await correrScript(DESTINO);
    const leer = rel => fs.readFileSync(path.join(DESTINO, rel), 'utf8');
    check('vuelven los datos', leer('_generated/staking/wallets.json') === fs.readFileSync(path.join(TMP, '_generated/staking/wallets.json'), 'utf8')
        && leer('_generated/metadata/7') === '{"name":"Primal #7"}');
    check('y los traits', leer('HAT/_GLOBAL/Crown.gif') === 'GIF89a-corona-nueva' && leer('EYES/_GLOBAL/Laser.gif') === 'GIF89a-laser');
    check('los caches no', !fs.existsSync(path.join(DESTINO, '_generated/thumbs')));
    let rechazo = null;
    try {
        await correrScript(DESTINO);
    } catch (error) {
        rechazo = error.stderr;
    }
    check('nunca escribe en una carpeta con cosas', rechazo && rechazo.includes('no esta vacia'), String(rechazo));
    objetos.set('files/../afuera.txt', Buffer.from('x'));
    const otro = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-restore-'));
    fs.rmSync(otro, { recursive: true });
    try {
        await correrScript(otro);
        rechazo = null;
    } catch (error) {
        rechazo = error.stderr;
    }
    check('una ruta que se sale de la carpeta se rechaza', rechazo && rechazo.includes('Ruta invalida'), String(rechazo));
    objetos.delete('files/../afuera.txt');
    fs.rmSync(otro, { recursive: true, force: true });

    console.log('\nCuando falla');
    const exito = (await (await fetch(`${BASE}/api/admin/backup`, { headers: admin })).json()).lastSuccessAt;
    process.env.BACKUP_S3_ENDPOINT = 'http://localhost:1';
    let fallo = null;
    try {
        await backup.run();
    } catch (error) {
        fallo = error;
    }
    st = await (await fetch(`${BASE}/api/admin/backup`, { headers: admin })).json();
    check('el error queda anotado y se conserva el ultimo bueno', fallo && st.lastError && st.lastSuccessAt === exito, JSON.stringify(st));
    delete process.env.BACKUP_S3_ENDPOINT;
    r = await fetch(`${BASE}/api/admin/backup`, { method: 'POST', headers: admin });
    check('sin configurar, pedirlo a mano avisa', r.status === 409);
    Object.assign(process.env, S3);
    r = await fetch(`${BASE}/api/admin/backup`, { method: 'POST', headers: admin });
    check('configurado, arranca', r.status === 202);
    await backup.run();

    console.log('\nEspacio');
    const uso = await (await fetch(`${BASE}/api/admin/storage/usage?fresh=1`, { headers: admin })).json();
    const carpeta = p => uso.folders.find(f => f.path === p);
    check('mide cada carpeta y marca los caches', carpeta('_generated/thumbs')?.cache && carpeta('_generated/staking/cards')?.cache
        && !carpeta('_generated/staking')?.cache && carpeta('HAT')?.bytes === 'GIF89a-corona-nueva'.length, JSON.stringify(uso.folders));
    check('staking no cuenta dos veces las tarjetas', carpeta('_generated/staking').files + carpeta('_generated/staking/cards').files
        === fs.readdirSync(path.join(TMP, '_generated/staking'), { recursive: true }).filter(f => fs.statSync(path.join(TMP, '_generated/staking', f)).isFile()).length);
    check('y el disco', uso.disk && uso.disk.total > 0 && uso.disk.usedPercent >= 0, JSON.stringify(uso.disk));

    console.log('\nLimite de pedidos');
    const escrituras = [];
    for (let i = 0; i < 4; i++) escrituras.push((await fetch(`${BASE}/api/promo/redeem`, { method: 'POST', headers: desde('203.0.113.5'), body: '{}' })).status);
    check('la cuarta escritura seguida se frena', escrituras.slice(0, 3).every(s => s !== 429) && escrituras[3] === 429, escrituras.join());
    const frenada = await fetch(`${BASE}/api/promo/redeem`, { method: 'POST', headers: desde('203.0.113.5'), body: '{}' });
    check('con un mensaje', (await frenada.json()).reason === 'rate-limited');
    check('otra IP sigue', (await fetch(`${BASE}/api/promo/redeem`, { method: 'POST', headers: desde('203.0.113.9'), body: '{}' })).status !== 429);
    check('las lecturas no se frenan', (await fetch(`${BASE}/api/staking/config`, { headers: desde('203.0.113.5') })).status !== 429);
    check('el admin no se frena', (await fetch(`${BASE}/api/admin/backup`, { method: 'POST', headers: { ...admin, 'x-forwarded-for': '203.0.113.5' } })).status === 202);
    await backup.run();
    const logins = [];
    for (let i = 0; i < 3; i++) logins.push((await fetch(`${BASE}/api/auth/nonce`, { method: 'POST', headers: desde('198.51.100.7'), body: JSON.stringify({ address: '0x0000000000000000000000000000000000000001' }) })).status);
    check('el login tiene su propio limite', logins[0] !== 429 && logins[2] === 429, logins.join());
    check('local no se frena', (await Promise.all(Array.from({ length: 6 }, () =>
        fetch(`${BASE}/api/promo/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })))).every(x => x.status !== 429));

    console.log(`\n${pass} ok, ${fail} fallas`);
    s3.close();
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.rmSync(DESTINO, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
