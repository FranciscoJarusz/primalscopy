// tests/staking.test.js
//
// Prueba el soft staking: la configuracion desde el admin, poner a entrenar
// (dueño, listados, periodos), los dias que se acreditan solo hasta la ultima
// verificacion, lo que pasa al vender, listar, sacarlo o terminar el periodo,
// los que se pueden volver a mandar, las insignias, y el canje de un roll del
// Forge con FOG.
//
// La cadena y OpenSea se simulan: cada test dice quien es el dueño de cada
// Primal y que esta listado. El paso del tiempo se simula corriendo hacia
// atras las fechas de los entrenamientos guardados.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39876;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'admin-solo-para-tests';
const DAY = 24 * 60 * 60 * 1000;

const holder = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const otro = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a');
const tercero = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const T = tercero.address.toLowerCase();
const H = holder.address.toLowerCase();
const O = otro.address.toLowerCase();

// En Windows, libvips deja abiertas las imagenes que leyo sharp y despues no
// se puede borrar la carpeta temporal: sin su cache, las suelta al terminar.
require('sharp').cache(false);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-staking-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.ADMIN_TOKEN = ADMIN;
process.env.PORT = String(PORT);
// Que el Forge cobre: si no, un roll comprado con FOG no tiene sentido.
process.env.FORGE_TREASURY = '0x000000000000000000000000000000000000dEaD';
process.env.FORGE_ROLL_PRICE = '1';

// tokenId -> dueño. Lo que no esta aca no existe.
const owners = new Map();
let rpcCaido = false;
// Tokens cuya consulta falla dentro del multicall (la cadena contesta, pero
// ese ownerOf no): getTokenOwners los devuelve con dueño null.
const fallan = new Set();
const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async () => ({ status: 'not-owner' }),
        getTokenOwner: async id => owners.get(String(id)) || null,
        getTokenOwners: async ids => {
            if (rpcCaido) throw new Error('RPC caido');
            return new Map(ids.map(id => [String(id), fallan.has(String(id)) ? null : owners.get(String(id)) || null]));
        },
        getPrimalBalance: async () => 0,
        CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000'
    }
};

// tokenId -> Set de wallets que lo listaron.
const listed = new Map();
let openSeaCaido = false;
const listingsPath = require.resolve('../lib/marketplaceListings');
require.cache[listingsPath] = {
    id: listingsPath,
    filename: listingsPath,
    loaded: true,
    exports: {
        isConfigured: () => true,
        getListings: async () => {
            if (openSeaCaido) throw new Error('OpenSea caido');
            return new Map([...listed].map(([id, ws]) => [id, new Set(ws)]));
        }
    }
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const admin = { 'content-type': 'application/json', authorization: `Bearer ${ADMIN}` };
const send = (method, url, body, headers = {}) => fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
});
const post = (url, body, headers) => send('POST', url, body, headers);
const auth = token => ({ authorization: `Bearer ${token}` });

const configurar = body => send('PATCH', `${BASE}/api/admin/staking/config`, body, admin);
const verificar = async () => (await post(`${BASE}/api/admin/staking/verify`, {}, admin)).json();
const entrenar = (token, tokenIds, days) => post(`${BASE}/api/staking/stake`, { tokenIds, days }, auth(token));
const yo = async token => (await fetch(`${BASE}/api/staking/me`, { headers: auth(token) })).json();
const canjear = (token, item) => post(`${BASE}/api/staking/redeem`, { item }, auth(token));
const sacar = async (token, tokenIds) => (await post(`${BASE}/api/staking/unstake`, { tokenIds }, auth(token))).json();

// "Pasan" `days` dias para los entrenamientos de estos tokens: se corren hacia
// atras todas sus fechas, incluida la ultima verificacion.
function pasanDias(tokenIds, days) {
    const file = path.join(TMP, '_generated', 'staking', 'active.json');
    const active = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const id of tokenIds) {
        for (const campo of ['startAt', 'endsAt', 'verifiedAt']) {
            active[id][campo] = new Date(Date.parse(active[id][campo]) - days * DAY).toISOString();
        }
    }
    fs.writeFileSync(file, JSON.stringify(active, null, 2));
}

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

    for (const id of ['1', '2', '3', '4', '5', '6', '7', '8', '10', '11']) owners.set(id, H);
    owners.set('9', O);
    for (const id of ['20', '21', '22', '23', '24', '25']) owners.set(id, T);
    const tH = await login(holder);
    const tO = await login(otro);
    const tT = await login(tercero);

    console.log('\nConfiguracion');
    let cfg = await (await fetch(`${BASE}/api/staking/config`)).json();
    check('arranca cerrado', cfg.enabled === false);
    check('30 FOG por dia', cfg.dailyRate === 30);
    check('14 dias da 33, 30 dias 39 y 90 dias 48', cfg.periods.find(p => p.days === 14).perDay === 33
        && cfg.periods.find(p => p.days === 30).perDay === 39 && cfg.periods.find(p => p.days === 90).perDay === 48);
    check('trae los escalones por cantidad', cfg.quantityTiers.map(t => `${t.min}:${t.bonus}`).join() === '1:0,2:5,5:10,10:15,20:20');
    check('el reroll se puede canjear', cfg.catalog.find(i => i.id === 'forge-roll').redeemable === true);
    check('los APE todavia no', cfg.catalog.find(i => i.id === 'ape-10').redeemable === false);
    check('cerrado no deja entrenar', (await entrenar(tH, ['1'], 7)).status === 503);
    check('sin token de admin no se configura', (await send('PATCH', `${BASE}/api/admin/staking/config`, { enabled: true })).status === 401);
    check('bonus negativo se rechaza', (await configurar({ periods: [{ days: 7, bonus: -5 }] })).status === 400);
    check('periodos repetidos se rechazan', (await configurar({ periods: [{ days: 7, bonus: 0 }, { days: 7, bonus: 5 }] })).status === 400);
    check('precio con decimales se rechaza', (await configurar({ catalog: [{ id: 'forge-roll', price: 1.5 }] })).status === 400);
    check('premio inventado se rechaza', (await configurar({ catalog: [{ id: 'yate', price: 5 }] })).status === 400);
    check('escalones repetidos se rechazan', (await configurar({ quantityTiers: [{ min: 2, bonus: 5 }, { min: 2, bonus: 9 }] })).status === 400);
    check('escalon desde 0 se rechaza', (await configurar({ quantityTiers: [{ min: 0, bonus: 5 }] })).status === 400);
    // Lo de abajo se escribio con los bonus de antes y sin bonus por cantidad;
    // el bonus por cantidad tiene su propia seccion al final.
    check('se abre', (await configurar({ enabled: true, quantityTiers: [{ min: 1, bonus: 0 }],
        periods: [{ days: 7, bonus: 0 }, { days: 14, bonus: 0 }, { days: 30, bonus: 10 }, { days: 90, bonus: 30 }] })).ok);

    console.log('\nPoner a entrenar');
    listed.set('2', [H]);
    listed.set('4', [O]); // listado viejo de un dueño anterior: no cuenta
    let r = await entrenar(tH, ['1', '2', '4', '9', '404'], 30);
    let d = await r.json();
    check('entran los propios sin listar', r.status === 201 && d.started.join() === '1,4', JSON.stringify(d));
    const motivo = id => d.rejected.find(x => x.tokenId === id)?.reason;
    check('el listado no entra', motivo('2') === 'listed');
    check('el ajeno no entra', motivo('9') === 'not-owner');
    check('el inexistente no entra', motivo('404') === 'not-owner');
    check('periodo inexistente se rechaza', (await entrenar(tH, ['3'], 10)).status === 400);
    check('sin sesion no', (await post(`${BASE}/api/staking/stake`, { tokenIds: ['3'], days: 7 })).status === 401);
    d = await (await entrenar(tH, ['1'], 7)).json();
    check('el que ya entrena no se reinicia', d.rejected[0]?.reason === 'already-training');
    d = await yo(tH);
    check('se ven los dos entrenando a 33 por dia', d.stakes.length === 2 && d.stakes.every(s => s.perDay === 33 && s.days === 30));
    check('saldo cero el primer dia', d.balance === 0);
    const mapa = await (await fetch(`${BASE}/api/staking/map`)).json();
    check('el mapa los muestra en su region', JSON.stringify(mapa.periods) === JSON.stringify({ 30: ['1', '4'] }), JSON.stringify(mapa));
    check('la miniatura de un id raro no existe', (await fetch(`${BASE}/api/staking/primal/abc.webp`)).status === 404);
    listed.delete('2');
    listed.delete('4');

    console.log('\nDias acreditados');
    pasanDias(['1', '4'], 5.5);
    check('sin verificar no suma', (await yo(tH)).balance === 0);
    openSeaCaido = true;
    await verificar();
    check('si OpenSea no contesta tampoco suma', (await yo(tH)).balance === 0);
    openSeaCaido = false;
    rpcCaido = true;
    check('si la cadena no contesta el admin se entera', (await post(`${BASE}/api/admin/staking/verify`, {}, admin)).status === 503);
    rpcCaido = false;
    await verificar();
    d = await yo(tH);
    check('verificado suma los 5 dias completos de los dos', d.balance === 2 * 5 * 33, `balance ${d.balance}`);
    check('y cada uno muestra 5 dias', d.stakes.every(s => s.creditedDays === 5));

    console.log('\nUna consulta que falla no es una venta');
    fallan.add('1');
    await verificar();
    d = await yo(tH);
    check('si el ownerOf de uno falla, sigue entrenando', d.stakes.length === 2, JSON.stringify(d.stakes.map(s => s.tokenId)));
    fallan.delete('1');

    console.log('\nCambiar la tasa no toca lo que esta corriendo');
    await configurar({ dailyRate: 100 });
    check('el entrenamiento sigue a 33', (await yo(tH)).stakes.every(s => s.perDay === 33));
    check('uno nuevo de 30 dias va a 110', (await (await fetch(`${BASE}/api/staking/config`)).json())
        .periods.find(p => p.days === 30).perDay === 110);
    await configurar({ dailyRate: 30 });

    console.log('\nVender, listar, terminar');
    owners.set('1', O);
    listed.set('4', [H]);
    pasanDias(['1', '4'], 1);
    await verificar();
    d = await yo(tH);
    check('vendido y listado salen del entrenamiento', d.stakes.length === 0);
    check('el vendido conserva el bonus y el listado lo pierde', d.balance === 5 * 33 + 5 * 30, `balance ${d.balance}`);
    listed.delete('4');
    check('el comprador lo puede entrenar', (await (await entrenar(tO, ['1'], 7)).json()).started[0] === '1');
    check('el que lo deslisto lo puede volver a entrenar', (await (await entrenar(tH, ['4'], 7)).json()).started[0] === '4');

    const antes = (await yo(tH)).balance;
    pasanDias(['4'], 8);
    await verificar();
    d = await yo(tH);
    check('al terminar el periodo suma 7 dias y sale', d.balance === antes + 7 * 30 && d.stakes.length === 0, `balance ${d.balance}`);
    check('y queda para volver a mandarlo, con su periodo', d.restake.some(x => x.tokenId === '4' && x.days === 7), JSON.stringify(d.restake));
    check('los vendidos o listados no se ofrecen', !d.restake.some(x => x.tokenId === '1'));

    await entrenar(tH, ['5'], 7);
    pasanDias(['5'], 9);
    d = await (await entrenar(tH, ['5'], 14)).json();
    check('uno vencido sin chequear se cierra al volver a entrenarlo', d.started[0] === '5' && d.balance === antes + 2 * 7 * 30, JSON.stringify(d.balance));

    check('al volver a mandarlo sale de la lista', (await entrenar(tH, ['4'], 7)).ok
        && !(await yo(tH)).restake.some(x => x.tokenId === '4'));

    console.log('\nSacarlo antes de tiempo');
    await entrenar(tH, ['10', '11'], 90);
    pasanDias(['10', '11'], 4.5);
    let previo = (await yo(tH)).balance;
    d = await sacar(tH, ['10']);
    check('se saca y paga solo el FOG base', d.unstaked[0]?.tokenId === '10' && d.unstaked[0].earned === 4 * 30
        && d.unstaked[0].bonusLost === 4 * 9, JSON.stringify(d.unstaked));
    check('el saldo sube solo lo base', d.balance === previo + 4 * 30, `balance ${d.balance}`);
    check('y ya no esta entrenando', !d.stakes.some(s => s.tokenId === '10'));
    check('ni se ofrece para volver a mandar', !d.restake.some(x => x.tokenId === '10'));
    d = await sacar(tH, ['10', '9']);
    check('lo que no esta entrenando no se saca', d.unstaked.length === 0 && d.rejected.every(r => r.reason === 'not-staking'));
    check('otra wallet no puede sacar el tuyo', (await sacar(tO, ['11'])).rejected[0]?.reason === 'not-staking');
    owners.set('11', O);
    check('si ya no es tuyo no se saca (lo cierra el chequeo)', (await sacar(tH, ['11'])).rejected[0]?.reason === 'not-owner');
    owners.set('11', H);
    await verificar();
    rpcCaido = true;
    previo = (await yo(tH)).balance;
    d = await sacar(tH, ['11']);
    rpcCaido = false;
    check('sin cadena se saca con los dias ya verificados', d.unstaked[0]?.earned === 4 * 30 && d.balance === previo - 4 * 9, JSON.stringify(d.unstaked));
    check('sin sesion no', (await post(`${BASE}/api/staking/unstake`, { tokenIds: ['10'] })).status === 401);

    console.log('\nInsignias');
    const { badgesOf, streaksByWallet } = require('../lib/stakingStore');
    const ahora = Date.now();
    const dia = n => ahora - n * DAY;
    let b = badgesOf([[dia(100), ahora]], ahora);
    check('100 dias seguidos ganan la de 90', b.earned.join() === '90' && b.streakDays === 100 && b.next === 180, JSON.stringify(b));
    b = badgesOf([[dia(300), dia(200)], [dia(20), ahora]], ahora);
    check('cortar la racha conserva la insignia y empieza de cero', b.earned.join() === '90' && b.streakDays === 20 && b.next === 90, JSON.stringify(b));
    b = badgesOf([[dia(50), dia(2)]], ahora);
    check('dentro de los 3 dias de gracia la racha sigue', b.streakDays === 48 && b.graceUntil !== null);
    b = badgesOf([[dia(50), dia(4)]], ahora);
    check('pasados los 3 dias la racha vuelve a cero', b.streakDays === 0 && b.graceUntil === null);
    check('400 dias ganan las tres', badgesOf([[dia(400), ahora]], ahora).earned.join() === '90,180,365');
    const fin = (startAt, endsAt, extra = {}) => ({ event: 'end', reason: 'completed', wallet: 'w', startAt: new Date(startAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(), verifiedAt: new Date(endsAt).toISOString(), ...extra });
    let tramos = streaksByWallet([fin(dia(100), dia(50)), fin(dia(48), dia(0))], {}, ahora).w;
    check('un hueco de 2 dias entre entrenamientos no corta', tramos.length === 1 && badgesOf(tramos, ahora).streakDays === 100);
    tramos = streaksByWallet([fin(dia(100), dia(50)), fin(dia(45), dia(0))], {}, ahora).w;
    check('un hueco de 5 dias si corta', tramos.length === 2 && badgesOf(tramos, ahora).streakDays === 45);
    tramos = streaksByWallet([fin(dia(100), dia(10), { reason: 'unstaked', at: new Date(dia(60)).toISOString() })], {}, ahora).w;
    check('sacarlo corta el tramo en ese momento', badgesOf(tramos, ahora).streakDays === 0 && tramos[0][1] === dia(60));
    d = await yo(tH);
    check('la wallet ve su racha', d.badges && d.badges.streakDays >= 0 && Array.isArray(d.badges.earned), JSON.stringify(d.badges));
    const tabla = (await (await fetch(`${BASE}/api/staking/leaderboard`)).json()).wallets;
    check('el ranking trae el saldo de cada wallet', tabla[H]?.balance === d.balance && Array.isArray(tabla[H].badges), JSON.stringify(tabla[H]));
    cfg = await (await fetch(`${BASE}/api/staking/config`)).json();
    const enMapa = Object.values((await (await fetch(`${BASE}/api/staking/map`)).json()).periods).flat().length;
    check('la config trae los numeros globales', cfg.totals.staking === enMapa && cfg.totals.earned > 0, JSON.stringify(cfg.totals));

    console.log('\nCanjes');
    const saldo = (await yo(tH)).balance;
    r = await canjear(tO, 'forge-roll');
    check('sin FOG suficiente no', r.status === 402);
    check('lo que no se entrega solo no se canjea', (await canjear(tH, 'ape-10')).status === 409);
    check('lo inventado no existe', (await canjear(tH, 'yate')).status === 404);
    await configurar({ catalog: [{ id: 'forge-roll', price: 300 }] });
    r = await canjear(tH, 'forge-roll');
    d = await r.json();
    check('el reroll se canjea', r.ok && d.balance === saldo - 300, JSON.stringify(d));
    check('y aparece en el Forge como roll disponible', forge.availablePayments(H, 33139).filter(p => p.source === 'fog').length === 1);
    check('el saldo bajo', (await yo(tH)).balance === saldo - 300);
    const pago = forge.takePayment(H, 33139, 'roll-x', '1');
    check('el Forge lo gasta', pago?.source === 'fog');
    await configurar({ catalog: [{ id: 'forge-roll', enabled: false }] });
    check('apagado ya no se canjea', (await canjear(tH, 'forge-roll')).status === 404);
    check('ni se muestra', !(await (await fetch(`${BASE}/api/staking/config`)).json()).catalog.some(i => i.id === 'forge-roll'));

    check('borrar un premio inexistente da error', (await configurar({ removeCatalog: 'yate' })).status === 400);
    check('se borra un premio', (await configurar({ removeCatalog: 'ape-100' })).ok);
    cfg = await (await fetch(`${BASE}/api/staking/config`)).json();
    check('y ya no aparece', !cfg.catalog.some(i => i.id === 'ape-100'));
    check('ni vuelve al guardar otra cosa', (await configurar({ dailyRate: 30 })).ok
        && !(await (await fetch(`${BASE}/api/staking/config`)).json()).catalog.some(i => i.id === 'ape-100'));
    check('ni se puede editar', (await configurar({ catalog: [{ id: 'ape-100', price: 5 }] })).status === 400);

    // Del admin: la config publica no trae los ocultos, y el orden los incluye.
    const todos = async () => (await (await fetch(`${BASE}/api/admin/staking`, { headers: admin })).json()).config.catalog.map(i => i.id);
    const ids = await todos();
    check('orden incompleto se rechaza', (await configurar({ order: ids.slice(1) })).status === 400);
    check('orden con repetidos se rechaza', (await configurar({ order: [ids[0], ...ids.slice(0, -1)] })).status === 400);
    const alReves = [...ids].reverse();
    check('se reordena', (await configurar({ order: alReves })).ok);
    check('queda en ese orden', (await todos()).join() === alReves.join());
    cfg = await (await fetch(`${BASE}/api/staking/config`)).json();
    check('y la pagina lo muestra igual', cfg.catalog.map(i => i.id).join() === alReves.filter(id => id !== 'forge-roll').join());
    check('borrar uno no rompe el orden', (await configurar({ removeCatalog: alReves[0] })).ok
        && (await todos()).join() === alReves.slice(1).join());

    console.log('\nAdmin');
    d = await (await fetch(`${BASE}/api/admin/staking`, { headers: admin })).json();
    check('ve los entrenamientos y el canje', d.training === 3 && d.redemptions.length === 1 && d.redemptions[0].wallet === H, `training ${d.training}`);
    check('y por que salieron los que no terminaron', d.endings.some(e => e.reason === 'transferred') && d.endings.some(e => e.reason === 'listed')
        && d.endings.some(e => e.reason === 'unstaked' && e.bonusLost === 4 * 9));

    console.log('\nBonus por cantidad');
    await configurar({ quantityTiers: [{ min: 1, bonus: 0 }, { min: 2, bonus: 5 }, { min: 5, bonus: 10 }] });
    await entrenar(tT, ['20', '21'], 7);
    pasanDias(['20', '21'], 3);
    await verificar();
    d = await yo(tT);
    check('con 2 en staking cada uno suma 30 + 5%', d.stakes.every(s => s.earned === 3 * 31) && d.balance === 6 * 31, JSON.stringify(d.stakes.map(s => s.earned)));
    check('la wallet ve su escalon', d.quantity.count === 2 && d.quantity.bonus === 5, JSON.stringify(d.quantity));
    await entrenar(tT, ['22', '23', '24'], 7);
    pasanDias(['20', '21', '22', '23', '24'], 2);
    await verificar();
    d = await yo(tT);
    const de = id => d.stakes.find(s => s.tokenId === id).earned;
    check('sumar Primals sube el bonus de todos desde ese dia', de('20') === 3 * 31 + 2 * 33 && de('22') === 2 * 33,
        JSON.stringify(d.stakes.map(s => [s.tokenId, s.earned])));
    check('y el escalon pasa a +10%', d.quantity.count === 5 && d.quantity.bonus === 10);
    await configurar({ quantityTiers: [{ min: 1, bonus: 0 }, { min: 2, bonus: 50 }] });
    check('cambiar los escalones no toca lo que esta corriendo', (await yo(tT)).stakes.find(s => s.tokenId === '20').earned === 3 * 31 + 2 * 33);
    previo = (await yo(tT)).balance;
    d = await sacar(tT, ['24']);
    check('sacarlo pierde tambien el bonus por cantidad', d.unstaked[0].earned === 2 * 30 && d.unstaked[0].bonusLost === 2 * 3, JSON.stringify(d.unstaked));
    check('y los que quedan siguen con lo ya ganado', d.balance === previo - 2 * 3, `balance ${d.balance}`);
    check('los entrenamientos de antes de los escalones pagan su tasa fija', (await yo(tH)).stakes.every(s => s.earned === s.creditedDays * s.perDay));

    console.log('\nRuletas');
    const V = '0x00000000000000000000000000000000000000aa';
    owners.set('30', V);
    owners.set('31', V);
    const ruleta = async item => (await fetch(`${BASE}/api/staking/wheel/${item}`)).json();
    const guardarRuleta = (item, body) => send('PUT', `${BASE}/api/admin/staking/wheels/${item}`, body, admin);
    await configurar({ catalog: [{ id: 'lowkey', price: 10 }, { id: 'summon-shard', price: 10 }, { id: 'highkey', price: 10 }] });
    let w = await ruleta('lowkey');
    check('arranca solo con el consuelo de 1000 FOG', w.prizes.length === 1 && w.prizes[0].kind === 'fog' && w.prizes[0].amount === 1000);
    check('y asi no se puede comprar', w.available === false
        && (await (await fetch(`${BASE}/api/staking/config`)).json()).catalog.find(i => i.id === 'lowkey').redeemable === false);
    check('premio sin nombre se rechaza', (await guardarRuleta('lowkey', { prizes: [{ kind: 'nft', weight: 1 }] })).status === 400);
    check('FOG sin cantidad se rechaza', (await guardarRuleta('lowkey', { prizes: [{ label: 'x', kind: 'fog', weight: 1 }] })).status === 400);
    check('ruleta inventada se rechaza', (await guardarRuleta('yate', { prizes: [] })).status === 400);
    r = await guardarRuleta('lowkey', { prizes: [{ label: 'Gob #12', kind: 'nft', weight: 1, stock: 1 }, { id: 'fog-1000', label: '1,000 FOG', kind: 'fog', amount: 1000, weight: 0 }] });
    d = await r.json();
    check('se cargan los premios', r.ok && d.wheels.lowkey.prizes.length === 2, JSON.stringify(d).slice(0, 200));
    const gob = d.wheels.lowkey.prizes.find(x => x.kind === 'nft').id;
    w = await ruleta('lowkey');
    check('la pagina ve solo los que pueden tocar, con su chance', w.available && w.prizes.length === 1 && w.prizes[0].chance === 1);

    const img = path.join(__dirname, '..', '..', 'web', 'public', 'images', 'staking', 'icons', 'low_key.webp');
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(img)]), 'gob.webp');
    r = await fetch(`${BASE}/api/admin/staking/wheels/lowkey/prizes/${gob}/image`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` }, body: form });
    d = await r.json();
    const imagen = d.wheels?.lowkey.prizes.find(x => x.id === gob).image;
    check('se sube la imagen de un premio', r.ok && /\.webp$/.test(imagen || ''), JSON.stringify(d).slice(0, 200));
    check('y se sirve', (await fetch(`${BASE}/api/staking/prizes/${imagen}`)).status === 200);
    check('guardar de nuevo conserva la imagen', (await (await guardarRuleta('lowkey', { prizes: (await (await fetch(`${BASE}/api/admin/staking/wheels`, { headers: admin })).json()).wheels.lowkey.prizes })).json()).wheels.lowkey.prizes.find(x => x.id === gob).image === imagen);

    const antesKey = (await yo(tH)).balance;
    r = await canjear(tH, 'lowkey');
    d = await r.json();
    check('abrir la key sortea el premio y cobra', r.ok && d.win?.prize.id === gob && d.win.status === 'pending' && d.balance === antesKey - 10, JSON.stringify(d));
    check('sin stock la key ya no se compra', (await canjear(tH, 'lowkey')).status === 409 && (await ruleta('lowkey')).available === false);
    check('la wallet ve su premio pendiente', (await yo(tH)).prizes[0]?.prize.id === gob && (await yo(tH)).prizes[0].status === 'pending');

    await guardarRuleta('highkey', { prizes: [{ label: 'Algo', kind: 'ape', amount: 50, weight: 0, stock: 3 }, { id: 'fog-1000', label: '1,000 FOG', kind: 'fog', amount: 1000, weight: 1 }] });
    check('con peso 0 un premio no cuenta (solo queda FOG: no se vende)', (await ruleta('highkey')).available === false);
    await guardarRuleta('highkey', { prizes: [{ label: 'Algo', kind: 'ape', amount: 50, weight: 1, stock: 3 }, { id: 'fog-1000', label: '1,000 FOG', kind: 'fog', amount: 1000, weight: 1000000 }] });
    const antesFog = (await yo(tH)).balance;
    d = await (await canjear(tH, 'highkey')).json();
    const tocoFog = d.win?.prize.kind === 'fog';
    check('si toca FOG se acredita al toque', tocoFog ? d.win.status === 'credited' && d.balance === antesFog - 10 + 1000 : d.balance === antesFog - 10, JSON.stringify(d));

    const estado = async id => (await (await fetch(`${BASE}/api/staking/config`)).json()).catalog.find(i => i.id === id)?.status;
    check('una key que se quedo sin premios dice sold out', (await estado('lowkey')) === 'sold-out');
    check('lo que todavia no existe dice soon', (await estado('raffle-ticket')) === 'soon');
    check('los APE arrancan sin stock: sold out', (await estado('ape-10')) === 'sold-out');

    console.log('\nAPE con stock');
    check('stock invalido se rechaza', (await configurar({ catalog: [{ id: 'ape-10', stock: -1 }] })).status === 400);
    await configurar({ catalog: [{ id: 'ape-10', stock: 1, price: 10 }] });
    check('con stock se puede comprar', (await estado('ape-10')) === 'available');
    const antesApe = (await yo(tH)).balance;
    d = await (await canjear(tH, 'ape-10')).json();
    check('comprarlo cobra y queda para entregar', d.delivery?.prize.kind === 'ape' && d.delivery.prize.amount === 10
        && d.delivery.status === 'pending' && d.balance === antesApe - 10, JSON.stringify(d));
    check('y aparece en sus premios', (await yo(tH)).prizes.some(x => x.item === 'ape-10' && x.status === 'pending'));
    check('el stock bajo a 0: sold out', (await estado('ape-10')) === 'sold-out' && (await canjear(tH, 'ape-10')).status === 409);
    check('stock vacio es sin limite', (await configurar({ catalog: [{ id: 'ape-10', stock: '' }] })).ok && (await estado('ape-10')) === 'available');

    const recientes = (await (await fetch(`${BASE}/api/staking/recent-wins`)).json()).wins;
    check('los ultimos premios muestran lo que da ganas (sin el consuelo ni los APE comprados)',
        recientes.some(x => x.prize.id === gob) && !recientes.some(x => x.item === 'ape-10') && !recientes.some(x => x.prize.kind === 'fog' && x.chance >= 0.2),
        JSON.stringify(recientes.map(x => x.prize.label)));

    console.log('\nSummon shard y el vault');
    await guardarRuleta('summon-shard', { prizes: [], vaultWeight: 1 });
    check('sin vault no hay Primals para sortear', (await ruleta('summon-shard')).available === false);
    check('una direccion invalida se rechaza', (await send('PATCH', `${BASE}/api/admin/staking/vault`, { address: 'hola' }, admin)).status === 400);
    d = await (await send('PATCH', `${BASE}/api/admin/staking/vault`, { address: V }, admin)).json();
    check('con el vault lee sus Primals de la cadena', d.vault?.count === 2 && d.wheels['summon-shard'].vaultAvailable === 2, JSON.stringify(d.vault));
    w = await ruleta('summon-shard');
    check('y los muestra como premios', w.available && w.prizes.map(x => x.tokenId).sort().join() === '30,31');
    d = await (await canjear(tH, 'summon-shard')).json();
    const primal = d.win?.prize.tokenId;
    check('el shard da un Primal del vault', ['30', '31'].includes(primal) && d.win.status === 'pending', JSON.stringify(d));
    check('y ese queda reservado: no le toca a otro', (await ruleta('summon-shard')).prizes.length === 1 && (await ruleta('summon-shard')).prizes[0].tokenId !== primal);

    console.log('\nTarjeta para compartir');
    const ganadoId = (await yo(tH)).prizes.find(x => x.prize.tokenId === primal).id;
    d = await (await fetch(`${BASE}/api/staking/win/${ganadoId}`)).json();
    check('los datos publicos del premio', d.prize?.tokenId === primal && d.itemLabel === 'Summon shard' && /^0x/.test(d.name), JSON.stringify(d));
    check('un id inventado no existe', (await fetch(`${BASE}/api/staking/win/no-existe`)).status === 404);
    r = await fetch(`${BASE}/api/staking/win/${(await yo(tH)).prizes.find(x => x.prize.kind === 'nft').id}/card.png`);
    const png = Buffer.from(await r.arrayBuffer());
    const meta = await require('sharp')(png).metadata();
    check('la tarjeta es un PNG de 1200x630', r.ok && meta.width === 1200 && meta.height === 630, `${r.status} ${meta.width}x${meta.height}`);

    console.log('\nEntregas');
    const pendiente = (await yo(tH)).prizes.find(x => x.prize.tokenId === primal);
    check('estado invalido se rechaza', (await send('PATCH', `${BASE}/api/admin/staking/prizes/${pendiente.id}`, { status: 'x' }, admin)).status === 400);
    check('se marca como enviado', (await send('PATCH', `${BASE}/api/admin/staking/prizes/${pendiente.id}`, { status: 'sent', note: '0xabc' }, admin)).ok);
    d = (await yo(tH)).prizes.find(x => x.id === pendiente.id);
    check('y la wallet lo ve enviado', d.status === 'sent' && d.note === '0xabc');
    check('sin token de admin no se tocan las ruletas', (await send('PUT', `${BASE}/api/admin/staking/wheels/lowkey`, { prizes: [] })).status === 401);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
