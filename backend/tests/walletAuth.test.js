// tests/walletAuth.test.js
//
// Prueba del login por firma y del guard de propiedad.
//
// Levanta el server real en un puerto aparte y le pega por HTTP, asi se prueba
// el camino completo (rutas, middleware, verificacion de firma) y no piezas
// sueltas. Las consultas de propiedad van contra ApeChain de verdad, asi que
// necesita red.
//
// Correr con: npm test

const { spawn } = require('child_process');
const path = require('path');
const express = require('express');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const SECRET = 'secreto-solo-para-tests';

// Tambien en ESTE proceso, no solo en el server hijo: las pruebas del guard
// montan un express propio aca adentro, y lib/walletAuth lee el secreto una
// sola vez al cargarse. Sin esto el guard responde 503 (auth deshabilitada) y
// las pruebas de permisos no llegan a ejercitar nada.
process.env.WALLET_JWT_SECRET = SECRET;

// Claves de prueba conocidas y publicas (las que trae Hardhat por defecto).
// Nunca tuvieron fondos y no se usan en ningun lado real.
const alice = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const mallory = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

// Dueño real del token 54 en el contrato de produccion. Si ese NFT se vende,
// esta prueba puntual va a fallar y hay que actualizar la direccion.
const REAL_OWNER_54 = '0x0c3f0eBd41365Dd426da058f657c44fD4fAF99e6';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const post = (url, body, token) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
});
const get = (url, token) => fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });

function startServer() {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, PORT: String(PORT), WALLET_JWT_SECRET: SECRET },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('El server no arranco a tiempo.')), 30000);
        child.stdout.on('data', chunk => {
            if (String(chunk).includes('Backend server running')) {
                clearTimeout(timer);
                resolve(child);
            }
        });
        child.stderr.on('data', chunk => process.stderr.write(String(chunk)));
    });
}

async function main() {
    const server = await startServer();
    try {
        console.log('\n--- Login por firma: camino feliz ---');
        let r = await post(`${BASE}/api/auth/nonce`, { address: alice.address });
        const { nonce, message } = await r.json();
        check('emite nonce y mensaje', r.status === 200 && Boolean(nonce) && Boolean(message));
        check('el mensaje nombra la wallet', message.includes(alice.address));
        check('el mensaje aclara que no mueve fondos', /no autoriza ninguna transaccion/i.test(message));

        const signature = await alice.signMessage({ message });
        r = await post(`${BASE}/api/auth/verify`, { nonce, signature });
        const session = await r.json();
        check('verifica la firma y abre sesion', r.status === 200 && Boolean(session.token));
        check('devuelve la direccion correcta', session.address?.toLowerCase() === alice.address.toLowerCase());

        const auth = session.token;
        r = await get(`${BASE}/api/auth/me`, auth);
        const me = await r.json();
        check('/me acepta la sesion', r.status === 200 && me.address?.toLowerCase() === alice.address.toLowerCase());

        console.log('\n--- Ataques que tienen que fallar ---');
        r = await post(`${BASE}/api/auth/verify`, { nonce, signature });
        check('replay del mismo nonce + firma', r.status === 401, `(dio ${r.status})`);

        let fresh = await (await post(`${BASE}/api/auth/nonce`, { address: alice.address })).json();
        r = await post(`${BASE}/api/auth/verify`, {
            nonce: fresh.nonce,
            signature: await mallory.signMessage({ message: fresh.message })
        });
        check('firma de otra wallet sobre nonce ajeno', r.status === 401, `(dio ${r.status})`);

        fresh = await (await post(`${BASE}/api/auth/nonce`, { address: alice.address })).json();
        r = await post(`${BASE}/api/auth/verify`, {
            nonce: fresh.nonce,
            signature: await alice.signMessage({ message: 'Dame acceso a todo' })
        });
        check('firma de un mensaje distinto al emitido', r.status === 401, `(dio ${r.status})`);

        r = await post(`${BASE}/api/auth/verify`, { nonce: 'inventado', signature });
        check('nonce inexistente', r.status === 401, `(dio ${r.status})`);

        check('/me sin token', (await get(`${BASE}/api/auth/me`)).status === 401);
        check('/me con token basura', (await get(`${BASE}/api/auth/me`, 'a.b.c')).status === 401);
        check('/me con token manipulado', (await get(`${BASE}/api/auth/me`, auth.slice(0, -4) + 'AAAA')).status === 401);
        check('nonce para direccion invalida', (await post(`${BASE}/api/auth/nonce`, { address: 'no-es-una-direccion' })).status === 400);

        console.log('\n--- Propiedad contra la cadena real ---');
        check('ownership sin sesion -> 401', (await get(`${BASE}/api/nft/54/ownership`)).status === 401);

        r = await get(`${BASE}/api/nft/54/ownership`, auth);
        const body = await r.json();
        check('sesion de quien no es dueño -> isOwner false', r.status === 200 && body.isOwner === false, `(dio ${r.status})`);
        check('reporta el dueño real del token 54', body.owner?.toLowerCase() === REAL_OWNER_54.toLowerCase(), `(dio ${body.owner})`);
        check('token inexistente -> 404', (await get(`${BASE}/api/nft/999999/ownership`, auth)).status === 404);
        check('tokenId basura -> 400', (await get(`${BASE}/api/nft/abc/ownership`, auth)).status === 400);

        console.log('\n--- requireTokenOwner sobre una ruta que escribiria ---');
        const { requireWallet, requireTokenOwner } = require('../middleware/requireWallet');
        const app = express();
        app.post('/guardar/:nftId', requireWallet, requireTokenOwner, (_req, res) => res.json({ escrito: true }));
        const toy = await new Promise(resolve => { const s = app.listen(4001, () => resolve(s)); });

        check('sin sesion -> 401, no escribe', (await post('http://localhost:4001/guardar/54', {})).status === 401);
        check('sesion valida pero no dueño -> 403', (await post('http://localhost:4001/guardar/54', {}, auth)).status === 403);
        check('token inexistente -> 404', (await post('http://localhost:4001/guardar/999999', {}, auth)).status === 404);
        toy.close();

        console.log('\n--- El dueño si pasa (consulta a la cadena simulada) ---');
        // No tenemos la clave privada del dueño real del 54, asi que para
        // probar el camino de aceptacion se reemplaza SOLO la consulta a la
        // blockchain. La firma, la sesion y el guard siguen siendo los reales.
        const ownershipPath = require.resolve('../lib/nftOwnership');
        delete require.cache[require.resolve('../middleware/requireWallet')];
        require.cache[ownershipPath] = {
            id: ownershipPath,
            filename: ownershipPath,
            loaded: true,
            exports: { checkOwnership: async () => ({ status: 'owner', owner: alice.address }) }
        };
        const guards = require('../middleware/requireWallet');
        const app2 = express();
        app2.post('/guardar/:nftId', guards.requireWallet, guards.requireTokenOwner,
            (req, res) => res.json({ escrito: true, por: req.walletAddress }));
        const toy2 = await new Promise(resolve => { const s = app2.listen(4002, () => resolve(s)); });

        r = await post('http://localhost:4002/guardar/54', {}, auth);
        const written = await r.json();
        check('dueño con sesion valida -> escribe', r.status === 200 && written.escrito === true, `(dio ${r.status})`);
        check('el handler recibe la direccion probada', written.por?.toLowerCase() === alice.address.toLowerCase());
        check('dueño pero sin sesion -> 401', (await post('http://localhost:4002/guardar/54', {})).status === 401);
        toy2.close();

        console.log(`\n${pass} ok, ${fail} fallas\n`);
    } finally {
        server.kill();
    }
    process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
