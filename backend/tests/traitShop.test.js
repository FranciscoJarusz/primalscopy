// Prueba los drops de traits: programarlos desde el admin, que solo se vendan
// mientras duran y haya copias, el desbloqueo que cobra y queda para la
// wallet, que guardar rechace un trait con drop sin comprar (aunque el drop
// haya terminado), que el nuevo dueño conserve el que ya venia puesto, y que
// renombrar el trait no le saque la compra a nadie.
//
// Correr con: npm test

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39881;
const BASE = `http://localhost:${PORT}`;
const TOKEN = '54';
const ADMIN = 'admin-solo-para-tests';

const owner = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const nuevoDueño = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-traitshop-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.ADMIN_TOKEN = ADMIN;
process.env.PORT = String(PORT);
process.env.PUBLIC_ASSETS_URL = BASE;

const ORIGIN_PORT = PORT + 1;
const origen = {
    metadata: {
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
    }
};
const origenServer = http.createServer((req, res) => {
    if (req.url !== `/metadata/${TOKEN}`) {
        res.writeHead(404);
        return res.end();
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(origen.metadata));
});
process.env.ORIGIN_METADATA_URL = `http://localhost:${ORIGIN_PORT}/metadata/`;

let dueño = owner;
const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async (address, tokenId) => {
            if (String(tokenId) !== TOKEN) return { status: 'token-not-found' };
            const isOwner = String(address).toLowerCase() === dueño.address.toLowerCase();
            return { status: isOwner ? 'owner' : 'not-owner', owner: dueño.address };
        },
        getTokenOwner: async () => dueño.address,
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
        publishNft: async (tokenId, payload) => {
            origen.metadata = structuredClone(payload.metadata);
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

const admin = { authorization: `Bearer ${ADMIN}` };
const pedir = (method, url, body, headers = {}) => fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
});
const conToken = token => ({ authorization: `Bearer ${token}` });
const json = async r => ({ status: r.status, ...(await r.json()) });

async function login(account) {
    let r = await pedir('POST', `${BASE}/api/auth/nonce`, { address: account.address });
    const { nonce, message } = await r.json();
    const signature = await account.signMessage({ message });
    r = await pedir('POST', `${BASE}/api/auth/verify`, { nonce, signature });
    return (await r.json()).token;
}

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            if ((await fetch(`${BASE}/api/nft/${TOKEN}/customization`)).ok) return;
        } catch { /* todavia no levanto */ }
        await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('El server no arranco.');
}

const opciones = async () => (await fetch(`${BASE}/api/nft/${TOKEN}/customize-options`)).json();
const dropEn = (options, url) => Object.values(options).flatMap(o => o.variants).find(v => v.imageUrl === url)?.drop;
const enHoras = h => new Date(Date.now() + h * 3600000).toISOString();

async function main() {
    await new Promise(res => origenServer.listen(ORIGIN_PORT, res));
    require('../server.js');
    await waitForServer();
    const staking = require('../lib/stakingStore');

    const tokenOwner = await login(owner);
    const tokenNuevo = await login(nuevoDueño);

    let options = await opciones();
    const seleccion = {};
    for (const [category, option] of Object.entries(options)) seleccion[category] = option.variants[0].imageUrl;
    const sombreros = options.Hat.variants;
    check('hay al menos tres sombreros para probar', sombreros.length >= 3, `(${sombreros.length})`);
    const aVender = sombreros[1].imageUrl;
    const limitado = sombreros[2].imageUrl;
    check('un trait comun no tiene drop', dropEn(options, aVender) === null);

    console.log('\nDrops desde el admin');
    const url = `${BASE}/api/admin/trait-drops`;
    check('sin token de admin no se ve', (await fetch(url)).status === 401);
    check('sin token de admin no se crea', (await pedir('POST', url, { trait: aVender, price: 10 })).status === 401);
    let r = await json(await pedir('POST', url, { trait: '/assets/traits/HAT/NADA/NO.gif', price: 10 }, admin));
    check('un trait que no existe -> 404', r.status === 404);
    r = await json(await pedir('POST', url, { trait: aVender, price: 0 }, admin));
    check('precio 0 -> 400', r.status === 400);
    r = await json(await pedir('POST', url, { trait: aVender, price: 1000, startsAt: enHoras(5), endsAt: enHoras(1) }, admin));
    check('terminar antes de empezar -> 400', r.status === 400);
    r = await json(await pedir('POST', url, { trait: aVender, price: 1000, startsAt: enHoras(24), endsAt: enHoras(24 * 6) }, admin));
    check('el admin programa un drop de 5 dias', r.status === 200 && r.drop.price === 1000, JSON.stringify(r));
    const idDrop = r.drop.id;
    r = await json(await pedir('POST', url, { trait: aVender, price: 2000 }, admin));
    check('un trait no puede tener dos drops', r.status === 409);
    options = await opciones();
    check('el customizer lo ve programado', dropEn(options, aVender)?.status === 'scheduled');

    console.log('\nDesbloquear');
    check('sin sesion no se ve lo desbloqueado', (await fetch(`${BASE}/api/traits/me`)).status === 401);
    staking.grantFog(owner.address, 3000, 'test');
    r = await json(await pedir('POST', `${BASE}/api/traits/unlock`, { trait: aVender }, conToken(tokenOwner)));
    check('antes de empezar no se vende', r.status === 409 && staking.balanceDe(owner.address) === 3000, JSON.stringify(r));
    r = await json(await pedir('POST', `${BASE}/api/nft/${TOKEN}/customization`, { selections: { ...seleccion, Hat: aVender } }, conToken(tokenOwner)));
    check('y tampoco se puede guardar', r.status === 402);

    r = await json(await pedir('PUT', `${url}/${idDrop}`, { price: 1000, startsAt: enHoras(-1), endsAt: enHoras(24 * 5) }, admin));
    check('el admin lo adelanta', r.status === 200);
    options = await opciones();
    check('ahora esta a la venta', dropEn(options, aVender)?.status === 'live');
    r = await json(await pedir('POST', `${BASE}/api/nft/${TOKEN}/customization`, { selections: { ...seleccion, Hat: aVender } }, conToken(tokenOwner)));
    check('guardarlo sin comprarlo -> 402', r.status === 402, JSON.stringify(r));
    r = await json(await pedir('POST', `${BASE}/api/traits/unlock`, { trait: seleccion.Background }, conToken(tokenOwner)));
    check('un trait sin drop -> 404', r.status === 404);
    r = await json(await pedir('POST', `${BASE}/api/traits/unlock`, { trait: aVender }, conToken(tokenOwner)));
    check('se desbloquea y cobra', r.status === 200 && r.balance === 2000 && r.unlocked.includes(aVender), JSON.stringify(r));
    r = await json(await pedir('POST', `${BASE}/api/traits/unlock`, { trait: aVender }, conToken(tokenOwner)));
    check('no se compra dos veces', r.status === 409 && staking.balanceDe(owner.address) === 2000);

    console.log('\nCopias limitadas');
    r = await json(await pedir('POST', url, { trait: limitado, price: 500, supply: 1 }, admin));
    check('un drop de una sola copia', r.status === 200 && r.drop.supply === 1);
    const idLimitado = r.drop.id;
    check('el customizer ve que queda una', dropEn(await opciones(), limitado)?.left === 1);
    staking.grantFog(nuevoDueño.address, 3000, 'test');
    r = await json(await pedir('POST', `${BASE}/api/traits/unlock`, { trait: limitado }, conToken(tokenNuevo)));
    check('la primera wallet la compra', r.status === 200);
    r = await json(await pedir('POST', `${BASE}/api/traits/unlock`, { trait: limitado }, conToken(tokenOwner)));
    check('la segunda ya no: se agoto', r.status === 409 && staking.balanceDe(owner.address) === 2000, JSON.stringify(r));
    check('el customizer lo ve agotado', dropEn(await opciones(), limitado)?.status === 'sold-out');
    r = await json(await pedir('PUT', `${url}/${idLimitado}`, { price: 500, supply: 0 }, admin));
    check('no se puede bajar a menos copias que las vendidas', r.status === 400);
    r = await json(await pedir('DELETE', `${url}/${idLimitado}`, undefined, admin));
    check('con ventas no se borra', r.status === 409);

    console.log('\nGuardar');
    r = await json(await pedir('POST', `${BASE}/api/nft/${TOKEN}/customization`, { selections: { ...seleccion, Hat: aVender } }, conToken(tokenOwner)));
    check('desbloqueado, se guarda', r.status === 200, JSON.stringify(r).slice(0, 160));

    console.log('\nTerminar el drop');
    r = await json(await pedir('POST', `${url}/${idDrop}/end`, undefined, admin));
    check('el admin lo termina', r.status === 200);
    check('el customizer lo ve terminado', dropEn(await opciones(), aVender)?.status === 'ended');
    r = await json(await pedir('POST', `${BASE}/api/traits/unlock`, { trait: aVender }, conToken(tokenNuevo)));
    check('terminado ya no se vende', r.status === 409);
    r = await json(await pedir('POST', `${BASE}/api/nft/${TOKEN}/customization`, { selections: { ...seleccion, Hat: aVender } }, conToken(tokenOwner)));
    check('quien lo compro lo sigue pudiendo guardar', r.status === 200);

    console.log('\nNuevo dueño');
    dueño = nuevoDueño;
    r = await json(await pedir('POST', `${BASE}/api/nft/${TOKEN}/customization`, { selections: { ...seleccion, Hat: aVender } }, conToken(tokenNuevo)));
    check('conserva el trait que ya venia puesto', r.status === 200, JSON.stringify(r).slice(0, 160));
    r = await json(await pedir('POST', `${BASE}/api/nft/${TOKEN}/customization`, { selections: { ...seleccion, Hat: limitado } }, conToken(tokenNuevo)));
    check('y puede poner el que compro el', r.status === 200);
    r = await json(await pedir('POST', `${BASE}/api/nft/${TOKEN}/customization`, { selections: { ...seleccion, Hat: aVender } }, conToken(tokenNuevo)));
    check('pero si lo saco, no vuelve a poner el que no compro', r.status === 402);

    console.log('\nRenombrar y borrar');
    const [, , , categoria, carpeta, archivo] = aVender.split('/');
    r = await json(await pedir('PATCH', `${BASE}/api/admin/traits`, { category: categoria, directory: carpeta, file: archivo, newName: 'RENOMBRADO' }, admin));
    check('el admin renombra el trait', r.status === 200, JSON.stringify(r));
    const nuevaUrl = r.trait?.url;
    options = await opciones();
    check('el drop se muda con el nombre', dropEn(options, nuevaUrl)?.price === 1000 && dropEn(options, aVender) === undefined);
    r = await json(await fetch(`${BASE}/api/traits/me`, { headers: conToken(tokenOwner) }));
    check('y la compra tambien', r.unlocked.includes(nuevaUrl) && !r.unlocked.includes(aVender), JSON.stringify(r));

    const sinVentas = sombreros[0].imageUrl;
    r = await json(await pedir('POST', url, { trait: sinVentas, price: 100 }, admin));
    r = await json(await pedir('DELETE', `${url}/${r.drop.id}`, undefined, admin));
    check('sin ventas se borra y vuelve a ser comun', r.status === 200 && dropEn(await opciones(), sinVentas) === null);
    r = await json(await fetch(url, { headers: admin }));
    check('el admin ve los drops con lo vendido', r.drops.length === 2 && r.drops.every(d => d.sold === 1) && r.unlocks.length === 2, JSON.stringify(r).slice(0, 200));

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
