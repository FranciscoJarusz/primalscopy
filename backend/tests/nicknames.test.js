// tests/nicknames.test.js
//
// Prueba los apodos: que haga falta la sesion firmada y un Primal, las reglas
// de formato y unicidad, y el borrado desde el admin.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39874;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'admin-solo-para-tests';

const holder = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const otroHolder = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a');
const sinPrimals = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-nicknames-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.ADMIN_TOKEN = ADMIN;
process.env.PORT = String(PORT);

const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async () => ({ status: 'not-owner' }),
        getTokenOwner: async () => null,
        getPrimalBalance: async (address) =>
            address.toLowerCase() === sinPrimals.address.toLowerCase() ? 0 : 3,
        CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000'
    }
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const post = (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
});
const put = (nickname, token) => fetch(`${BASE}/api/profile/nickname`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ nickname })
});
const nicknames = async () => (await fetch(`${BASE}/api/profile/nicknames`)).json();

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
            if ((await fetch(`${BASE}/api/profile/nicknames`)).ok) return;
        } catch { /* todavia no levanto */ }
        await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('El server no arranco.');
}

async function main() {
    require('../server.js');
    await waitForServer();

    const holderToken = await login(holder);
    const otroToken = await login(otroHolder);
    const sinPrimalsToken = await login(sinPrimals);
    const clave = holder.address.toLowerCase();

    console.log('\n--- Guardar ---');
    check('sin sesion no se puede', (await put('Trout', null)).status === 401);
    check('sin Primals no se puede', (await put('Nadie', sinPrimalsToken)).status === 403);
    check('muy corto se rechaza', (await put('ab', holderToken)).status === 400);
    check('con espacios se rechaza', (await put('el trout', holderToken)).status === 400);
    check('con emoji se rechaza', (await put('trout🔥', holderToken)).status === 400);

    let r = await put('  Trout_1  ', holderToken);
    check('un holder guarda su apodo', r.ok && (await r.json()).nickname === 'Trout_1');
    check('aparece en la lista publica', (await nicknames())[clave] === 'Trout_1');
    check('queda en el volumen', fs.existsSync(path.join(TMP, '_generated', 'profiles', 'nicknames.json')));

    console.log('\n--- Unicidad ---');
    check('otro no puede usar el mismo', (await put('trout_1', otroToken)).status === 400);
    check('el mismo puede volver a guardarlo', (await put('TROUT_1', holderToken)).ok);
    check('se puede cambiar', (await put('Trout', holderToken)).ok && (await nicknames())[clave] === 'Trout');
    check('el viejo queda libre', (await put('Trout_1', otroToken)).ok);

    console.log('\n--- Admin ---');
    const admin = { authorization: `Bearer ${ADMIN}` };
    r = await fetch(`${BASE}/api/admin/nicknames`, { headers: admin });
    const lista = await r.json();
    check('el admin ve la lista', r.ok && lista.length === 2 && lista.every(n => n.updatedAt));
    check('sin token de admin no', (await fetch(`${BASE}/api/admin/nicknames`)).status === 401);
    r = await fetch(`${BASE}/api/admin/nicknames/${holder.address}`, { method: 'DELETE', headers: admin });
    check('el admin borra un apodo', r.ok && !(clave in (await nicknames())));
    r = await fetch(`${BASE}/api/admin/nicknames/${holder.address}`, { method: 'DELETE', headers: admin });
    check('borrar uno que no existe da 404', r.status === 404);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
