const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { AwsClient } = require('aws4fetch');
const { TRAITS_PATH, GENERATED_DIR } = require('./traitsStore');
const { readJson, writeJson } = require('./jsonFiles');

const DIR = path.join(TRAITS_PATH, GENERATED_DIR, 'backup');
const STATUS_PATH = path.join(DIR, 'status.json');
const MANIFEST_PATH = path.join(DIR, 'manifest.json');
const CADA_MS = 24 * 60 * 60 * 1000;
const REVISAR_MS = 60 * 60 * 1000;
const EXCLUIDOS = ['thumbs', 'staking-thumbs', 'og', 'explore', 'backup', 'staking/cards'].map(d => `${GENERATED_DIR}/${d}`);
const BINARIOS = new Set(['.png', '.gif', '.webp', '.jpg', '.jpeg', '.bmp', '.mp4', '.webm', '.ttf', '.woff', '.woff2']);
const SUBIDAS_A_LA_VEZ = 4;

function config() {
    const endpoint = (process.env.BACKUP_S3_ENDPOINT || '').trim().replace(/\/+$/, '');
    const bucket = (process.env.BACKUP_S3_BUCKET || '').trim();
    const accessKeyId = (process.env.BACKUP_S3_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (process.env.BACKUP_S3_SECRET_ACCESS_KEY || '').trim();
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
    return { endpoint, bucket, accessKeyId, secretAccessKey, region: (process.env.BACKUP_S3_REGION || 'auto').trim() };
}

const isConfigured = () => Boolean(config());

function bucket(cfg = config()) {
    if (!cfg) throw new Error('Backups are not set up.');
    const aws = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: 's3', region: cfg.region });
    const url = key => `${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const pedir = async (key, init) => {
        const r = await aws.fetch(url(key), init);
        if (!r.ok && r.status !== 404) throw new Error(`${init?.method || 'GET'} ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
        return r;
    };
    return {
        put: (key, body, contentType = 'application/octet-stream') =>
            pedir(key, { method: 'PUT', body, headers: { 'content-type': contentType } }),
        get: async key => {
            const r = await pedir(key);
            return r.status === 404 ? null : Buffer.from(await r.arrayBuffer());
        },
        list: async prefix => {
            const keys = [];
            let token = null;
            do {
                const q = new URLSearchParams({ 'list-type': '2', prefix });
                if (token) q.set('continuation-token', token);
                const r = await aws.fetch(`${cfg.endpoint}/${cfg.bucket}?${q}`);
                if (!r.ok) throw new Error(`LIST ${prefix}: ${r.status} ${(await r.text()).slice(0, 200)}`);
                const xml = await r.text();
                for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(desescapar(m[1]));
                token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
                    ? desescapar(xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] ?? '') || null
                    : null;
            } while (token);
            return keys;
        }
    };
}

function desescapar(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function recorrer(raiz = TRAITS_PATH) {
    const archivos = [];
    const entrar = rel => {
        let entradas;
        try {
            entradas = fs.readdirSync(path.join(raiz, rel), { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entradas) {
            const hijo = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) {
                if (!EXCLUIDOS.includes(hijo) && e.name !== 'lost+found') entrar(hijo);
            } else if (e.isFile() && !e.name.endsWith('.tmp')) {
                archivos.push(hijo);
            }
        }
    };
    entrar('');
    return archivos;
}

const esBinario = rel => BINARIOS.has(path.extname(rel).toLowerCase());

function armarSnapshot(raiz = TRAITS_PATH) {
    const files = {};
    for (const rel of recorrer(raiz).filter(r => !esBinario(r))) {
        files[rel] = fs.readFileSync(path.join(raiz, rel), 'utf8');
    }
    return { createdAt: new Date().toISOString(), files };
}

async function subirEspejo(b, raiz, alSubir) {
    const manifest = readJson(MANIFEST_PATH, {});
    const pendientes = recorrer(raiz).filter(esBinario).filter(rel => {
        const st = fs.statSync(path.join(raiz, rel));
        return manifest[rel] !== `${st.size}:${st.mtimeMs}`;
    });
    let bytes = 0;
    let hechos = 0;
    const siguiente = async () => {
        while (pendientes.length) {
            const rel = pendientes.shift();
            const archivo = path.join(raiz, rel);
            let st;
            let datos;
            try {
                st = fs.statSync(archivo);
                datos = fs.readFileSync(archivo);
            } catch {
                continue;
            }
            await b.put(`files/${rel}`, datos);
            manifest[rel] = `${st.size}:${st.mtimeMs}`;
            bytes += datos.length;
            if (++hechos % 50 === 0) writeJson(MANIFEST_PATH, manifest);
            alSubir?.(hechos);
        }
    };
    await Promise.all(Array.from({ length: SUBIDAS_A_LA_VEZ }, siguiente));
    writeJson(MANIFEST_PATH, manifest);
    return { files: hechos, bytes };
}

let corriendo = null;

function run() {
    if (!corriendo) corriendo = correr().finally(() => { corriendo = null; });
    return corriendo;
}

async function correr() {
    const antes = readJson(STATUS_PATH, {});
    const startedAt = new Date().toISOString();
    writeJson(STATUS_PATH, { ...antes, running: true, lastAttemptAt: startedAt });
    try {
        const b = bucket();
        const snapshot = armarSnapshot();
        const gz = zlib.gzipSync(JSON.stringify(snapshot));
        const key = `snapshots/${snapshot.createdAt.replace(/:/g, '-')}.json.gz`;
        await b.put(key, gz, 'application/gzip');
        const espejo = await subirEspejo(b, TRAITS_PATH);
        const last = {
            snapshot: key,
            dataFiles: Object.keys(snapshot.files).length,
            snapshotBytes: gz.length,
            uploadedFiles: espejo.files,
            uploadedBytes: espejo.bytes,
            startedAt,
            finishedAt: new Date().toISOString()
        };
        writeJson(STATUS_PATH, { lastSuccessAt: last.finishedAt, lastAttemptAt: startedAt, lastError: null, last, running: false });
        console.log(`[backup] ${key}: ${last.dataFiles} archivos de datos, ${espejo.files} archivos nuevos subidos.`);
        return last;
    } catch (error) {
        writeJson(STATUS_PATH, { ...antes, lastAttemptAt: startedAt, lastError: error.message, running: false });
        console.error(`[backup] Fallo: ${error.message}`);
        throw error;
    }
}

function status() {
    const s = readJson(STATUS_PATH, {});
    return {
        configured: isConfigured(),
        running: Boolean(corriendo),
        lastSuccessAt: s.lastSuccessAt ?? null,
        lastAttemptAt: s.lastAttemptAt ?? null,
        lastError: s.lastError ?? null,
        last: s.last ?? null
    };
}

function startBackupJob() {
    const revisar = () => {
        if (!isConfigured() || corriendo) return;
        const ultimo = Date.parse(readJson(STATUS_PATH, {}).lastSuccessAt ?? '') || 0;
        if (Date.now() - ultimo >= CADA_MS) run().catch(() => {});
    };
    if (!isConfigured()) console.warn('[backup] BACKUP_S3_* no definido: no se hacen backups.');
    setTimeout(revisar, 2 * 60 * 1000);
    setInterval(revisar, REVISAR_MS);
}

module.exports = { isConfigured, bucket, recorrer, armarSnapshot, run, status, startBackupJob };
