// tests/forge.test.js
//
// Prueba el Forge de punta a punta en modo de prueba: rollear, que las opciones
// respeten las reglas, elegir, cancelar, y que un NFT tocado por el modo de
// prueba no se pueda publicar en produccion hasta restaurarlo.
//
// Como customization.test.js, el server corre dentro de este proceso y solo
// se sustituyen la consulta de propiedad a la blockchain y el publisher
// remoto. El publisher de mentira dice estar configurado a proposito: asi se
// comprueba que el modo de prueba no lo llama nunca.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39872;
const BASE = `http://localhost:${PORT}`;
const TOKEN = '54';
const ONE_OF_ONE = '69';

const owner = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const stranger = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-forge-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.PORT = String(PORT);
process.env.PUBLIC_ASSETS_URL = BASE;
process.env.FORGE_TEST_MODE = 'true';
// La metadata de prueba vive solo en el volumen: sin esto se iria a buscar la
// del hosting real y pisaria la de prueba.
process.env.ORIGIN_METADATA_URL = '';

// La metadata original del #54, fija para no depender de la red.
const ORIGINAL = {
    name: 'Primal Cult #54',
    image: 'https://ipfs.primalcult.xyz/images/54.gif',
    attributes: [
        { trait_type: 'Effect', value: 'Standart' },
        { trait_type: 'Hat', value: 'Spikes' },
        { trait_type: 'Eyes', value: 'Trader' },
        { trait_type: 'Tunic', value: 'Black' },
        { trait_type: 'Face', value: 'Gumball Eyes' },
        { trait_type: 'Fur', value: 'White' },
        { trait_type: 'Background', value: 'Aquamarine' }
    ]
};
const metadataDir = path.join(TMP, '_generated', 'metadata');
fs.mkdirSync(metadataDir, { recursive: true });
fs.writeFileSync(path.join(metadataDir, TOKEN), JSON.stringify(ORIGINAL));
fs.writeFileSync(path.join(metadataDir, ONE_OF_ONE),
    JSON.stringify({ name: 'Primal Cult #69', attributes: [{ trait_type: '1/1', value: 'Gold Skeleton' }] }));

const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async (address, tokenId) => {
            if (!/^\d+$/.test(String(tokenId))) return { status: 'invalid-token-id' };
            if (![TOKEN, ONE_OF_ONE].includes(String(tokenId))) return { status: 'token-not-found' };
            const isOwner = String(address).toLowerCase() === owner.address.toLowerCase();
            return { status: isOwner ? 'owner' : 'not-owner', owner: owner.address };
        },
        getTokenOwner: async () => owner.address,
        CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000'
    }
};

const publisherPath = require.resolve('../lib/remotePublisher');
const publicados = [];
require.cache[publisherPath] = {
    id: publisherPath,
    filename: publisherPath,
    loaded: true,
    exports: {
        isConfigured: () => true,
        missingConfig: () => [],
        publishNft: async (tokenId) => {
            publicados.push(tokenId);
            return {};
        },
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
const get = async url => (await fetch(url)).json();
const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const readVolumeMetadata = () => JSON.parse(fs.readFileSync(path.join(metadataDir, TOKEN), 'utf8'));
const traitsOf = metadata => Object.fromEntries(metadata.attributes.map(a => [a.trait_type, a.value]));

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
            const r = await fetch(`${BASE}/api/forge/${TOKEN}`);
            if (r.ok) return;
        } catch { /* todavia no levanto */ }
        await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('El server no arranco.');
}

async function main() {
    require('../server.js');
    await waitForServer();

    const ownerToken = await login(owner);
    const strangerToken = await login(stranger);
    const url = action => `${BASE}/api/forge/${TOKEN}/${action}`;
    const before = traitsOf(ORIGINAL);

    console.log('\n--- Estado ---');
    let status = await get(`${BASE}/api/forge/${TOKEN}`);
    check('el #54 puede usar el Forge', status.eligible === true && status.testMode === true);
    check('muestra sus traits', status.traits?.Background === 'Aquamarine');
    check('Effect no se rollea', !status.rollableCategories.includes('Effect') && status.rollableCategories.length === 6);
    check('sin roll pendiente', status.pending === null);
    check('las probabilidades no incluyen el valor actual',
        !Object.hasOwn(status.probabilities.Background, 'Aquamarine'));
    check('la rareza de la coleccion si incluye el valor actual',
        Math.abs(status.collectionShare.Background.Aquamarine - 300 / 2700) < 1e-9);

    const unica = await get(`${BASE}/api/forge/${ONE_OF_ONE}`);
    check('una 1/1 no puede usar el Forge', unica.eligible === false && unica.reason === 'one-of-one');

    console.log('\n--- Quien puede rollear ---');
    let r = await post(url('roll'), { keep: [] });
    check('sin sesion -> 401', r.status === 401, `(dio ${r.status})`);
    r = await post(url('roll'), { keep: [] }, strangerToken);
    check('no es el dueño -> 403', r.status === 403, `(dio ${r.status})`);
    r = await post(`${BASE}/api/forge/${ONE_OF_ONE}/roll`, { keep: [] }, ownerToken);
    check('rollear una 1/1 -> 422', r.status === 422, `(dio ${r.status})`);

    console.log('\n--- Validacion de lo que se conserva ---');
    r = await post(url('roll'), { keep: ['Hat', 'Eyes', 'Tunic', 'Face'] }, ownerToken);
    check('conservar 4 -> 400', r.status === 400, `(dio ${r.status})`);
    r = await post(url('roll'), { keep: ['Effect'] }, ownerToken);
    check('conservar Effect -> 400', r.status === 400, `(dio ${r.status})`);
    r = await post(url('roll'), { keep: ['Hat', 'Hat'] }, ownerToken);
    check('categorias repetidas -> 400', r.status === 400, `(dio ${r.status})`);

    console.log('\n--- Un roll ---');
    const keep = ['Hat', 'Eyes', 'Tunic'];
    r = await post(url('roll'), { keep }, ownerToken);
    const roll = await r.json();
    check('el dueño rollea -> 201', r.status === 201, `(dio ${r.status} ${JSON.stringify(roll).slice(0, 150)})`);
    check('salen 2 opciones', roll.options?.length === 2);

    const [a, b] = roll.options;
    const sorteadas = ['Background', 'Fur', 'Face'];
    for (const [i, option] of roll.options.entries()) {
        const cambia = Object.keys(option.changes).sort();
        check(`opcion ${i}: cambian exactamente las no conservadas`,
            JSON.stringify(cambia) === JSON.stringify([...sorteadas].sort()), `(${cambia})`);
        check(`opcion ${i}: ningun trait repite el valor actual`,
            sorteadas.every(c => option.changes[c] !== before[c]));
        check(`opcion ${i}: la capa de cada trait nuevo sale de su carpeta`,
            sorteadas.every(c => norm(option.layers[c].imageUrl.split('/')[4]) === norm(option.changes[c])),
            JSON.stringify(option.layers));
        check(`opcion ${i}: las 7 capas estan`, Object.keys(option.layers).length === 7);
    }
    check('las 2 opciones son distintas', JSON.stringify(a.changes) !== JSON.stringify(b.changes));

    r = await post(url('roll'), { keep: [] }, ownerToken);
    const repetido = await r.json();
    check('rollear con uno pendiente -> 409', r.status === 409, `(dio ${r.status})`);
    check('...y devuelve el MISMO roll', repetido.pending?.rollId === roll.rollId);
    status = await get(`${BASE}/api/forge/${TOKEN}`);
    check('recargar muestra el mismo roll', status.pending?.rollId === roll.rollId
        && JSON.stringify(status.pending.options) === JSON.stringify(roll.options));

    console.log('\n--- Elegir ---');
    r = await post(url('choose'), { rollId: 'otro', option: 0 }, ownerToken);
    check('rollId equivocado -> 409', r.status === 409, `(dio ${r.status})`);
    r = await post(url('choose'), { rollId: roll.rollId, option: 2 }, ownerToken);
    check('opcion inexistente -> 400', r.status === 400, `(dio ${r.status})`);
    r = await post(url('choose'), { rollId: roll.rollId, option: 1 }, strangerToken);
    check('elegir sin ser el dueño -> 403', r.status === 403, `(dio ${r.status})`);

    r = await post(url('choose'), { rollId: roll.rollId, option: 1 }, ownerToken);
    const chosen = await r.json();
    check('el dueño elige -> 200', r.status === 200, `(dio ${r.status} ${JSON.stringify(chosen).slice(0, 150)})`);

    const after = traitsOf(readVolumeMetadata());
    check('la metadata tiene los traits de la opcion elegida',
        sorteadas.every(c => after[c] === b.changes[c]));
    check('los conservados y Effect no cambian',
        [...keep, 'Effect'].every(c => after[c] === before[c]));
    check('sigue teniendo 7 atributos', readVolumeMetadata().attributes.length === 7);
    check('no se publico nada en produccion', publicados.length === 0, `(${publicados})`);
    check('no se aviso a OpenSea', chosen.marketplaceRefresh?.requested === false);

    const options = await get(`${BASE}/api/nft/${TOKEN}/customize-options`);
    check('el customizer ofrece las variantes del fondo nuevo',
        options.Background.variants.filter(v => !v.isGlobal)
            .every(v => norm(v.imageUrl.split('/')[4]) === norm(b.changes.Background)),
        `(${options.Background.variants.map(v => v.imageUrl).slice(0, 2)})`);

    status = await get(`${BASE}/api/forge/${TOKEN}`);
    check('ya no hay roll pendiente', status.pending === null);

    console.log('\n--- Cancelar ---');
    const conElegido = readVolumeMetadata();
    r = await post(url('roll'), { keep: [] }, ownerToken);
    const segundo = await r.json();
    check('se puede volver a rollear', r.status === 201, `(dio ${r.status})`);
    check('sin conservar nada cambian las 6', Object.keys(segundo.options[0].changes).length === 6);
    r = await post(url('cancel'), { rollId: segundo.rollId }, ownerToken);
    check('cancelar -> 200', r.status === 200, `(dio ${r.status})`);
    check('cancelar no toca el NFT', JSON.stringify(readVolumeMetadata()) === JSON.stringify(conElegido));
    status = await get(`${BASE}/api/forge/${TOKEN}`);
    check('despues de cancelar no hay pendiente', status.pending === null);

    const historial = fs.readFileSync(path.join(TMP, '_generated', 'forge', 'history.jsonl'), 'utf8')
        .trim().split('\n').map(l => JSON.parse(l).event);
    check('el historial registra todo', JSON.stringify(historial) === JSON.stringify(['roll', 'choose', 'roll', 'cancel']),
        `(${historial})`);

    console.log('\n--- Un NFT de prueba no se publica en produccion ---');
    const custom = await get(`${BASE}/api/nft/${TOKEN}/customize-options`);
    const selections = Object.fromEntries(Object.entries(custom).map(([c, o]) => [c, o.variants[0].imageUrl]));
    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, { selections }, ownerToken);
    check('guardar desde el customizer -> 409', r.status === 409, `(dio ${r.status})`);
    check('...y no llego al publisher', publicados.length === 0);

    execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'forge-reset-sandbox.js')], {
        env: { ...process.env, TRAITS_PATH: TMP },
        stdio: 'ignore'
    });
    check('el reset restaura la metadata original',
        JSON.stringify(readVolumeMetadata()) === JSON.stringify(ORIGINAL));

    const restaurado = await get(`${BASE}/api/nft/${TOKEN}/customize-options`);
    const selOriginal = Object.fromEntries(Object.entries(restaurado).map(([c, o]) => [c, o.variants[0].imageUrl]));
    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, { selections: selOriginal }, ownerToken);
    check('despues del reset se puede publicar', r.status === 200, `(dio ${r.status})`);
    check('...y llega al publisher', publicados.length === 1);

    console.log('\n--- Sin modo de prueba ni cobro configurado ---');
    process.env.FORGE_TEST_MODE = 'false';
    r = await post(url('roll'), { keep: [] }, ownerToken);
    check('rollear -> 503', r.status === 503, `(dio ${r.status})`);
    status = await get(`${BASE}/api/forge/${TOKEN}`);
    check('el estado dice que no esta disponible', status.available === false);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
