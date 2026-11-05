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
    r = await json(await config({ tiers: { none: 2, holder: 5, staker: 7 }, extraPrice: 10, extraMax: 1 }));
    check('el admin cambia niveles y extras', r.http === 200 && r.config.tiers.staker === 7 && r.config.extraPrice === 10 && r.config.extraMax === 1);
    check('niveles fuera de rango se rechazan', (await config({ tiers: { none: 99 } })).status === 400);
    await config({ tiers: { none: 1, holder: 3, staker: 4 }, extraPrice: 20, extraMax: 2 });
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
    check('con 100% Chosen sale la carta 53', r.http === 200 && r.pack.cards.every(c => c === 53) && r.pack.points === 2500, JSON.stringify(r.pack));
    check('y beto queda en el sorteo', r.me.chosenEntered === true);
    r = await json(await fetch(`${BASE}/api/admin/packs`, { headers: admin }));
    check('el admin ve a beto como participante una sola vez', r.chosen.entrants.length === 1 && r.chosen.entrants[0].pulls === 1 && r.chosen.entrants[0].wallet === beto.address.toLowerCase());
    r = await json(await pedir('POST', '/api/admin/packs/chosen/draw', {}, admin));
    check('el sorteo elige a beto', r.http === 200 && r.chosen.raffle.winner === beto.address.toLowerCase());
    r = await json(await fetch(`${BASE}/api/packs/leaderboard`));
    check('el ranking publico muestra a beto como ganador de The Chosen', r.chosen.length === 1 && r.chosen[0].nickname === 'Beto' && r.chosen[0].winner === true);
    check('no se sortea dos veces', (await pedir('POST', '/api/admin/packs/chosen/draw', {}, admin)).status === 409);
    me = await json(await fetch(`${BASE}/api/packs/me`, { headers: como(t.beto) }));
    check('beto figura como ganador del sorteo', me.chosenWinner && me.winner);
    r = await json(await pedir('PUT', '/api/packs/solana', { address: 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy' }, como(t.beto)));
    check('y puede dejar su Solana aunque la competencia siga', r.http === 200);
    r = await json(await pedir('DELETE', '/api/admin/packs/chosen/draw', undefined, admin));
    check('el admin puede rehacer el sorteo', r.http === 200 && r.chosen.raffle === null);
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
    check('sin ganadores definidos nadie gana', !(await json(await fetch(`${BASE}/api/packs/me`, { headers: como(tokenDe(ganador)) }))).winner);
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

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
