// Los pagos en APE del admin (lib/apePayments.js): rolls del Forge pagados y
// compras de FOG, sin los rolls con codigo o con FOG.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-ape-'));
process.env.TRAITS_PATH = TMP;

const { FORGE_DIR } = require('../lib/forgeStore');
const { STAKING_DIR } = require('../lib/stakingStore');
const { resumen } = require('../lib/apePayments');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const DIA = 24 * 60 * 60 * 1000;
const hace = dias => new Date(Date.now() - dias * DIA).toISOString();
const APE = n => (BigInt(n) * 10n ** 18n).toString();

fs.mkdirSync(FORGE_DIR, { recursive: true });
fs.mkdirSync(STAKING_DIR, { recursive: true });
fs.writeFileSync(path.join(FORGE_DIR, 'payments.json'), JSON.stringify({
    '0xaa': { txHash: '0xAA', wallet: '0xW1', valueWei: APE(20), chainId: 33139, status: 'used', tokenId: '54', paidAt: hace(2) },
    '0xbb': { txHash: '0xbb', wallet: '0xw2', valueWei: APE(20), chainId: 33139, status: 'available', paidAt: hace(40) },
    'promo:X:0xw1:0': { source: 'promo', wallet: '0xw1', status: 'available', paidAt: hace(1) },
    'fog:abc': { source: 'fog', wallet: '0xw1', status: 'used', paidAt: hace(1) }
}));
fs.writeFileSync(path.join(STAKING_DIR, 'purchases.json'), JSON.stringify({
    '0xcc': { txHash: '0xcc', wallet: '0xw1', valueWei: APE(5), fog: 50000, at: hace(10) }
}));

const r = resumen();
check('solo los pagos con APE', r.payments.length === 3, JSON.stringify(r.payments.map(p => p.txHash)));
check('lo mas nuevo primero', r.payments[0].txHash === '0xaa' && r.payments[2].txHash === '0xbb');
check('wallets en minusculas y sin repetir', r.wallets === 2 && r.payments[0].wallet === '0xw1');
check('total historico', r.totals.all.forge.count === 2 && r.totals.all.forge.apeWei === APE(40) && r.totals.all.fog.apeWei === APE(5));
check('ultimos 30 dias', r.totals.days30.forge.count === 1 && r.totals.days30.fog.count === 1);
check('ultimos 7 dias', r.totals.days7.forge.count === 1 && r.totals.days7.fog.count === 0);
check('la compra de FOG dice cuanto FOG', r.payments.find(p => p.kind === 'fog').fog === 50000);
check('el roll dice en que Primal se uso', r.payments[0].tokenId === '54');

console.log(`\n${pass} ok, ${fail} fallas`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exitCode = fail ? 1 : 0;
