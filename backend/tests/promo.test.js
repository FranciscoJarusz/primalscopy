// tests/promo.test.js
//
// Prueba los codigos promocionales: crearlos desde el admin, las reglas del
// canje (limite de usos, vencimiento, uno por wallet, sin Primal), el limite
// de intentos, y que el roll gratis llegue al Forge y se gaste antes que uno
// pagado.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39875;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'admin-solo-para-tests';

const holder = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const otro = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a');
const sinPrimals = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
const adivino = privateKeyToAccount('0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-promo-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.ADMIN_TOKEN = ADMIN;
process.env.PORT = String(PORT);

// Nadie tiene Primals: canjear no tiene que pedirlos.
const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async () => ({ status: 'not-owner' }),
        getTokenOwner: async () => null,
        getPrimalBalance: async () => 0,
        CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000'
    }
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const admin = { 'content-type': 'application/json', authorization: `Bearer ${ADMIN}` };
const post = (url, body, headers = {}) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
});
const crear = body => post(`${BASE}/api/admin/promo`, body, admin);
const canjear = (code, token) => post(`${BASE}/api/promo/redeem`, { code }, token ? { authorization: `Bearer ${token}` } : {});
const codigos = async () => (await (await fetch(`${BASE}/api/admin/promo`, { headers: admin })).json()).codes;

async function login(account) {
    let r = await post(`${BASE}/api/auth/nonce`, { address: account.address });
    const { nonce, message } = await r.json();
    const signature = await account.signMessage({ message });
    r = await post(`${BASE}/api/auth/verify`, { nonce, signature });
    return (await r.json()).token;
}

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            if ((await fetch(`${BASE}/api/admin/session`, { headers: admin })).ok) return;
        } catch { /* todavia no levanto */ }
        await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('El server no arranco.');
}

async function main() {
    require('../server.js');
    await waitForServer();
    const forge = require('../lib/forgeStore');
    const promo = require('../lib/promoStore');

    const holderToken = await login(holder);
    const otroToken = await login(otro);
    const sinPrimalsToken = await login(sinPrimals);
    const adivinoToken = await login(adivino);
    const manana = new Date(Date.now() + 86400000).toISOString();

    console.log('\n--- Crear ---');
    check('sin token de admin no', (await post(`${BASE}/api/admin/promo`, { reward: 'forge-roll', maxUses: 5 })).status === 401);
    check('premio desconocido se rechaza', (await crear({ reward: 'nada', maxUses: 5 })).status === 400);
    check('sin limite de usos se rechaza', (await crear({ reward: 'forge-roll' })).status === 400);
    check('vencimiento pasado se rechaza', (await crear({ reward: 'forge-roll', maxUses: 5, expiresAt: '2020-01-01' })).status === 400);
    check('codigo con espacios se rechaza', (await crear({ code: 'mal codigo', reward: 'forge-roll', maxUses: 5 })).status === 400);

    let r = await crear({ code: ' discord10 ', reward: 'forge-roll', amount: 2, maxUses: 2, expiresAt: manana, note: 'Discord' });
    let c = await r.json();
    check('crea un codigo, en mayusculas', r.status === 201 && c.code === 'DISCORD10' && c.status === 'active' && c.uses === 0);
    check('no se puede repetir', (await crear({ code: 'Discord10', reward: 'forge-roll', maxUses: 1 })).status === 400);
    r = await crear({ reward: 'forge-roll', maxUses: 1 });
    c = await r.json();
    check('sin codigo genera uno', r.status === 201 && /^[A-Z2-9]{8}$/.test(c.code) && c.expiresAt === null);
    const generado = c.code;

    console.log('\n--- Canjear ---');
    check('sin sesion no se puede', (await canjear('DISCORD10')).status === 401);
    r = await canjear('discord10', sinPrimalsToken);
    let d = await r.json();
    check('sin Primals se puede, en minusculas', r.ok && d.reward === 'forge-roll' && d.amount === 2);
    check('le quedan 2 rolls del Forge', forge.availablePayments(sinPrimals.address, 33139).length === 2);
    r = await canjear('DISCORD10', sinPrimalsToken);
    check('la misma wallet no lo canjea dos veces', r.status === 400 && (await r.json()).reason === 'already-redeemed');
    check('y no suma rolls', forge.availablePayments(sinPrimals.address, 33139).length === 2);
    check('otra wallet si', (await canjear('DISCORD10', otroToken)).ok);
    r = await canjear('DISCORD10', holderToken);
    check('pasado el limite de usos no', r.status === 400 && (await r.json()).reason === 'exhausted');
    check('el generado funciona', (await canjear(generado, holderToken)).ok);
    check('uno que no existe no', (await canjear('NOEXISTE', holderToken)).status === 400);

    console.log('\n--- Vencido y desactivado ---');
    await crear({ code: 'VENCE', reward: 'forge-roll', maxUses: 10, expiresAt: manana });
    const archivo = JSON.parse(fs.readFileSync(promo.CODES_PATH, 'utf8'));
    archivo.VENCE.expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(promo.CODES_PATH, JSON.stringify(archivo));
    r = await canjear('VENCE', holderToken);
    check('vencido no se canjea', r.status === 400 && (await r.json()).reason === 'expired');

    await crear({ code: 'APAGADO', reward: 'forge-roll', maxUses: 10 });
    r = await fetch(`${BASE}/api/admin/promo/apagado`, { method: 'PATCH', headers: admin, body: JSON.stringify({ active: false }) });
    check('el admin lo desactiva', r.ok && (await r.json()).status === 'disabled');
    check('desactivado no se canjea', (await canjear('APAGADO', holderToken)).status === 400);
    await fetch(`${BASE}/api/admin/promo/APAGADO`, { method: 'PATCH', headers: admin, body: JSON.stringify({ active: true }) });
    check('reactivado si', (await canjear('APAGADO', holderToken)).ok);

    console.log('\n--- Archivar ---');
    const patch = (code, body) => fetch(`${BASE}/api/admin/promo/${code}`, { method: 'PATCH', headers: admin, body: JSON.stringify(body) });
    check('uno activo no se archiva', (await patch('APAGADO', { archived: true })).status === 409);
    r = await patch('VENCE', { archived: true });
    check('uno vencido si', r.ok && (await r.json()).archived === true);
    check('archivado no se puede volver a crear', (await crear({ code: 'VENCE', reward: 'forge-roll', maxUses: 1 })).status === 400);
    await patch('APAGADO', { active: false });
    await patch('APAGADO', { archived: true });
    check('archivado no se puede activar', (await patch('APAGADO', { active: true })).status === 409);
    check('archivado no se canjea', (await canjear('APAGADO', otroToken)).status === 400);
    r = await patch('APAGADO', { archived: false });
    check('se desarchiva', r.ok && (await r.json()).archived === false);
    check('codigo inexistente da 404', (await patch('NOEXISTE', { archived: true })).status === 404);

    console.log('\n--- Registro ---');
    const lista = await codigos();
    const discord = lista.find(x => x.code === 'DISCORD10');
    check('el admin ve los canjes con wallet y fecha', discord.uses === 2 && discord.status === 'exhausted'
        && discord.redemptions[0].wallet === sinPrimals.address.toLowerCase() && discord.redemptions[0].at);
    check('y el estado de cada uno', lista.find(x => x.code === 'VENCE').status === 'expired');

    console.log('\n--- Limite de intentos ---');
    let estados = [];
    for (let i = 0; i < 9; i++) estados.push((await canjear(`ADIVINO${i}`, adivinoToken)).status);
    check('tras 8 codigos inexistentes corta con 429', estados.slice(0, 8).every(s => s === 400) && estados[8] === 429);
    await crear({ code: 'BUENO', reward: 'forge-roll', maxUses: 10 });
    check('bloqueado, ni uno bueno pasa', (await canjear('BUENO', adivinoToken)).status === 429);

    console.log('\n--- En el Forge ---');
    const w = '0x00000000000000000000000000000000000000aa';
    forge.addPayment({ txHash: '0xabc', wallet: w, chainId: 33139, valueWei: '1' });
    forge.addPromoCredits(w, 'TEST', 1);
    const primero = forge.takePayment(w, 33139, 'roll-1', '54');
    check('se gasta primero el gratis', primero.source === 'promo' && primero.id === `promo:TEST:${w}:0`);
    forge.returnPayment(primero.id);
    check('si el roll falla, vuelve', forge.availablePayments(w, 33139).length === 2);
    check('el gratis vale en cualquier red', forge.availablePayments(w, 1).length === 1);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
