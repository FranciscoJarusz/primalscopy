// Pone como apodo el username de OpenSea a las wallets del admin que no
// tienen nombre. Sin --apply solo muestra lo que haria.
//
//   $env:OPENSEA_API_KEY="..."; $env:ADMIN_TOKEN="..."; node backend/scripts/nicknames-opensea.js [--apply]

const API = process.env.BACKEND_API || 'https://primalscopy-production.up.railway.app/api';
const OPENSEA_API_KEY = (process.env.OPENSEA_API_KEY || '').trim();
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();
const APLICAR = process.argv.includes('--apply');
const FORMATO = /^[A-Za-z0-9_]{3,20}$/;
const EXCLUIDOS = new Set(['fuckbidbots', 'fuckoffspy', 'bonghole', 'gspotsalt', 'trout_test']);

function esLaWallet(nombre, wallet) {
    const n = nombre.toLowerCase().replace(/^0x/, '');
    const w = wallet.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]+$/.test(n)) return false;
    if (w.includes(n)) return true;
    for (let i = 1; i < n.length; i++) {
        if (w.startsWith(n.slice(0, i)) && w.endsWith(n.slice(i))) return true;
    }
    return false;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function admin(ruta, init = {}) {
    const r = await fetch(`${API}/admin${ruta}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${ADMIN_TOKEN}`,
            ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
}

async function usernameOpenSea(wallet) {
    for (let intento = 0; intento < 5; intento++) {
        const r = await fetch(`https://api.opensea.io/api/v2/accounts/${wallet}`, {
            headers: { 'x-api-key': OPENSEA_API_KEY, accept: 'application/json' },
        });
        if (r.status === 429) {
            await esperar(2000 * (intento + 1));
            continue;
        }
        if (r.status === 404 || r.status === 400) return null;
        if (!r.ok) throw new Error(`OpenSea HTTP ${r.status}`);
        const d = await r.json();
        return (d.username || '').trim() || null;
    }
    throw new Error('OpenSea rate limit');
}

async function main() {
    if (!OPENSEA_API_KEY || !ADMIN_TOKEN) {
        console.error('Faltan OPENSEA_API_KEY o ADMIN_TOKEN.');
        process.exit(1);
    }
    const holders = await admin('/holders');
    const sinNombre = holders.filter((h) => !h.nickname);
    const usados = new Set(holders.filter((h) => h.nickname).map((h) => h.nickname.toLowerCase()));
    console.log(`${holders.length} wallets, ${sinNombre.length} sin nombre. ${APLICAR ? 'APLICANDO' : 'Prueba (sin --apply)'}\n`);

    const res = { puestos: [], sinUsername: 0, invalidos: [], repetidos: [], excluidos: [], errores: [] };
    for (const [i, h] of sinNombre.entries()) {
        let nombre;
        try {
            nombre = await usernameOpenSea(h.wallet);
        } catch (e) {
            res.errores.push(`${h.wallet}: ${e.message}`);
            continue;
        } finally {
            await esperar(350);
        }
        process.stdout.write(`\r${i + 1}/${sinNombre.length}`);
        if (!nombre || /^unnamed$/i.test(nombre)) {
            res.sinUsername++;
            continue;
        }
        nombre = nombre.replace(/-/g, '_');
        if (EXCLUIDOS.has(nombre.toLowerCase()) || /fuck/i.test(nombre) || esLaWallet(nombre, h.wallet)) {
            res.excluidos.push(`${h.wallet}: ${nombre}`);
            continue;
        }
        if (!FORMATO.test(nombre)) {
            res.invalidos.push(`${h.wallet}: ${nombre}`);
            continue;
        }
        if (usados.has(nombre.toLowerCase())) {
            res.repetidos.push(`${h.wallet}: ${nombre}`);
            continue;
        }
        if (APLICAR) {
            try {
                await admin(`/nicknames/${h.wallet}`, { method: 'PUT', body: JSON.stringify({ nickname: nombre }) });
            } catch (e) {
                res.errores.push(`${h.wallet}: ${nombre} (${e.message})`);
                continue;
            }
        }
        usados.add(nombre.toLowerCase());
        res.puestos.push(`${h.wallet}: ${nombre}`);
    }

    console.log(`\n\n${APLICAR ? 'Puestos' : 'Se pondrian'} (${res.puestos.length}):`);
    res.puestos.forEach((l) => console.log('  ' + l));
    console.log(`\nSin username en OpenSea: ${res.sinUsername}`);
    for (const [titulo, lista] of [
        ['No cumplen el formato (3-20, letras, numeros o _)', res.invalidos],
        ['Nombre ya usado por otra wallet', res.repetidos],
        ['Excluidos (la propia wallet, malas palabras o de prueba)', res.excluidos],
        ['Errores', res.errores],
    ]) {
        if (!lista.length) continue;
        console.log(`\n${titulo} (${lista.length}):`);
        lista.forEach((l) => console.log('  ' + l));
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
