const fs = require('fs');
const os = require('os');
const path = require('path');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39879;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'admin-solo-para-tests';

const ana = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const beto = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a');
const caro = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-packs-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.ADMIN_TOKEN = ADMIN;
process.env.PORT = String(PORT);

const holders = new Set();
const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async () => ({ status: 'not-owner' }),
        getTokenOwner: async () => null,
        getTokenOwners: async ids => new Map(ids.map(id => [id, null])),
        readTotalSupply: async () => 2712,
        getPrimalBalance: async address => (holders.has(String(address).toLowerCase()) ? 1 : 0),
        CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000'
    }
};

const minados = new Map();
let bloqueActual = 1000;
const cliente = require('../lib/cadena').client;
cliente.getBlockNumber = async () => BigInt(bloqueActual);
cliente.getBlock = async ({ blockNumber }) => {
    const hash = minados.get(Number(blockNumber));
    if (!hash) throw new Error('Block not found');
    return { hash, timestamp: 1900000000n };
};
const esperar = ms => new Promise(ok => setTimeout(ok, ms));

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const admin = { authorization: `Bearer ${ADMIN}` };
const pedir = (method, url, body, headers = {}) => fetch(`${BASE}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
});
const json = async r => ({ ...(await r.json()), http: r.status });
const como = token => ({ authorization: `Bearer ${token}` });

async function login(account) {
    let r = await pedir('POST', '/api/auth/nonce', { address: account.address });
    const { nonce, message } = await r.json();
    const signature = await account.signMessage({ message });
    r = await pedir('POST', '/api/auth/verify', { nonce, signature });
    return (await r.json()).token;
}

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            if ((await fetch(`${BASE}/api/admin/session`, { headers: admin })).ok) return;
        } catch { }
        await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('El server no arranco.');
}

async function main() {
    require('../server.js');
    await waitForServer();
    const packs = require('../lib/packsStore');
    const { CARTAS } = require('../lib/packCards');
    const t = { ana: await login(ana), beto: await login(beto), caro: await login(caro) };
    const abrir = quien => pedir('POST', '/api/packs/open', {}, como(t[quien]));
    const config = cambios => pedir('PATCH', '/api/admin/packs/config', cambios, admin);

    console.log('\nAntes de abrir');
    let r = await json(await fetch(`${BASE}/api/packs/config`));
    check('arranca sin abrir', r.http === 200 && r.status === 'upcoming' && r.cards.length === CARTAS.length);
    check('las chances publicas suman 1', Math.abs(Object.values(r.rarities).reduce((s, x) => s + x.chance, 0) - 1) < 1e-9);
    check('sin sesion no se abre', (await pedir('POST', '/api/packs/open')).status === 401);
    check('cerrado no se abre', (await json(await abrir('ana'))).reason === 'upcoming');
    check('sin token de admin no se configura', (await pedir('PATCH', '/api/admin/packs/config', { status: 'open' })).status === 401);
    check('se abre desde el admin', (await json(await config({ status: 'open' }))).status === 'open');
    // Sin The Chosen hasta que se prueba el sorteo: si alguien la saca antes
    // por azar, el sorteo podria elegir a otro.
    await config({ rarities: { common: { chance: 5500, points: 5 }, uncommon: { chance: 2500, points: 10 }, rare: { chance: 1200, points: 25 }, epic: { chance: 600, points: 60 }, legendary: { chance: 200, points: 200 }, chosen: { chance: 0, points: 500 } } });

    console.log('\nRegistro');
    check('sin registrarse no se abre', (await json(await abrir('ana'))).reason === 'not-registered');
    r = await json(await pedir('POST', '/api/packs/register', { nickname: 'Ana', x: '', discord: '' }, como(t.ana)));
    check('sin X ni Discord no se registra', r.http === 400);
    r = await json(await pedir('POST', '/api/packs/register', { nickname: 'a', x: 'ana_x' }, como(t.ana)));
    check('apodo invalido no se registra', r.http === 400);
    check('el apodo invalido no dejo la red guardada', !require('../lib/profileStore').getProfile(ana.address));
    r = await json(await pedir('POST', '/api/packs/register', { nickname: 'Ana', x: '@Ana_X' }, como(t.ana)));
    check('se registra con apodo y X', r.http === 200 && r.registered && r.nickname === 'Ana' && r.x === 'Ana_X', JSON.stringify(r));
    r = await json(await pedir('POST', '/api/packs/register', { nickname: 'Beto', x: 'ana_x' }, como(t.beto)));
    check('el mismo X no sirve para otra wallet', r.http === 409);
    check('y no le dejo el apodo', !require('../lib/nicknameStore').getNickname(beto.address));
    r = await json(await pedir('POST', '/api/packs/register', { nickname: 'ana', discord: 'beto' }, como(t.beto)));
    check('el mismo apodo tampoco', r.http === 409);
    r = await json(await pedir('POST', '/api/packs/register', { nickname: 'Beto', discord: 'beto.d' }, como(t.beto)));
    check('se registra con Discord', r.http === 200 && r.registered);
    await pedir('POST', '/api/packs/register', { nickname: 'Caro', discord: 'caro' }, como(t.caro));

    console.log('\nAbrir');
    r = await json(await abrir('ana'));
    const puntos = c => ({ common: 5, uncommon: 10, rare: 25, epic: 60, legendary: 200 })[CARTAS[c - 1].rarity];
    check('da 5 cartas que existen', r.http === 200 && r.pack.cards.length === 5 && r.pack.cards.every(c => CARTAS[c - 1]));
    check('los puntos son los de cada rareza', r.pack.points === r.pack.cards.reduce((s, c) => s + puntos(c), 0));
    check('y quedan en el resumen', r.me.points === r.pack.points && r.me.openedToday === 1 && r.me.streak.current === 1);

    console.log('\nCompartir');
    const compartido = await json(await fetch(`${BASE}/api/packs/pull/${r.pack.id}`));
    check('el pack se ve por su id', compartido.http === 200 && compartido.points === r.pack.points && compartido.nickname === 'Ana');
    check('con las cartas completas', compartido.cards.map(c => c.id).join() === r.pack.cards.join() && compartido.cards.every(c => c.rarity));
    check('sin la wallet', !JSON.stringify(compartido).includes(ana.address.toLowerCase()));
    check('un id que no existe da 404', (await fetch(`${BASE}/api/packs/pull/no-existe`)).status === 404);
    const og = await fetch(`${BASE}/api/packs/og/${r.pack.id}.jpg`);
    const png = Buffer.from(await og.arrayBuffer());
    check('la imagen para X es un JPEG', og.status === 200 && og.headers.get('content-type') === 'image/jpeg' && png[0] === 0xff && png[1] === 0xd8);
    check('la URL vieja en .png sigue andando', (await fetch(`${BASE}/api/packs/og/${r.pack.id}.png`)).status === 200);
    check('la imagen de un id que no existe da 404', (await fetch(`${BASE}/api/packs/og/no-existe.jpg`)).status === 404);

    console.log('\nNiveles');
    check('sin Primals tiene 1 por dia', r.me.tier === 'none' && r.me.limit === 1);
    r = await json(await abrir('ana'));
    check('y el segundo no sale', r.http === 409 && r.reason === 'no-packs');
    holders.add(ana.address.toLowerCase());
    let me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.ana) }));
    check('al volverse holder pasa a 3', me.tier === 'holder' && me.limit === 3);
    await abrir('ana');
    await abrir('ana');
    check('el cuarto del holder no sale', (await json(await abrir('ana'))).reason === 'no-packs');
    const activo = path.join(TMP, '_generated', 'staking', 'active.json');
    fs.mkdirSync(path.dirname(activo), { recursive: true });
    fs.writeFileSync(activo, JSON.stringify({ 7: { wallet: ana.address.toLowerCase(), endsAt: new Date(Date.now() + 86400000).toISOString() } }));
    r = await json(await abrir('ana'));
    check('con un Primal en staking pasa a 4', r.http === 200 && r.me.tier === 'staker' && r.me.limit === 4);
    check('y despues no', (await json(await abrir('ana'))).reason === 'no-packs');
    fs.writeFileSync(activo, '{}');
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.ana) }));
    check('si saca el staking vuelve a 3', me.tier === 'holder' && me.limit === 3 && me.openedToday === 4);
    holders.delete(ana.address.toLowerCase());
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.ana) }));
    check('y si vende el Primal vuelve a 1', me.tier === 'none' && me.limit === 1);
    check('la coleccion tiene las 20 cartas', Object.values(me.collection).reduce((s, n) => s + n, 0) === 20);
    check('con un Primal en staking pero sin el Primal no cuenta como staker', (() => {
        fs.writeFileSync(activo, JSON.stringify({ 7: { wallet: ana.address.toLowerCase(), endsAt: new Date(Date.now() + 86400000).toISOString() } }));
        return true;
    })() && (await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.ana) }))).tier === 'none');
    fs.writeFileSync(activo, '{}');

    console.log('\nPacks extra');
    r = await json(await fetch(`${BASE}/api/packs/config`));
    check('sin treasury no se venden', r.extra === null && packs.puedeComprarExtra(caro.address).reason === 'no-extras');
    process.env.FORGE_TREASURY = '0x000000000000000000000000000000000000beef';
    r = await json(await fetch(`${BASE}/api/packs/config`));
    check('con treasury salen a 20 APE, maximo 2', r.extra && r.extra.price === '20' && r.extra.max === 2 && r.extra.priceWei === '20000000000000000000');
    const pago = n => ({ txHash: '0x' + String(n).padStart(64, 'a'), valueWei: '20000000000000000000', blockNumber: '1' });
    check('caro abre su pack gratis', (await json(await abrir('caro'))).http === 200);
    r = packs.buyExtra(caro.address, pago(1), { tier: 'none' });
    check('un extra suma un pack hoy', r.me.limit === 2 && r.me.extrasToday === 1);
    check('abre el extra', (await json(await abrir('caro'))).http === 200);
    check('el mismo pago no suma dos veces', packs.buyExtra(caro.address, pago(1), { tier: 'none' }).me.extrasToday === 1);
    check('otra wallet no puede usar ese pago', packs.buyExtra(beto.address, pago(1)).reason === 'wrong-sender');
    packs.buyExtra(caro.address, pago(2), { tier: 'none' });
    check('el tercero del dia no se puede comprar', packs.puedeComprarExtra(caro.address).reason === 'max-extras');
    const manana = Date.now() + 86400000;
    check('al dia siguiente los extras no se acumulan', packs.resumen(caro.address, { tier: 'none' }, manana).limit === 1);
    check('y se pueden volver a comprar', packs.puedeComprarExtra(caro.address, manana).ok);
    r = require('../lib/stakingStore').buyFog(caro.address, pago(2));
    check('un pago de extra no sirve para comprar FOG', r.code === 'already-used');
    r = await json(await pedir('POST', '/api/packs/extra', { txHash: pago(1).txHash }, como(t.caro)));
    check('por la ruta, un hash ya acreditado devuelve el resumen', r.http === 200 && r.me.extrasToday === 2);
    r = await json(await pedir('POST', '/api/packs/extra', { txHash: pago(3).txHash }, como(t.caro)));
    check('por la ruta, pasado el maximo no verifica el pago', r.http === 409 && r.reason === 'max-extras');

    const perdidos = require('../lib/pagosPerdidos');
    const cobros = require('../lib/forgePayments');
    const buscarReal = perdidos.pagosAlTesoro;
    const verificarReal = cobros.verifyPayment;
    perdidos.pagosAlTesoro = async () => [
        { txHash: pago(1).txHash, valueWei: '20000000000000000000' },
        { txHash: pago(4).txHash, valueWei: '20000000000000000000' },
        { txHash: pago(5).txHash, valueWei: '1000000000000000000' },
    ];
    cobros.verifyPayment = async txHash => ({ txHash, wallet: caro.address, valueWei: '20000000000000000000', blockNumber: '1' });
    r = await json(await pedir('POST', '/api/packs/extra/recover', {}, como(t.caro)));
    check('recupera solo el pago sin registrar y con el precio', r.http === 200 && r.recovered === 1 && r.me.extrasToday === 3, JSON.stringify(r));
    check('no se puede buscar seguido', (await pedir('POST', '/api/packs/extra/recover', {}, como(t.caro))).status === 429);
    check('el admin ve el recuperado', packs.adminSummary().credited.some(e => e.txHash === pago(4).txHash && e.source === 'recovered'));
    check('economy lo marca', require('../lib/apePayments').resumen().payments.find(p => p.txHash === pago(4).txHash)?.source === 'recovered');
    perdidos.pagosAlTesoro = buscarReal;
    cobros.verifyPayment = verificarReal;
    const extrasPath = path.join(packs.PACKS_DIR, 'extras.json');
    const sinRecuperado = JSON.parse(fs.readFileSync(extrasPath, 'utf8'));
    delete sinRecuperado[pago(4).txHash];
    fs.writeFileSync(extrasPath, JSON.stringify(sinRecuperado));
    r = await json(await config({ tiers: { none: 2, holder: 5, staker: 7 }, extraPrice: 10, extraMax: 1 }));
    check('el admin cambia niveles y extras', r.http === 200 && r.config.tiers.staker === 7 && r.config.extraPrice === 10 && r.config.extraMax === 1);
    check('niveles fuera de rango se rechazan', (await config({ tiers: { none: 99 } })).status === 400);
    await config({ tiers: { none: 1, holder: 3, staker: 4 }, extraPrice: 20, extraMax: 2 });
    r = await json(await config({ prizes: [' 5 Primals ', '4 Primals', '', ''] }));
    const publica = await json(await fetch(`${BASE}/api/packs/config`));
    check('los premios por puesto se guardan y son publicos', r.http === 200 && publica.prizes.join('|') === '5 Primals|4 Primals', JSON.stringify(publica.prizes));
    check('un puesto vacio en el medio se rechaza', (await config({ prizes: ['A', '', 'C'] })).status === 400);
    await config({ collectionPrize: '  1 Primal  ' });
    const conPremio = await json(await fetch(`${BASE}/api/packs/config`));
    const tabla = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    check('el premio por coleccion completa es publico', conPremio.collectionPrize === '1 Primal' && Array.isArray(tabla.collectors), JSON.stringify(conPremio.collectionPrize));
    await config({ collectionPrize: '' });
    check('el premio por coleccion se puede sacar', (await json(await fetch(`${BASE}/api/packs/config`))).collectionPrize === null);
    delete process.env.FORGE_TREASURY;

    console.log('\nPacks de regalo');
    check('caro recibe 2 packs de premio', packs.grantPacks(caro.address, 2, 'raffle:r1:prize:0').granted === 2 && packs.resumen(caro.address, { tier: 'none' }).bonusPacks === 2);
    check('el mismo premio no se da dos veces', packs.grantPacks(caro.address, 2, 'raffle:r1:prize:0').granted === 0);
    r = await json(await abrir('caro'));
    check('primero usa el extra del dia', r.http === 200 && r.me.bonusPacks === 2 && r.me.openedToday === 3);
    r = await json(await abrir('caro'));
    check('despues abre uno de regalo', r.http === 200 && r.me.bonusPacks === 1 && r.me.openedToday === 3);
    check('el regalo no vence al otro dia', packs.resumen(caro.address, { tier: 'none' }, manana).bonusPacks === 1);
    check('tambien se da como premio de codigo o raffle', !require('../lib/promoStore').grantReward('pack', caro.address, 1, 'codigo1').error && packs.resumen(caro.address, { tier: 'none' }).bonusPacks === 2);
    await abrir('caro');
    await abrir('caro');
    r = await json(await abrir('caro'));
    check('sin regalos ni packs del dia no abre', r.http === 409 && r.reason === 'no-packs');
    check('el admin ve los packs regalados', packs.adminSummary().totals.gifted === 3);
    r = packs.adminSummary();
    check('el admin ve jugadores por dia', r.daily.length >= 1 && r.daily[0].players >= 1 && r.daily.reduce((n, d) => n + d.newPlayers, 0) === r.totals.players && r.daily.reduce((n, d) => n + d.packs, 0) === r.totals.packs);
    check('cada dia lista sus jugadores y marca los nuevos', r.daily.every(d => d.wallets.length === d.players && d.wallets.filter(w => w.isNew).length === d.newPlayers && d.wallets.reduce((n, w) => n + w.packs, 0) === d.packs));

    console.log('\nRareza y config');
    check('chances que no suman 100 se rechazan', (await config({ rarities: { common: { chance: 100, points: 5 } } })).status === 400);
    r = await json(await config({ rarities: { common: { chance: 0, points: 5 }, uncommon: { chance: 0, points: 10 }, rare: { chance: 0, points: 25 }, epic: { chance: 0, points: 60 }, legendary: { chance: 10000, points: 200 }, chosen: { chance: 0, points: 500 } } }));
    check('se cambian las chances', r.http === 200 && r.config.rarities.legendary.chance === 10000);
    holders.add(beto.address.toLowerCase());
    r = await json(await abrir('beto'));
    check('con 100% legendaria salen todas legendarias', r.pack.cards.every(c => CARTAS[c - 1].rarity === 'legendary') && r.pack.points === 1000);
    await config({ rarities: { common: { chance: 5500, points: 5 }, uncommon: { chance: 2500, points: 10 }, rare: { chance: 1200, points: 25 }, epic: { chance: 600, points: 60 }, legendary: { chance: 200, points: 200 }, chosen: { chance: 0, points: 500 } } });

    console.log('\nThe Chosen');
    await config({ rarities: { common: { chance: 0, points: 5 }, uncommon: { chance: 0, points: 10 }, rare: { chance: 0, points: 25 }, epic: { chance: 0, points: 60 }, legendary: { chance: 0, points: 200 }, chosen: { chance: 10000, points: 500 } } });
    r = await json(await abrir('beto'));
    check('con 100% Chosen sale la carta 53 una sola vez por pack', r.http === 200 && r.pack.cards.filter(c => c === 53).length === 1 && r.pack.cards.length === 5, JSON.stringify(r.pack));
    check('y beto queda en el sorteo', r.me.chosenEntered === true);
    packs.grantPacks(beto.address, 1, 'test:chosen-repetida');
    r = await json(await abrir('beto'));
    check('quien ya tiene The Chosen no la vuelve a sacar', r.http === 200 && !r.pack.cards.includes(53), JSON.stringify(r.pack));
    r = await json(await fetch(`${BASE}/api/admin/packs`, { headers: admin }));
    check('el admin ve a beto como participante una sola vez', r.chosen.entrants.length === 1 && r.chosen.entrants[0].pulls === 1 && r.chosen.entrants[0].wallet === beto.address.toLowerCase());
    const sacadas = r.pulledByRarity;
    check('el admin cuenta las cartas sacadas por rareza', sacadas.chosen.count === 1 && Object.values(sacadas).reduce((s, x) => s + x.count, 0) === r.totals.packs * 5, JSON.stringify(sacadas));
    check('y cuantas se esperaban segun las chances', sacadas.chosen.expected === r.totals.packs * 5 && sacadas.common.expected === 0, JSON.stringify(sacadas));
    r = await json(await pedir('POST', '/api/admin/packs/raffles/chosen/draw', {}, admin));
    check('con la competencia abierta no se sortea', r.http === 409);
    await config({ rarities: { common: { chance: 5490, points: 5 }, uncommon: { chance: 2500, points: 10 }, rare: { chance: 1200, points: 25 }, epic: { chance: 600, points: 60 }, legendary: { chance: 200, points: 200 }, chosen: { chance: 10, points: 500 } } });

    console.log('\nRanking');
    r = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    check('beto primero con su apodo', r.top[0].wallet === beto.address.toLowerCase() && r.top[0].nickname === 'Beto' && r.top[0].rank === 1);
    check('figuran los tres que abrieron', r.players === 3);
    r = await json(await pedir('PUT', `/api/admin/packs/players/${beto.address}/disqualified`, { reason: 'bot' }, admin));
    check('el admin descalifica', r.http === 200 && r.players.find(p => p.wallet === beto.address.toLowerCase()).disqualified.reason === 'bot');
    r = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    check('descalificado sale del ranking', r.top.every(f => f.wallet !== beto.address.toLowerCase()) && r.players === 2);
    check('y de la lista publica de The Chosen', r.chosen.length === 0);
    check('y no puede abrir', (await json(await abrir('beto'))).reason === 'disqualified');
    await pedir('PUT', `/api/admin/packs/players/${beto.address}/disqualified`, { disqualified: false }, admin);
    check('se le saca la descalificacion', (await json(await fetch(`${BASE}/api/packs/leaderboard`))).players === 3);
    const puntosBeto = r => r.top.find(f => f.wallet === beto.address.toLowerCase())?.points;
    const antesAjuste = puntosBeto(await json(await fetch(`${BASE}/api/packs/leaderboard`)));
    r = await json(await pedir('PUT', `/api/admin/packs/players/${beto.address}/adjust`, { points: -1, reason: 'prueba' }, admin));
    check('el admin resta puntos', r.http === 200 && r.players.find(p => p.wallet === beto.address.toLowerCase()).adjust.points === -1);
    check('el ranking muestra el total ajustado', puntosBeto(await json(await fetch(`${BASE}/api/packs/leaderboard`))) === antesAjuste - 1);
    check('puntos invalidos se rechazan', (await pedir('PUT', `/api/admin/packs/players/${beto.address}/adjust`, { points: 1.5 }, admin)).status === 400);
    r = await json(await pedir('PUT', `/api/admin/packs/players/${beto.address}/adjust`, { points: 0 }, admin));
    check('0 saca el ajuste', r.players.find(p => p.wallet === beto.address.toLowerCase()).adjust === null && puntosBeto(await json(await fetch(`${BASE}/api/packs/leaderboard`))) === antesAjuste);
    r = await json(await pedir('DELETE', `/api/admin/packs/players/${beto.address}/social`, undefined, admin));
    check('el admin libera su Discord', r.http === 200 && r.players.find(p => p.wallet === beto.address.toLowerCase()).discord === '');

    console.log('\nRacha');
    const dia = 86400000;
    const base = Date.parse('2030-01-10T12:00:00Z');
    packs.open(caro.address, {}, base);
    packs.open(caro.address, {}, base + dia);
    let s = packs.open(caro.address, {}, base + 2 * dia).me.streak;
    check('tres dias seguidos', s.current === 3 && s.best === 3, JSON.stringify(s));
    s = packs.resumen(caro.address, {}, base + 3 * dia).streak;
    check('hoy todavia no abrio: la racha sigue', s.current === 3);
    s = packs.resumen(caro.address, {}, base + 4 * dia).streak;
    check('salteo un dia: vuelve a cero', s.current === 0 && s.best === 3);

    console.log('\nFin y ganadores');
    r = await json(await config({ endsAt: new Date(Date.now() - 1000).toISOString() }));
    check('con fecha pasada termina sola', r.status === 'ended');
    check('terminado no se abre', (await json(await abrir('caro'))).reason === 'ended');
    const primero = (await json(await fetch(`${BASE}/api/packs/leaderboard`))).top[0].wallet;
    const ganador = [ana, beto, caro].find(a => a.address.toLowerCase() === primero);
    const perdedor = [ana, beto, caro].find(a => a !== ganador);
    const tokenDe = a => t[a === ana ? 'ana' : a === beto ? 'beto' : 'caro'];
    const meDe = async a => json(await fetch(`${BASE}/api/packs/me`, { headers: como(tokenDe(a)) }));
    const premiosAntes = (await json(await fetch(`${BASE}/api/packs/config`))).prizes;
    await config({ prizes: [] });
    check('sin premios ni ganadores definidos nadie gana', !(await meDe(ganador)).winner);
    await config({ prizes: premiosAntes });
    check('sin ganadores definidos ganan tantos como premios', premiosAntes.length > 0 && (await meDe(ganador)).winner === true);
    await config({ winners: 1 });
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(tokenDe(ganador)) }));
    check('el primero es ganador', me.winner && me.rank === 1);
    const sol = 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy';
    check('una wallet de Solana invalida no', (await pedir('PUT', '/api/packs/solana', { address: '0xabc' }, como(tokenDe(ganador)))).status === 400);
    r = await json(await pedir('PUT', '/api/packs/solana', { address: sol }, como(tokenDe(ganador))));
    check('el ganador deja su Solana', r.http === 200 && r.solana === sol);
    check('el que no gano no puede', (await pedir('PUT', '/api/packs/solana', { address: sol }, como(tokenDe(perdedor)))).status === 403);
    r = await json(await fetch(`${BASE}/api/admin/packs`, { headers: admin }));
    check('el admin ve la Solana del ganador', r.players.find(p => p.wallet === primero).solana.address === sol);
    r = await json(await config({ status: 'open' }));
    check('reabrir saca la fecha vieja', r.status === 'open' && r.config.endsAt === null);

    console.log('\nExtras con mejores chances');
    const reglas = { rarities: { common: { chance: 5490 }, uncommon: { chance: 2500 }, rare: { chance: 1200 }, epic: { chance: 600 }, legendary: { chance: 200 }, chosen: { chance: 10 } }, extraBoost: 50 };
    const conBoost = packs.chancesDe(reglas, true);
    check('el extra sube rare, epic y legendary', conBoost.rare === 1800 && conBoost.epic === 900 && conBoost.legendary === 300);
    check('The Chosen no cambia', conBoost.chosen === 10);
    check('sigue sumando 100%', Object.values(conBoost).reduce((s, n) => s + n, 0) === 10000);
    check('los gratis no cambian', packs.chancesDe(reglas, false).rare === 1200);
    r = await json(await config({ extraBoost: 500 }));
    check('boost fuera de rango se rechaza', r.http === 400);

    console.log('\nMeta comunitaria y /api/live');
    r = await json(await config({ goal: { target: 0, reward: 'algo' } }));
    check('meta sin cantidad se rechaza', r.http === 400);
    r = await json(await config({ goal: { target: 5, reward: '' } }));
    check('meta sin premio se rechaza', r.http === 400);
    r = await json(await config({ goal: { target: 5, reward: 'Un pack gratis', from: '2026-01-02', to: '2026-01-01' } }));
    check('meta que termina antes de empezar se rechaza', r.http === 400);
    const totalPacks = fs.readFileSync(path.join(packs.PACKS_DIR, 'opens.jsonl'), 'utf8').split('\n').filter(l => l.trim() && !JSON.parse(l).gift).length;
    r = await json(await config({ goal: { target: totalPacks + 1, reward: 'Un pack gratis', from: '2000-01-01T00:00:00Z' } }));
    check('la meta cuenta todos los packs desde la fecha', r.http === 200 && r.goal.progress === totalPacks && r.goal.status === 'running', JSON.stringify(r.goal));
    r = await json(await config({ goal: { target: totalPacks, reward: 'Un pack gratis', from: '2000-01-01T00:00:00Z' } }));
    check('llegar al numero la marca cumplida', r.goal.status === 'reached');
    r = await json(await config({ goal: { target: 3, reward: 'Un pack gratis', from: '2100-01-01T00:00:00Z' } }));
    check('una meta que arranca despues cuenta 0', r.goal.progress === 0);
    const vivo = await json(await fetch(`${BASE}/api/live`));
    check('/api/live responde', vivo.http === 200 && Array.isArray(vivo.activity) && typeof vivo.staking.staking === 'number' && Array.isArray(vivo.packs.top));
    check('/api/live trae la meta', vivo.packs.goal?.target === 3);
    check('/api/live no pasa de 3 en el top', vivo.packs.top.length <= 3);
    r = await json(await config({ goal: { target: 200, reward: 'Un pack gratis', daily: true, from: '2000-01-01T00:00:00Z' } }));
    const hoyUtc = new Date().toISOString().slice(0, 10);
    check('meta diaria arranca a las 00 UTC de hoy', r.http === 200 && r.goal.daily === true && r.goal.from === `${hoyUtc}T00:00:00.000Z`, JSON.stringify(r.goal));
    check('meta diaria termina a las 00 UTC de mañana', Date.parse(r.goal.to) - Date.parse(r.goal.from) === 86400000);
    check('meta diaria cuenta solo los packs de hoy', r.goal.progress <= totalPacks && r.goal.status === 'running');
    console.log('\nPremio de la meta diaria');
    const diaMeta = Date.now() + 2 * 86400000;
    await config({ goal: { target: 2, reward: 'Un Primal Event Pack', daily: true } });
    packs.open(ana.address, {}, diaMeta - 86400000);
    const bonusAntes = packs.resumen(ana.address, {}, diaMeta).bonusPacks;
    check('abrir el primero no da premio', packs.open(ana.address, {}, diaMeta).me.goalRewardToday === false);
    packs.open(caro.address, {}, diaMeta);
    let yo = packs.resumen(ana.address, {}, diaMeta);
    check('al llegar a la meta recibe el que tiene racha de 2 dias', yo.goalRewardToday === true && yo.bonusPacks === bonusAntes + 1, JSON.stringify(yo));
    check('el que abrio hoy pero sin racha no', packs.resumen(caro.address, {}, diaMeta).goalRewardToday === false);
    check('el que no abrio ese dia no', packs.resumen(beto.address, {}, diaMeta).goalRewardToday === false);
    packs.open(caro.address, {}, diaMeta);
    check('no se da dos veces', packs.resumen(ana.address, {}, diaMeta).bonusPacks === bonusAntes + 1);
    check('el dia siguiente arranca sin premio', packs.resumen(ana.address, {}, diaMeta + 86400000).goalRewardToday === false);
    while (packs.resumen(ana.address, {}, diaMeta).openedToday < packs.resumen(ana.address, {}, diaMeta).limit) packs.open(ana.address, {}, diaMeta);
    const progresoAntes = packs.enVivo(diaMeta).goal?.progress;
    const regalo = packs.open(ana.address, {}, diaMeta);
    check('abre el pack de regalo', !regalo.error && regalo.me.bonusPacks === bonusAntes, JSON.stringify(regalo));
    check('el pack de regalo no suma a la meta', progresoAntes === 2 && packs.enVivo(diaMeta).goal?.progress === progresoAntes, `${progresoAntes}`);
    const otroDia = diaMeta + 86400000;
    packs.updateConfig({ goal: { target: 100, reward: 'Un Primal Event Pack', daily: true } }, otroDia);
    packs.open(ana.address, {}, otroDia);
    check('lejos de la meta no hay premio', packs.resumen(ana.address, {}, otroDia).goalRewardToday === false);
    packs.updateConfig({ goal: { target: 1, reward: 'Un Primal Event Pack', daily: true } }, otroDia);
    check('guardar una meta ya cumplida reparte sin abrir otro pack', packs.resumen(ana.address, {}, otroDia).goalRewardToday === true);
    r = await json(await config({ goal: null }));
    check('la meta se puede sacar', r.http === 200 && r.goal === null);

    console.log('\nUpgrade de repetidas');
    const elegir = (rarity, n) => {
        const col = { ...packs.resumen(caro.address).collection };
        const ids = [];
        for (let i = 0; i < n; i++) {
            const id = CARTAS.filter(c => c.rarity === rarity && (col[c.id] || 0) > 1).sort((a, b) => col[b.id] - col[a.id])[0]?.id;
            if (id === undefined) break;
            col[id]--;
            ids.push(id);
        }
        return ids;
    };
    const cantidadDe = (kind, rarity) => packs.getConfig().upgrades[kind === 'up' ? 'tradeUp' : 'swap'][rarity] || 0;
    const upgradear = (quien, kind, rarity, cards) => pedir('POST', '/api/packs/upgrade', { kind, cards: cards ?? elegir(rarity, cantidadDe(kind, rarity)) }, como(t[quien]));
    r = await json(await fetch(`${BASE}/api/packs/config`));
    check('sin fecha no se publica el upgrade', r.upgrades === null);
    check('sin fecha esta cerrado', (await json(await upgradear('caro', 'up', 'common'))).reason === 'upgrades-locked');
    const enUnDia = new Date(Date.now() + 86400000).toISOString();
    r = await json(await config({ upgrades: { from: enUnDia } }));
    check('el admin pone la fecha', r.http === 200 && r.config.upgrades.from === enUnDia && r.config.upgrades.tradeUp.common === 10 && r.config.upgrades.swap.common === 3);
    r = await json(await fetch(`${BASE}/api/packs/config`));
    check('con fecha se publica para la cuenta regresiva', r.upgrades?.from === enUnDia && r.upgrades.tradeUp.epic === 5);
    check('antes de la fecha sigue cerrado', (await json(await upgradear('caro', 'up', 'common'))).reason === 'upgrades-locked');
    check('una cantidad invalida se rechaza', (await json(await config({ upgrades: { swap: { common: -1 } } }))).http === 400);
    check('una fecha invalida se rechaza', (await json(await config({ upgrades: { from: 'mañana' } }))).http === 400);
    await config({ upgrades: { from: new Date(Date.now() - 1000).toISOString() } });
    check('legendary no sube a nada', (await json(await upgradear('caro', 'up', 'legendary'))).http === 400);
    check('un tipo desconocido no', (await json(await upgradear('caro', 'otro', 'common'))).http === 400);

    const rarezaDe = new Map(CARTAS.map(c => [String(c.id), c.rarity]));
    const repetidas = (col, rz) => Object.entries(col).filter(([id]) => rarezaDe.get(id) === rz).reduce((s, [, k]) => s + Math.max(0, k - 1), 0);
    const totalDe = (col, rz) => Object.entries(col).filter(([id]) => rarezaDe.get(id) === rz).reduce((s, [, k]) => s + k, 0);
    await config({ upgrades: { tradeUp: { common: 200 } } });
    const unaComun = CARTAS.find(c => c.rarity === 'common' && packs.resumen(caro.address).collection[c.id]).id;
    check('sin repetidas suficientes no', (await json(await upgradear('caro', 'up', 'common', Array(200).fill(unaComun)))).reason === 'not-enough');
    await config({ upgrades: { tradeUp: { common: 0 } } });
    check('en 0 queda apagado', (await json(await upgradear('caro', 'up', 'common'))).http === 400);
    await config({ upgrades: { tradeUp: { common: 10 } } });
    const lejos = Date.now() + 400 * 86400000;
    for (let d = 0; d < 100 && repetidas(packs.resumen(caro.address).collection, 'common') < 10; d++) {
        for (let k = 0; k < 4; k++) packs.open(caro.address, { tier: 'staker' }, lejos + d * 86400000);
    }
    let antes = packs.resumen(caro.address);
    check('junto 10 comunes repetidas', repetidas(antes.collection, 'common') >= 10);
    const otraRareza = CARTAS.find(c => c.rarity === 'uncommon' && (antes.collection[c.id] || 0) > 1)?.id;
    if (otraRareza) check('mezclar rarezas no', (await json(await upgradear('caro', 'up', 'common', [...elegir('common', 9), otraRareza]))).http === 400);
    const unica = CARTAS.find(c => c.rarity === 'common' && antes.collection[c.id] === 1)?.id;
    if (unica) check('la ultima copia no se puede usar', (await json(await upgradear('caro', 'up', 'common', [...elegir('common', 9), unica]))).reason === 'not-enough');
    check('con 9 cartas no alcanza', (await json(await upgradear('caro', 'up', 'common', elegir('common', 9)))).reason === 'wrong-amount');
    check('un id que no existe no', (await json(await upgradear('caro', 'up', 'common', [...elegir('common', 9), 99999]))).http === 400);
    check('sin cartas no', (await json(await upgradear('caro', 'up', 'common', []))).http === 400);
    const pedidas = elegir('common', 10);
    const uncommonsAntes = CARTAS.filter(c => c.rarity === 'uncommon' && antes.collection[c.id]).length;
    r = await json(await upgradear('caro', 'up', 'common', pedidas));
    check('gasta justo las cartas elegidas', JSON.stringify(r.upgrade?.spent) === JSON.stringify(pedidas.reduce((m, id) => ({ ...m, [id]: (m[id] || 0) + 1 }), {})));
    check('el trade-up responde', r.http === 200 && r.upgrade?.kind === 'up', JSON.stringify(r));
    let ganada = CARTAS.find(c => c.id === r.upgrade?.card);
    check('sube a uncommon', ganada?.rarity === 'uncommon');
    check('si faltaba una, da una que faltaba', uncommonsAntes === CARTAS.filter(c => c.rarity === 'uncommon').length || (r.upgrade.new && !antes.collection[ganada.id]));
    let despues = r.me;
    check('no da ni quita puntos', despues.points === antes.points && despues.packs === antes.packs && despues.rank === antes.rank);
    check('gasta 10 comunes', totalDe(despues.collection, 'common') === totalDe(antes.collection, 'common') - 10);
    check('suma 1 uncommon', totalDe(despues.collection, 'uncommon') === totalDe(antes.collection, 'uncommon') + 1);
    check('nunca gasta la ultima copia', Object.keys(antes.collection).every(id => despues.collection[id] >= 1));

    const comunes = CARTAS.filter(c => c.rarity === 'common');
    const faltaComun = comunes.some(c => !despues.collection[c.id]);
    antes = despues;
    r = await json(await upgradear('caro', 'swap', 'common'));
    const alcanzan = repetidas(antes.collection, 'common') >= 3;
    if (faltaComun && alcanzan) {
        ganada = CARTAS.find(c => c.id === r.upgrade?.card);
        check('el canje da una comun que faltaba', r.http === 200 && ganada?.rarity === 'common' && !antes.collection[ganada.id] && r.upgrade.new);
        check('el canje gasta 3 y suma 1', totalDe(r.me.collection, 'common') === totalDe(antes.collection, 'common') - 2);
    } else if (alcanzan) {
        check('sin comunes faltantes el canje no se hace', r.reason === 'nothing-missing');
    } else {
        check('el canje sin repetidas no se hace', r.http >= 400 && !r.upgrade);
    }
    const lineas = fs.readFileSync(path.join(packs.PACKS_DIR, 'upgrades.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    check('se guarda en upgrades.jsonl', lineas.length >= 1 && lineas[0].kind === 'up' && lineas[0].rarity === 'common');
    r = await json(await fetch(`${BASE}/api/admin/packs`, { headers: admin }));
    check('el admin cuenta los upgrades', r.totals.upgrades === lineas.length);
    await config({ status: 'ended' });
    check('terminada la competencia no hay upgrades', (await json(await upgradear('caro', 'up', 'common'))).reason === 'closed');

    console.log('\nSorteos verificables');
    await config({ status: 'open' });
    const RAREZAS_TEST = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'chosen'];
    const PUNTOS = { common: 5, uncommon: 10, rare: 25, epic: 60, legendary: 200, chosen: 500 };
    const solo = rareza => ({ rarities: Object.fromEntries(RAREZAS_TEST.map(x => [x, { chance: x === rareza ? 10000 : 0, points: PUNTOS[x] }])) });
    for (const rareza of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
        await config(solo(rareza));
        const deEsta = CARTAS.filter(c => c.rarity === rareza);
        for (let i = 0; i < 600 && deEsta.some(c => !packs.resumen(caro.address).collection[c.id]); i++) {
            packs.grantPacks(caro.address, 1, `test:coleccion:${rareza}:${i}`);
            packs.open(caro.address);
        }
    }
    check('caro completa la coleccion', packs.resumen(caro.address).collectionComplete === true);
    await config(solo('chosen'));
    packs.grantPacks(ana.address, 1, 'test:chosen-ana');
    packs.open(ana.address);
    await config({ rarities: { common: { chance: 5490, points: 5 }, uncommon: { chance: 2500, points: 10 }, rare: { chance: 1200, points: 25 }, epic: { chance: 600, points: 60 }, legendary: { chance: 200, points: 200 }, chosen: { chance: 10, points: 500 } } });
    check('sin premio de coleccion no hay sorteo de coleccion', !packs.resumen(caro.address).raffles.collection);
    await config({ collectionPrize: 'Mudwater cards', status: 'ended' });
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.caro) }));
    check('caro queda anotada en el sorteo de coleccion', me.raffles.collection === 'entered');
    r = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    const anoAna = ana.address.toLowerCase();
    const anoBeto = beto.address.toLowerCase();
    check('el sorteo de la Chosen esta pendiente con beto y ana', r.raffles.chosen.status === 'pending' && r.raffles.chosen.entrants.map(e => e.wallet).join() === [anoBeto, anoAna].join() && r.raffles.chosen.prize === 'Mudwater pack', JSON.stringify(r.raffles.chosen));
    check('el de coleccion tiene su premio', r.raffles.collection.status === 'pending' && r.raffles.collection.prize === 'Mudwater cards');

    await config({ autoDraw: false });
    await packs.sortearAuto();
    r = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    check('con el sorteo automatico apagado no se sortea solo', r.raffles.chosen.status === 'pending' && r.raffles.collection.status === 'pending');
    await config({ autoDraw: true, collectionPrize: '' });
    await packs.sortearAuto();
    r = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    check('encendido sortea la Chosen sola', r.raffles.chosen.status === 'drawing' && r.raffles.chosen.block === bloqueActual + 5, JSON.stringify(r.raffles.chosen));
    check('y no sortea la coleccion si no tiene premio', r.raffles.collection.status === 'none' || r.raffles.collection.status === 'pending');
    await config({ collectionPrize: 'Mudwater cards' });
    await packs.sortearAuto();
    r = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    check('con el premio cargado sortea la coleccion', r.raffles.collection.status === 'drawing');
    await packs.sortearAuto();
    check('no vuelve a sortear lo ya sorteado', (await json(await fetch(`${BASE}/api/packs/leaderboard`))).raffles.chosen.block === bloqueActual + 5);
    await pedir('DELETE', '/api/admin/packs/raffles/chosen/draw', undefined, admin);
    await pedir('DELETE', '/api/admin/packs/raffles/collection/draw', undefined, admin);
    await config({ autoDraw: false });
    r = await json(await pedir('POST', '/api/admin/packs/raffles/chosen/draw', {}, admin));
    check('al sortear se fija un bloque futuro', r.http === 200 && r.raffles.chosen.status === 'drawing' && r.raffles.chosen.block === bloqueActual + 5, JSON.stringify(r.raffles?.chosen));
    check('no se sortea dos veces', (await pedir('POST', '/api/admin/packs/raffles/chosen/draw', {}, admin)).status === 409);
    r = await json(await pedir('DELETE', '/api/admin/packs/raffles/chosen/draw', undefined, admin));
    check('antes del bloque se puede deshacer', r.http === 200 && r.raffles.chosen.status === 'pending');
    r = await json(await pedir('POST', '/api/admin/packs/raffles/chosen/draw', {}, admin));
    const bloqueChosen = r.raffles.chosen.block;
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.ana) }));
    check('mientras se espera el bloque nadie gano', me.raffles.chosen === 'entered' && !me.chosenWinner);
    const hashImpar = '0x' + 'ab'.repeat(31) + '01';
    minados.set(bloqueChosen, hashImpar);
    await esperar(2100);
    r = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    const ch = r.raffles.chosen;
    check('el ganador sale del hash del bloque', ch.status === 'drawn' && ch.hash === hashImpar && ch.index === Number(BigInt(hashImpar) % 2n) && ch.winner === anoAna, JSON.stringify(ch));
    check('y el ranking publico lo marca', r.chosen.find(c => c.wallet === anoAna)?.winner === true);
    check('con hash ya no se puede deshacer', (await pedir('DELETE', '/api/admin/packs/raffles/chosen/draw', undefined, admin)).status === 409);
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.ana) }));
    check('ana gano el sorteo de la Chosen', me.chosenWinner && me.winner && me.raffles.chosen === 'won' && me.prizes.some(p => p.kind === 'chosen' && p.prize === 'Mudwater pack'), JSON.stringify(me.prizes));
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.beto) }));
    check('beto lo perdio', me.raffles.chosen === 'lost' && !me.chosenWinner);

    bloqueActual = 2000;
    minados.set(2005, '0x' + '12'.repeat(32));
    r = await json(await pedir('POST', '/api/admin/packs/raffles/collection/draw', {}, admin));
    check('el de coleccion sale en el momento si el bloque ya esta', r.http === 200 && r.raffles.collection.status === 'drawn' && r.raffles.collection.winner === caro.address.toLowerCase(), JSON.stringify(r.raffles?.collection));
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.caro) }));
    check('caro gano las cartas de Mudwater', me.winner && me.raffles.collection === 'won' && me.prizes.some(p => p.kind === 'collection' && p.prize === 'Mudwater cards'), JSON.stringify(me.prizes));
    r = await json(await pedir('PUT', '/api/packs/solana', { address: 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy' }, como(t.caro)));
    check('y puede dejar su Solana', r.http === 200);
    const lider = (await json(await fetch(`${BASE}/api/packs/leaderboard`))).top[0].wallet;
    const tokenLider = t[[['ana', ana], ['beto', beto], ['caro', caro]].find(([, a]) => a.address.toLowerCase() === lider)[0]];
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(tokenLider) }));
    const premioPrimero = (await json(await fetch(`${BASE}/api/packs/config`))).prizes[0];
    check('el primero tiene su premio de puesto', me.prizes.some(p => p.kind === 'rank' && p.place === 1 && p.prize === premioPrimero), JSON.stringify(me.prizes));
    check('y los premios se suman', me.prizes.length === 1 + (lider === anoAna ? 1 : 0) + (lider === caro.address.toLowerCase() ? 1 : 0));

    console.log('\nTemporadas');
    const rankingMudwater = JSON.stringify((await json(await fetch(`${BASE}/api/packs/leaderboard`))).top);
    const nueva = body => pedir('POST', '/api/admin/packs/seasons', body, admin);
    check('un id invalido no crea temporada', (await nueva({ id: 'Season 2!', name: 'S2' })).status === 400);
    check('sin nombre tampoco', (await nueva({ id: 'season-2' })).status === 400);
    r = await json(await nueva({ id: 'season-2', name: 'Season 2' }));
    check('se crea la temporada', r.http === 201 && r.seasons.length === 2 && r.seasons.find(s => s.id === 'mudwater').current, JSON.stringify(r));
    check('no se crea dos veces', (await nueva({ id: 'season-2', name: 'Otra' })).status === 400);
    check('crear no la hace actual', (await json(await fetch(`${BASE}/api/packs/config`))).season === 'mudwater');
    check('una temporada que no existe da 404', (await fetch(`${BASE}/api/packs/s/nope/config`)).status === 404);
    r = await (await pedir('PUT', '/api/admin/packs/seasons/current', { season: 'season-2' }, admin)).json();
    check('se elige como actual', r.find(s => s.id === 'season-2')?.current === true);
    r = await json(await fetch(`${BASE}/api/packs/config`));
    check('la actual arranca cerrada, sin premios ni Solana', r.season === 'season-2' && r.name === 'Season 2' && r.status === 'upcoming' && r.theme === 'cult' && !r.solana && r.prizes.length === 0, JSON.stringify(r).slice(0, 200));
    r = await json(await fetch(`${BASE}/api/packs/s/mudwater/config`));
    check('Mudwater sigue terminada y con su tema', r.status === 'ended' && r.theme === 'mudwater' && r.solana && r.prizes[0] === premioPrimero);
    await config({ status: 'open' });
    check('el admin sin season toca la actual', (await json(await fetch(`${BASE}/api/packs/s/mudwater/config`))).status === 'ended');
    r = await json(await abrir('ana'));
    check('se abre en la temporada nueva desde cero', r.http === 200 && r.me.points === r.pack.points && r.me.packs === 1 && r.me.rank === 1, JSON.stringify(r.me || r).slice(0, 200));
    check('y se guarda en su carpeta', fs.existsSync(path.join(packs.dirDe('season-2'), 'opens.jsonl')));
    check('el ranking de Mudwater no cambia', JSON.stringify((await json(await fetch(`${BASE}/api/packs/s/mudwater/leaderboard`))).top) === rankingMudwater);
    r = await json(await pedir('POST', '/api/packs/s/mudwater/open', {}, como(t.ana)));
    check('Mudwater no se puede abrir', r.reason === 'ended');
    r = await json(await fetch(`${BASE}/api/packs/pull/${compartido.id}`));
    check('un pack viejo de Mudwater se sigue viendo', r.http === 200 && r.season === 'mudwater' && r.seasonName === 'Primal Cult × Mudwater');
    me = await json(await fetch(`${BASE}/api/packs/s/mudwater/me`, { headers: como(t.caro) }));
    check('en Mudwater caro sigue siendo ganadora', me.winner && me.raffles.collection === 'won');
    r = await json(await fetch(`${BASE}/api/admin/packs?season=mudwater`, { headers: admin }));
    check('el admin ve Mudwater con sus sorteos', r.season === 'mudwater' && r.raffles.collection.status === 'drawn' && r.seasons.length === 2);
    r = await json(await pedir('PUT', '/api/packs/solana', { address: 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy' }, como(t.ana)));
    check('la temporada nueva no pide Solana', r.http === 403);
    const regalosMudwater = packs.temporada('mudwater').resumen(beto.address).bonusPacks;
    packs.grantPacks(beto.address, 1, 'test:season-2');
    check('los packs de regalo van a la actual', packs.temporada('season-2').resumen(beto.address).bonusPacks === 1 && packs.temporada('mudwater').resumen(beto.address).bonusPacks === regalosMudwater);
    const pagoViejo = packs.temporada('mudwater').comprasDeExtras()[0];
    r = packs.temporada('season-2').buyExtra(pagoViejo.wallet, { txHash: pagoViejo.txHash, valueWei: '1', blockNumber: 1 });
    check('un pago de Mudwater no sirve en otra temporada', r.reason === 'already-used', JSON.stringify(r).slice(0, 120));
    r = await json(await fetch(`${BASE}/api/packs/config`));
    check('la temporada nueva arranca sin carta especial', r.specialCard === null && r.cards.every(c => c.rarity !== 'chosen') && r.rarities.chosen.chance === 0);
    check('y sin sorteo de la especial', !packs.temporada('season-2').leaderboard().raffles.chosen.prize);
    check('la especial pide nombre', (await config({ specialName: '  ' })).status === 400);
    await config({ specialCard: true, specialName: 'The Forsaken', chosenPrize: '1 Primal' });
    r = await json(await fetch(`${BASE}/api/packs/config`));
    const especial = r.cards.find(c => c.rarity === 'chosen');
    check('prendida aparece con su nombre', r.specialCard === 'The Forsaken' && especial?.name === 'The Forsaken' && r.rarities.chosen.chance > 0 && r.chosenPrize === '1 Primal');
    check('Mudwater mantiene The Chosen', (await json(await fetch(`${BASE}/api/packs/s/mudwater/config`))).specialCard === 'The Chosen');
    check('y las compras se suman entre temporadas', packs.comprasDeExtras().length === packs.temporada('mudwater').comprasDeExtras().length);

    console.log('\nModo libre');
    const mw = packs.temporada('mudwater');
    const configMw = cambios => pedir('PATCH', '/api/admin/packs/config?season=mudwater', cambios, admin);
    const libre = token => pedir('POST', '/api/packs/s/mudwater/free', {}, como(token));
    check('arranca apagado', (await json(await fetch(`${BASE}/api/packs/s/mudwater/config`))).freeMode === false);
    r = await json(await libre(t.beto));
    check('apagado no se abre', r.http === 409 && r.reason === 'free-off');
    r = await json(await pedir('POST', '/api/packs/free', {}, como(t.ana)));
    check('con la temporada abierta tampoco', r.http === 409 && r.reason === 'free-off');
    await configMw({ freeMode: true });
    check('prendido y terminada lo anuncia', (await json(await fetch(`${BASE}/api/packs/s/mudwater/config`))).freeMode === true);
    const opensAntes = fs.readFileSync(path.join(packs.PACKS_DIR, 'opens.jsonl'), 'utf8');
    const rankingAntes = JSON.stringify(mw.leaderboard());
    const betoAntes = mw.resumen(beto.address);
    const { generatePrivateKey } = require('viem/accounts');
    const dani = privateKeyToAccount(generatePrivateKey());
    const tDani = await login(dani);
    r = await json(await libre(tDani));
    check('abre sin registro ni Primals', r.http === 200 && r.pack.cards.length === 5 && r.me.free.packs === 1 && !r.me.registered, JSON.stringify(r).slice(0, 200));
    check('sin id para compartir ni puntos', !r.pack.id && r.me.points === 0 && r.me.packs === 0);
    r = await json(await libre(tDani));
    check('frena si abre muy seguido', r.http === 429 && r.reason === 'too-soon');
    await configMw(solo('chosen'));
    let nunca = true;
    for (let i = 0; i < 20; i++) nunca = nunca && mw.openFree(beto.address, Date.now() + 10_000 * (i + 1)).pack.cards.every(id => CARTAS.find(c => c.id === id).rarity !== 'chosen');
    check('la especial nunca sale', nunca);
    for (const rareza of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
        await configMw(solo(rareza));
        const deEsta = CARTAS.filter(c => c.rarity === rareza);
        const tiene = id => mw.resumen(beto.address).collection[id] || mw.resumen(beto.address).free?.collection[id];
        for (let i = 0; i < 600 && deEsta.some(c => !tiene(c.id)); i++) mw.openFree(beto.address, Date.now() + 1_000_000 + 10_000 * i);
    }
    me = mw.resumen(beto.address);
    check('completa en modo libre queda marcada aparte', Boolean(me.free.completedAt) && !me.collectionComplete);
    check('no cambia puntos, packs ni coleccion del evento', me.points === betoAntes.points && me.packs === betoAntes.packs && JSON.stringify(me.collection) === JSON.stringify(betoAntes.collection));
    check('ni el ranking, los sorteos ni opens.jsonl', JSON.stringify(mw.leaderboard()) === rankingAntes && fs.readFileSync(path.join(packs.PACKS_DIR, 'opens.jsonl'), 'utf8') === opensAntes);
    check('se guarda en free.json', fs.existsSync(path.join(packs.PACKS_DIR, 'free.json')));
    r = await json(await fetch(`${BASE}/api/admin/packs?season=mudwater`, { headers: admin }));
    check('el admin cuenta los packs libres', r.totals.freePlayers === 2 && r.totals.freePacks > 20);
    await pedir('PUT', `/api/admin/packs/players/${beto.address}/disqualified?season=mudwater`, { disqualified: true }, admin);
    check('descalificado no abre', mw.openFree(beto.address, Date.now() + 99_000_000).reason === 'disqualified');

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
