// tests/forgePayments.test.js
//
// Prueba el cobro del Forge contra una cadena de verdad: levanta su propio
// anvil, hace transferencias reales al treasury y comprueba que el backend
// acepte solo pagos validos, que cada pago valga un roll y nada mas, y que un
// pago informado dos veces no sume dos rolls.
//
// Como forge.test.js, se sustituyen solo la consulta de propiedad del NFT y el
// publisher remoto. Si anvil no esta instalado, el test se saltea.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { createWalletClient, createTestClient, publicActions, http, parseEther, defineChain } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39873;
const BASE = `http://localhost:${PORT}`;
const ANVIL_PORT = 38546;
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
const TOKEN = '54';
const OTHER_TOKEN = '55';

// Cuentas por defecto de anvil: arrancan con saldo.
const owner = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const stranger = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const TREASURY = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const OTRA_WALLET = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

function findAnvil() {
    const candidates = [
        path.join(os.homedir(), '.foundry', 'bin', process.platform === 'win32' ? 'anvil.exe' : 'anvil'),
        'anvil'
    ];
    for (const candidate of candidates) {
        try {
            execFileSync(candidate, ['--version'], { stdio: 'ignore' });
            return candidate;
        } catch { /* sigue */ }
    }
    return null;
}

const anvilPath = findAnvil();
if (!anvilPath) {
    console.log('anvil no esta instalado: se saltea el test de pagos del Forge.');
    process.exit(0);
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-forge-pay-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.PORT = String(PORT);
process.env.PUBLIC_ASSETS_URL = BASE;
// Modo de prueba para que nada se publique, pero con cobro: los rolls se pagan.
process.env.FORGE_TEST_MODE = 'true';
process.env.FORGE_TREASURY = TREASURY;
process.env.FORGE_ROLL_PRICE = '1.5';
process.env.FORGE_CONFIRMATIONS = '2';
process.env.FORGE_RPC_URL = RPC;
process.env.FORGE_CHAIN_ID = '31337';
process.env.FORGE_PAYMENTS_FROM_BLOCK = '0';

const metadataDir = path.join(TMP, '_generated', 'metadata');
fs.mkdirSync(metadataDir, { recursive: true });
for (const id of [TOKEN, OTHER_TOKEN]) {
    fs.writeFileSync(path.join(metadataDir, id), JSON.stringify({
        name: `Primal Cult #${id}`,
        image: `https://ipfs.primalcult.xyz/images/${id}.gif`,
        attributes: [
            { trait_type: 'Effect', value: 'Standart' },
            { trait_type: 'Hat', value: 'Spikes' },
            { trait_type: 'Eyes', value: 'Trader' },
            { trait_type: 'Tunic', value: 'Black' },
            { trait_type: 'Face', value: 'Gumball Eyes' },
            { trait_type: 'Fur', value: 'White' },
            { trait_type: 'Background', value: 'Aquamarine' }
        ]
    }));
}

const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async (address, tokenId) => {
            if (![TOKEN, OTHER_TOKEN].includes(String(tokenId))) return { status: 'token-not-found' };
            const isOwner = String(address).toLowerCase() === owner.address.toLowerCase();
            return { status: isOwner ? 'owner' : 'not-owner', owner: owner.address };
        },
        getTokenOwner: async () => owner.address,
        CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000'
    }
};

const publisherPath = require.resolve('../lib/remotePublisher');
require.cache[publisherPath] = {
    id: publisherPath,
    filename: publisherPath,
    loaded: true,
    exports: {
        isConfigured: () => true,
        missingConfig: () => [],
        publishNft: async () => ({}),
        verifyAccess: async () => ({ ok: true })
    }
};

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
const getAuth = async (url, token) => (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).json();

async function login(account) {
    let r = await post(`${BASE}/api/auth/nonce`, { address: account.address });
    const { nonce, message } = await r.json();
    const signature = await account.signMessage({ message });
    r = await post(`${BASE}/api/auth/verify`, { nonce, signature });
    return (await r.json()).token;
}

async function waitFor(fn, what) {
    for (let i = 0; i < 60; i++) {
        try {
            if (await fn()) return;
        } catch { /* todavia no */ }
        await new Promise(res => setTimeout(res, 250));
    }
    throw new Error(`${what} no arranco.`);
}

let anvil;

async function main() {
    anvil = spawn(anvilPath, ['--port', String(ANVIL_PORT), '--silent'], { stdio: 'ignore' });
    const chain = defineChain({
        id: 31337,
        name: 'anvil',
        nativeCurrency: { name: 'ApeCoin', symbol: 'APE', decimals: 18 },
        rpcUrls: { default: { http: [RPC] } }
    });
    const testClient = createTestClient({ chain, mode: 'anvil', transport: http(RPC), cacheTime: 0 }).extend(publicActions);
    await waitFor(async () => (await testClient.getBlockNumber()) >= 0n, 'anvil');

    const walletOf = account => createWalletClient({ account, chain, transport: http(RPC) });
    // Espera el recibo: sendTransaction vuelve antes de que anvil termine de
    // minarla, y un mine() que llegue antes la meteria en ese mismo bloque
    // (una confirmacion menos de las que el test espera).
    const pay = async (account, to, ape) => {
        const hash = await walletOf(account).sendTransaction({ to, value: parseEther(ape) });
        await testClient.waitForTransactionReceipt({ hash, pollingInterval: 50 });
        return hash;
    };
    const mine = () => testClient.mine({ blocks: 1 });

    require('../server.js');
    await waitFor(async () => (await fetch(`${BASE}/api/forge/${TOKEN}`)).ok, 'El server');

    const ownerToken = await login(owner);
    const strangerToken = await login(stranger);
    const url = (token, action) => `${BASE}/api/forge/${token}/${action}`;
    const pagados = async () => (await getAuth(`${BASE}/api/forge/payments/me`, ownerToken)).paidRolls;

    console.log('\n--- Estado ---');
    const status = await (await fetch(`${BASE}/api/forge/${TOKEN}`)).json();
    check('el Forge esta abierto', status.available === true);
    check('dice que se cobra, a quien y cuanto',
        status.payment?.required === true
        && status.payment.treasury === TREASURY
        && status.payment.price === '1.5'
        && status.payment.priceWei === parseEther('1.5').toString()
        && status.payment.chainId === 31337,
        JSON.stringify(status.payment));

    let r = await fetch(`${BASE}/api/forge/payments/me`);
    check('ver mis rolls pagados sin sesion -> 401', r.status === 401, `(dio ${r.status})`);
    check('sin pagar no hay rolls pagados', await pagados() === 0);

    console.log('\n--- Rollear sin pagar ---');
    r = await post(url(TOKEN, 'roll'), { keep: [] }, ownerToken);
    let body = await r.json();
    check('-> 402 payment-required', r.status === 402 && body.code === 'payment-required',
        `(dio ${r.status} ${JSON.stringify(body)})`);

    console.log('\n--- Pagos que no valen ---');
    r = await post(`${BASE}/api/forge/payments`, { txHash: 'hola' }, ownerToken);
    check('hash invalido -> 400', r.status === 400, `(dio ${r.status})`);

    const menos = await pay(owner, TREASURY, '1'); await mine();
    r = await post(`${BASE}/api/forge/payments`, { txHash: menos }, ownerToken);
    body = await r.json();
    check('pagar menos del precio -> 422 underpaid', r.status === 422 && body.code === 'underpaid', `(dio ${r.status} ${body.code})`);

    const aOtro = await pay(owner, OTRA_WALLET, '2'); await mine();
    r = await post(`${BASE}/api/forge/payments`, { txHash: aOtro }, ownerToken);
    body = await r.json();
    check('pagarle a otra wallet -> 422 wrong-recipient', r.status === 422 && body.code === 'wrong-recipient', `(dio ${r.status} ${body.code})`);

    const ajeno = await pay(stranger, TREASURY, '2'); await mine();
    r = await post(`${BASE}/api/forge/payments`, { txHash: ajeno }, ownerToken);
    body = await r.json();
    check('informar el pago de otra wallet -> 403 wrong-sender', r.status === 403 && body.code === 'wrong-sender', `(dio ${r.status} ${body.code})`);
    check('ninguno de esos sumo un roll', await pagados() === 0);

    console.log('\n--- Un pago valido ---');
    const bueno = await pay(owner, TREASURY, '1.5');
    r = await post(`${BASE}/api/forge/payments`, { txHash: bueno }, ownerToken);
    body = await r.json();
    check('con 1 confirmacion -> 409 not-confirmed', r.status === 409 && body.code === 'not-confirmed', `(dio ${r.status} ${body.code})`);
    check('...y todavia no suma', await pagados() === 0);

    await mine();
    r = await post(`${BASE}/api/forge/payments`, { txHash: bueno }, ownerToken);
    body = await r.json();
    check('con 2 confirmaciones -> 201', r.status === 201, `(dio ${r.status} ${JSON.stringify(body)})`);
    check('...y queda 1 roll pagado', body.paidRolls === 1 && await pagados() === 1);

    r = await post(`${BASE}/api/forge/payments`, { txHash: bueno }, ownerToken);
    body = await r.json();
    check('informarlo otra vez -> 200 sin sumar otro', r.status === 200 && body.paidRolls === 1, `(dio ${r.status} ${JSON.stringify(body)})`);
    r = await post(`${BASE}/api/forge/payments`, { txHash: bueno.toUpperCase().replace('0X', '0x') }, ownerToken);
    body = await r.json();
    check('...ni escrito en mayusculas', body.paidRolls === 1, JSON.stringify(body));
    r = await post(`${BASE}/api/forge/payments`, { txHash: bueno }, strangerToken);
    check('otra wallet no puede reclamar ese pago -> 403', r.status === 403, `(dio ${r.status})`);

    console.log('\n--- Rollear con el pago ---');
    // Dos NFTs a la vez con un solo pago: solo uno puede rollear.
    const [r1, r2] = await Promise.all([
        post(url(TOKEN, 'roll'), { keep: [] }, ownerToken),
        post(url(OTHER_TOKEN, 'roll'), { keep: [] }, ownerToken)
    ]);
    const codigos = [r1.status, r2.status].sort();
    check('dos rolls a la vez con un pago: uno 201 y otro 402', JSON.stringify(codigos) === '[201,402]', `(dieron ${codigos})`);
    check('el pago se consumio', await pagados() === 0);

    const rolled = r1.status === 201 ? TOKEN : OTHER_TOKEN;
    const roll = await (r1.status === 201 ? r1 : r2).json();
    r = await post(url(rolled, 'cancel'), { rollId: roll.rollId }, ownerToken);
    check('cancelar el roll -> 200', r.status === 200, `(dio ${r.status})`);
    check('cancelar no devuelve el pago', await pagados() === 0);
    r = await post(url(rolled, 'roll'), { keep: [] }, ownerToken);
    check('volver a rollear pide pagar otra vez -> 402', r.status === 402, `(dio ${r.status})`);

    const pagos = JSON.parse(fs.readFileSync(path.join(TMP, '_generated', 'forge', 'payments.json'), 'utf8'));
    const registro = pagos[bueno.toLowerCase()];
    check('el pago queda registrado como usado por ese roll',
        registro?.status === 'used' && registro.rollId === roll.rollId && registro.tokenId === rolled,
        JSON.stringify(registro));

    console.log('\n--- Pagos viejos ---');
    const viejo = await pay(owner, TREASURY, '1.5'); await mine(); await mine();
    process.env.FORGE_PAYMENTS_FROM_BLOCK = String(Number(await testClient.getBlockNumber()) + 1);
    r = await post(`${BASE}/api/forge/payments`, { txHash: viejo }, ownerToken);
    body = await r.json();
    check('un pago anterior a la apertura -> 422 too-old', r.status === 422 && body.code === 'too-old', `(dio ${r.status} ${body.code})`);

    console.log('\n--- Sin cobro configurado ---');
    delete process.env.FORGE_TREASURY;
    process.env.FORGE_TEST_MODE = 'false';
    const cerrado = await (await fetch(`${BASE}/api/forge/${TOKEN}`)).json();
    check('sin cobro y sin modo de prueba esta cerrado', cerrado.available === false && cerrado.payment.required === false);
    r = await post(url(TOKEN, 'roll'), { keep: [] }, ownerToken);
    check('rollear -> 503', r.status === 503, `(dio ${r.status})`);

    console.log(`\n${pass} ok, ${fail} fallas`);
    finish(fail ? 1 : 0);
}

function finish(code) {
    anvil?.kill();
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(code);
}

main().catch(error => {
    console.error(error);
    finish(1);
});
