const fs = require('fs');
const path = require('path');
const { TRAITS_PATH, GENERATED_DIR } = require('./traitsStore');

const CACHES = new Set(['thumbs', 'staking-thumbs', 'og', 'explore', 'staking/cards'].map(d => `${GENERATED_DIR}/${d}`));
const MEMO_MS = 10 * 60 * 1000;

async function medir(dir) {
    let bytes = 0;
    let files = 0;
    let entradas;
    try {
        entradas = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return { bytes, files };
    }
    for (const e of entradas) {
        const hijo = path.join(dir, e.name);
        if (e.isDirectory()) {
            const sub = await medir(hijo);
            bytes += sub.bytes;
            files += sub.files;
        } else if (e.isFile()) {
            try {
                bytes += (await fs.promises.stat(hijo)).size;
                files++;
            } catch { /* se borro mientras tanto */ }
        }
    }
    return { bytes, files };
}

async function carpetas() {
    const lista = [];
    const raiz = await fs.promises.readdir(TRAITS_PATH, { withFileTypes: true }).catch(() => []);
    for (const e of raiz.filter(e => e.isDirectory() && e.name !== GENERATED_DIR && e.name !== 'lost+found')) {
        lista.push({ path: e.name, ...(await medir(path.join(TRAITS_PATH, e.name))) });
    }
    const generados = await fs.promises.readdir(path.join(TRAITS_PATH, GENERATED_DIR), { withFileTypes: true }).catch(() => []);
    for (const e of generados.filter(e => e.isDirectory())) {
        const rel = `${GENERATED_DIR}/${e.name}`;
        if (e.name === 'staking') {
            const cards = await medir(path.join(TRAITS_PATH, rel, 'cards'));
            const todo = await medir(path.join(TRAITS_PATH, rel));
            lista.push({ path: `${rel}/cards`, ...cards });
            lista.push({ path: rel, bytes: todo.bytes - cards.bytes, files: todo.files - cards.files });
        } else {
            lista.push({ path: rel, ...(await medir(path.join(TRAITS_PATH, rel))) });
        }
    }
    return lista.map(c => ({ ...c, cache: CACHES.has(c.path) })).sort((a, b) => b.bytes - a.bytes);
}

function disco() {
    try {
        const s = fs.statfsSync(TRAITS_PATH);
        const total = s.blocks * s.bsize;
        const free = s.bavail * s.bsize;
        return { total, free, used: total - free };
    } catch {
        return null;
    }
}

let memo = null;

async function diskUsage({ fresh = false } = {}) {
    if (!fresh && memo && Date.now() - memo.at < MEMO_MS) return memo.valor;
    const folders = await carpetas();
    const d = disco();
    const valor = {
        measuredAt: new Date().toISOString(),
        disk: d && { ...d, usedPercent: d.total ? Math.round(d.used * 1000 / d.total) / 10 : null },
        folders,
        cacheBytes: folders.filter(f => f.cache).reduce((n, f) => n + f.bytes, 0)
    };
    memo = { at: Date.now(), valor };
    return valor;
}

module.exports = { diskUsage };
