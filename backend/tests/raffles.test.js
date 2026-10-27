// Prueba los raffles con FOG: entrada gratis para holders y paga para el
// resto, tickets extra, tope de entradas, revalidar holders al sortear, varios
// ganadores, reroll de algunos, cancelar con devolucion y el panel de admin.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39877;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'admin-solo-para-tests';

const holder = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const otroHolder = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a');
const publico = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
const pobre = privateKeyToAccount('0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-raffles-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.ADMIN_TOKEN = ADMIN;
process.env.PORT = String(PORT);

const primals = new Map([[holder.address.toLowerCase(), 3], [otroHolder.address.toLowerCase(), 1]]);
let cadenaCaida = false;
const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async () => ({ status: 'not-owner' }),
        getTokenOwner: async () => null,
        getTokenOwners: async ids => {
            if (cadenaCaida) throw new Error('RPC caido');
            const tokens = [...primals].flatMap(([w, n]) => Array.from({ length: n }, () => w));
            return new Map(ids.map((id, i) => [id, tokens[i] ?? null]));
        },
        readTotalSupply: async () => 2712,
        getPrimalBalance: async address => {
            if (cadenaCaida) throw new Error('RPC caido');
            return primals.get(address.toLowerCase()) ?? 0;
        },
        CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000'
    }
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const admin = { 'content-type': 'application/json', authorization: `Bearer ${ADMIN}` };
const pedir = (method, url, body, headers = {}) => fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
});
const post = (url, body, headers) => pedir('POST', url, body, headers);
const conToken = token => ({ authorization: `Bearer ${token}` });
const json = async r => ({ status: r.status, ...(await r.json()) });

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
    const staking = require('../lib/stakingStore');
    const saldo = a => staking.balanceDe(a.address);

    const tokens = {};
    for (const [nombre, cuenta] of Object.entries({ holder, otroHolder, publico, pobre })) tokens[nombre] = await login(cuenta);
    staking.grantFog(holder.address, 100000, 'test');
    staking.grantFog(otroHolder.address, 100000, 'test');
    staking.grantFog(publico.address, 100000, 'test');
    staking.grantFog(pobre.address, 500, 'test');

    console.log('\nAdmin');
    check('sin token no se ve', (await fetch(`${BASE}/api/admin/raffles`)).status === 401);
    let r = await json(await post(`${BASE}/api/admin/raffles`, { title: '' }, admin));
    check('sin titulo no se crea', r.status === 400);
    r = await json(await post(`${BASE}/api/admin/raffles`, { title: 'Nadie', holdersFree: false, publicPrice: null, prizes: [{ label: 'X', kind: 'nft' }] }, admin));
    check('sin gratis ni precio no se crea', r.status === 400);
    r = await json(await post(`${BASE}/api/admin/raffles`, { title: 'Kind', prizes: [{ label: 'X', kind: 'banana' }] }, admin));
    check('un premio que no esta en la lista no se acepta', r.status === 400);
    r = await json(await post(`${BASE}/api/admin/raffles`, { title: 'Rolls', prizes: [{ label: '2 rolls', kind: 'forge-roll', amount: 2 }] }, admin));
    check('un premio de la lista de los codigos se acepta', r.status === 200 && r.raffle.prizes[0].amount === 2, JSON.stringify(r));
    await pedir('DELETE', `${BASE}/api/admin/raffles/${r.raffle.id}`, undefined, admin);
    check('el admin recibe la lista de premios', (await json(await fetch(`${BASE}/api/admin/raffles`, { headers: admin }))).rewards.some(x => x.id === 'fog'));
    r = await json(await post(`${BASE}/api/admin/raffles`, {
        title: 'Weekly',
        description: 'Two prizes',
        holdersFree: true,
        publicPrice: 2000,
        ticketPrice: 1000,
        maxEntries: 20,
        prizes: [{ label: 'Some NFT', kind: 'nft', winners: 1 }, { label: '10,000 FOG', kind: 'fog', amount: 10000, winners: 2 }]
    }, admin));
    check('el admin lo crea como borrador', r.status === 200 && r.raffle.status === 'draft', JSON.stringify(r));
    const id = r.raffle.id;

    let lista = await json(await fetch(`${BASE}/api/raffles`));
    check('un borrador no es publico', lista.active.length === 0 && (await fetch(`${BASE}/api/raffles/${id}`)).status === 404);
    check('en borrador no se puede entrar', (await post(`${BASE}/api/raffles/${id}/enter`, {}, conToken(tokens.holder))).status === 404);
    check('se abre', (await json(await post(`${BASE}/api/admin/raffles/${id}/open`, {}, admin))).raffle.status === 'open');
    lista = await json(await fetch(`${BASE}/api/raffles`));
    check('abierto aparece en la lista', lista.active.length === 1 && lista.active[0].id === id && lista.active[0].ticketPrice === 1000);

    console.log('\nEntradas');
    check('sin sesion no se entra', (await post(`${BASE}/api/raffles/${id}/enter`, {})).status === 401);
    r = await json(await post(`${BASE}/api/raffles/${id}/tickets`, { quantity: 1 }, conToken(tokens.holder)));
    check('no se compran tickets sin entrar antes', r.status === 409 && r.reason === 'not-in');
    const antesHolder = saldo(holder);
    r = await json(await post(`${BASE}/api/raffles/${id}/enter`, {}, conToken(tokens.holder)));
    check('el holder entra gratis', r.status === 201 && r.mine.base === 'holder' && saldo(holder) === antesHolder);
    r = await json(await post(`${BASE}/api/raffles/${id}/enter`, {}, conToken(tokens.holder)));
    check('una sola entrada base por wallet', r.status === 409 && r.reason === 'already-in');
    const antesPublico = saldo(publico);
    r = await json(await post(`${BASE}/api/raffles/${id}/enter`, {}, conToken(tokens.publico)));
    check('el no holder paga la entrada', r.status === 201 && r.mine.base === 'paid' && saldo(publico) === antesPublico - 2000 && r.balance === saldo(publico));
    r = await json(await post(`${BASE}/api/raffles/${id}/enter`, {}, conToken(tokens.pobre)));
    check('sin FOG suficiente no entra', r.status === 402 && r.reason === 'insufficient' && saldo(pobre) === 500);

    r = await json(await post(`${BASE}/api/raffles/${id}/tickets`, { quantity: 0 }, conToken(tokens.holder)));
    check('cantidad invalida', r.status === 400);
    r = await json(await post(`${BASE}/api/raffles/${id}/tickets`, { quantity: 4 }, conToken(tokens.holder)));
    check('compra 4 tickets', r.status === 201 && r.mine.entries === 5 && saldo(holder) === antesHolder - 4000);
    r = await json(await post(`${BASE}/api/raffles/${id}/tickets`, { quantity: 200 }, conToken(tokens.publico)));
    check('no pasa el tope de entradas', r.status === 409 && r.reason === 'full');
    r = await json(await post(`${BASE}/api/raffles/${id}/tickets`, { quantity: 2 }, conToken(tokens.publico)));
    check('el publico compra 2', r.status === 201 && r.mine.entries === 3);
    r = await json(await post(`${BASE}/api/raffles/${id}/enter`, {}, conToken(tokens.otroHolder)));
    check('otro holder entra', r.status === 201);

    const mio = await json(await fetch(`${BASE}/api/raffles/me`, { headers: conToken(tokens.holder) }));
    check('/me dice holder, saldo y entradas', mio.holder === true && mio.balance === saldo(holder) && mio.entries[id].entries === 5);
    lista = await json(await fetch(`${BASE}/api/raffles`));
    check('la lista cuenta entradas y participantes', lista.active[0].totalEntries === 9 && lista.active[0].participants === 3);
    const detalle = await json(await fetch(`${BASE}/api/raffles/${id}`));
    check('el detalle lista participantes de mayor a menor', detalle.entrants.length === 3
        && detalle.entrants[0].wallet === holder.address.toLowerCase() && detalle.entrants[0].entries === 5);

    console.log('\nEdicion');
    r = await json(await pedir('PATCH', `${BASE}/api/admin/raffles/${id}`, { ticketPrice: 10 }, admin));
    check('con gente adentro no cambia el precio', r.status === 409);
    r = await json(await pedir('PATCH', `${BASE}/api/admin/raffles/${id}`, { maxEntries: 5 }, admin));
    check('el tope no baja de lo que ya hay', r.status === 409);
    r = await json(await pedir('PATCH', `${BASE}/api/admin/raffles/${id}`, { title: 'Weekly #1' }, admin));
    check('el titulo si', r.status === 200 && r.raffle.title === 'Weekly #1');

    console.log('\nSorteo');
    primals.set(otroHolder.address.toLowerCase(), 0);
    cadenaCaida = true;
    r = await json(await post(`${BASE}/api/admin/raffles/${id}/draw`, {}, admin));
    check('si la cadena no contesta no sortea', r.status === 503);
    check('y sigue abierto', (await json(await fetch(`${BASE}/api/raffles/${id}`))).status === 'open');
    cadenaCaida = false;
    r = await json(await post(`${BASE}/api/admin/raffles/${id}/draw`, {}, admin));
    check('sortea', r.status === 200 && r.raffle.status === 'drawn', JSON.stringify(r));
    const sorteado = r.raffle;
    check('el que vendio todo pierde la entrada gratis', sorteado.disqualified.includes(otroHolder.address.toLowerCase()));
    const ganadores = sorteado.winners.map(w => w.wallet);
    check('3 lugares, 2 con entradas: 2 ganadores distintos', ganadores.length === 2 && new Set(ganadores).size === 2
        && ganadores.includes(holder.address.toLowerCase()) && ganadores.includes(publico.address.toLowerCase()));
    const mioDespues = await json(await fetch(`${BASE}/api/raffles/me`, { headers: conToken(tokens.holder) }));
    check('/me devuelve lo que gano', mioDespues.wins.length === 1 && mioDespues.wins[0].raffleId === id && mioDespues.wins[0].title === 'Weekly #1');
    check('el primer lugar es el NFT', sorteado.winners[0].slot === 0 && sorteado.winners[0].prize === 'Some NFT');
    check('ya no se entra', (await post(`${BASE}/api/raffles/${id}/enter`, {}, conToken(tokens.pobre))).status === 409);
    lista = await json(await fetch(`${BASE}/api/raffles`));
    check('pasa al historial con sus ganadores', lista.active.length === 0 && lista.past[0].id === id && lista.past[0].winners.length === 2);
    check('un sorteado no se cancela', (await post(`${BASE}/api/admin/raffles/${id}/cancel`, {}, admin)).status === 409);

    console.log('\nEntrega y reroll');
    const fogSlot = sorteado.winners.find(w => w.kind === 'fog');
    const ganadorFog = fogSlot.wallet;
    const cuentaFog = [holder, publico].find(a => a.address.toLowerCase() === ganadorFog);
    const antesPremio = saldo(cuentaFog);
    r = await json(await pedir('PATCH', `${BASE}/api/admin/raffles/${id}/winners/${fogSlot.slot}`, { status: 'sent' }, admin));
    check('marcar enviado un premio de FOG lo acredita', r.status === 200 && saldo(cuentaFog) === antesPremio + 10000);
    r = await json(await pedir('PATCH', `${BASE}/api/admin/raffles/${id}/winners/${fogSlot.slot}`, { status: 'pending' }, admin));
    check('y no se puede volver atras', r.status === 409);
    r = await json(await post(`${BASE}/api/admin/raffles/${id}/reroll`, { slots: [fogSlot.slot] }, admin));
    check('un premio enviado no se rerollea', r.status === 409);
    r = await json(await post(`${BASE}/api/admin/raffles/${id}/reroll`, { slots: [] }, admin));
    check('reroll sin elegir falla', r.status === 400);

    const id2 = (await json(await post(`${BASE}/api/admin/raffles`, {
        title: 'Reroll', publicPrice: 0, prizes: [{ label: 'A', kind: 'other', winners: 1 }, { label: 'B', kind: 'ape', amount: 5, winners: 1 }]
    }, admin))).raffle.id;
    await post(`${BASE}/api/admin/raffles/${id2}/open`, {}, admin);
    for (const t of [tokens.holder, tokens.publico, tokens.pobre, tokens.otroHolder]) await post(`${BASE}/api/raffles/${id2}/enter`, {}, conToken(t));
    check('con precio 0 el publico entra gratis', saldo(pobre) === 500);
    const s2 = (await json(await post(`${BASE}/api/admin/raffles/${id2}/draw`, {}, admin))).raffle;
    check('el que no es holder pero entro gratis por el precio 0 no se descalifica',
        s2.disqualified.length === 0 && s2.winners.length === 2, JSON.stringify(s2.disqualified));
    const [primero, segundo] = s2.winners;
    r = await json(await post(`${BASE}/api/admin/raffles/${id2}/reroll`, { slots: [1] }, admin));
    const nuevo = r.raffle.winners.find(w => w.slot === 1);
    check('rerollea solo el elegido', r.status === 200 && r.raffle.winners.find(w => w.slot === 0).wallet === primero.wallet);
    check('el nuevo no es ni el viejo ni otro ganador', nuevo && nuevo.wallet !== segundo.wallet && nuevo.wallet !== primero.wallet);
    check('queda anotado a quien se saco', r.raffle.rerolled.some(x => x.wallet === segundo.wallet && x.slot === 1));
    r = await json(await post(`${BASE}/api/admin/raffles/${id2}/reroll`, { slots: [0, 1] }, admin));
    check('con un solo candidato libre, un lugar queda vacio', r.status === 200 && r.replaced === 1 && r.missing === 1 && r.raffle.winners.length === 1, JSON.stringify(r));

    console.log('\nCancelar');
    const id3 = (await json(await post(`${BASE}/api/admin/raffles`, {
        title: 'Cancel me', holdersFree: false, publicPrice: 3000, ticketPrice: 500, prizes: [{ label: 'C', kind: 'nft' }]
    }, admin))).raffle.id;
    await post(`${BASE}/api/admin/raffles/${id3}/open`, {}, admin);
    const antes3 = { holder: saldo(holder), publico: saldo(publico) };
    r = await json(await post(`${BASE}/api/raffles/${id3}/enter`, {}, conToken(tokens.holder)));
    check('sin entrada gratis el holder tambien paga', r.status === 201 && r.mine.base === 'paid' && saldo(holder) === antes3.holder - 3000);
    await post(`${BASE}/api/raffles/${id3}/enter`, {}, conToken(tokens.publico));
    await post(`${BASE}/api/raffles/${id3}/tickets`, { quantity: 3 }, conToken(tokens.publico));
    r = await json(await post(`${BASE}/api/admin/raffles/${id3}/cancel`, {}, admin));
    check('cancelar devuelve entradas y tickets', r.status === 200 && r.raffle.refunded === 7500
        && saldo(holder) === antes3.holder && saldo(publico) === antes3.publico);
    lista = await json(await fetch(`${BASE}/api/raffles`));
    check('cancelado no aparece en la pagina', !lista.active.some(x => x.id === id3) && !lista.past.some(x => x.id === id3));

    console.log('\nSolo holders y vencimiento');
    const id4 = (await json(await post(`${BASE}/api/admin/raffles`, {
        title: 'Holders', publicPrice: null, prizes: [{ label: 'D', kind: 'nft' }], endsAt: new Date(Date.now() + 1500).toISOString()
    }, admin))).raffle.id;
    await post(`${BASE}/api/admin/raffles/${id4}/open`, {}, admin);
    r = await json(await post(`${BASE}/api/raffles/${id4}/enter`, {}, conToken(tokens.publico)));
    check('solo holders: el resto no entra', r.status === 403 && r.reason === 'holders-only');
    check('el holder si', (await post(`${BASE}/api/raffles/${id4}/enter`, {}, conToken(tokens.holder))).status === 201);
    await new Promise(res => setTimeout(res, 1700));
    check('vencido se ve sorteando', (await json(await fetch(`${BASE}/api/raffles/${id4}`))).status === 'drawing');
    check('vencido no acepta tickets', (await post(`${BASE}/api/raffles/${id4}/tickets`, { quantity: 1 }, conToken(tokens.holder))).status === 409);
    await require('../lib/raffleStore').drawDue();
    const s4 = await json(await fetch(`${BASE}/api/raffles/${id4}`));
    check('el job lo sortea al vencer', s4.status === 'drawn' && s4.winners[0]?.wallet === holder.address.toLowerCase());

    console.log('\nPremio del catalogo que se manda a mano');
    const id6 = (await json(await post(`${BASE}/api/admin/raffles`, { title: 'Ape', publicPrice: 0, prizes: [{ label: '10 APE', kind: 'ape-10' }] }, admin))).raffle.id;
    await post(`${BASE}/api/admin/raffles/${id6}/open`, {}, admin);
    await post(`${BASE}/api/raffles/${id6}/enter`, {}, conToken(tokens.pobre));
    const s6 = (await json(await post(`${BASE}/api/admin/raffles/${id6}/draw`, {}, admin))).raffle;
    check('el APE del catalogo no se da solo', s6.winners[0]?.auto === false, JSON.stringify(s6.winners));
    const entregasAntes = (await json(await fetch(`${BASE}/api/admin/staking/wheels`, { headers: admin }))).wins.length;
    r = await json(await pedir('PATCH', `${BASE}/api/admin/raffles/${id6}/winners/0`, { status: 'sent', note: '0xabc' }, admin));
    const entregasDespues = (await json(await fetch(`${BASE}/api/admin/staking/wheels`, { headers: admin }))).wins.length;
    check('se marca enviado en un paso, sin otra entrega en la Shop', r.status === 200 && r.raffle.winners[0].status === 'sent' && entregasAntes === entregasDespues);

    console.log('\nBorrar');
    const id5 = (await json(await post(`${BASE}/api/admin/raffles`, { title: 'Draft', prizes: [{ label: 'E', kind: 'nft' }] }, admin))).raffle.id;
    check('un borrador se borra', (await pedir('DELETE', `${BASE}/api/admin/raffles/${id5}`, undefined, admin)).status === 200);
    check('uno sorteado no', (await pedir('DELETE', `${BASE}/api/admin/raffles/${id4}`, undefined, admin)).status === 409);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
