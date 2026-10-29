// El indice de transferencias (lib/transferIndex.js) contra una cadena falsa:
// dueños, desde cuando tiene Primals cada wallet, quemas, tramos que el RPC
// rechaza por grandes y retomar desde lo guardado.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-transfers-'));
process.env.TRAITS_PATH = TMP;
process.env.NFT_FROM_BLOCK = '100';

const transfers = require('../lib/transferIndex');
const collection = require('../lib/collectionIndex');
const { CONTRACT_ADDRESS } = require('../lib/nftOwnership');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const CERO = '0x0000000000000000000000000000000000000000';
const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const C = '0x00000000000000000000000000000000000000cc';
const DIA = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2024-12-27T15:24:29Z');

const tema = dir => `0x${dir.slice(2).padStart(64, '0')}`;
const hex = n => `0x${BigInt(n).toString(16)}`;
const sinFecha = new Set([1500]);
const evento = (bloque, from, to, id) => ({
    blockNumber: hex(bloque),
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', tema(from), tema(to), hex(id)],
    ...(sinFecha.has(bloque) ? {} : { blockTimestamp: hex((T0 + (bloque - 100) * DIA) / 1000) })
});

const cadena = [
    evento(100, CERO, A, 1),
    evento(100, CERO, A, 2),
    evento(1500, CERO, B, 3),
    evento(2500, A, B, 1),
    evento(3000, A, C, 2),
    evento(3500, B, A, 3),
    evento(4200, B, CERO, 1)
];
const fecha = bloque => new Date(T0 + (bloque - 100) * DIA).toISOString();

function fuenteFalsa(head = 5002) {
    const f = {
        pedidos: 0,
        rechazados: 0,
        fechasPedidas: 0,
        head: async () => head,
        getLogs: async (desde, hasta) => {
            f.pedidos++;
            if (hasta - desde + 1 > 1000) {
                f.rechazados++;
                throw new Error('query exceeds max block range 1000');
            }
            return cadena
                .filter(l => Number(BigInt(l.blockNumber)) >= desde && Number(BigInt(l.blockNumber)) <= hasta)
                .map(l => ({ ...l }));
        },
        blockTime: async bloque => {
            f.fechasPedidas++;
            return T0 + (bloque - 100) * DIA;
        }
    };
    return f;
}

async function main() {
    console.log('\n--- Antes de leer la cadena ---');
    let fuente = fuenteFalsa();
    transfers.usarFuente(fuente);
    check('no esta al dia', !transfers.alDia());
    check('sin dueños del indice', transfers.duenos() === null);
    check('sin holder since', transfers.holderSince(A) === null);

    console.log('\n--- Primera lectura ---');
    await transfers.sincronizar();
    const st = transfers.status();
    check('queda al dia', st.ready, JSON.stringify(st));
    check('llega hasta el ultimo bloque confirmado', st.lastBlock === 5000, String(st.lastBlock));
    check('progreso completo', st.progress === 1, String(st.progress));
    check('achica el tramo cuando el RPC lo rechaza', fuente.rechazados > 0 && fuente.pedidos > fuente.rechazados);
    check('pide la fecha del bloque que no la trae', fuente.fechasPedidas === 1, String(fuente.fechasPedidas));

    const duenos = transfers.duenos();
    check('el 3 es de A', duenos.get('3') === A);
    check('el 2 es de C', duenos.get('2') === C);
    check('el quemado no tiene dueño', !duenos.has('1'));
    check('mismo Map sin transferencias nuevas', transfers.duenos() === duenos);
    const algunos = await transfers.ownersOf(['2', '3', '99']);
    check('ownersOf usa el indice', algunos.get('2') === C && algunos.get('3') === A && algunos.get('99') === null);

    console.log('\n--- Holder since ---');
    const a = transfers.holderSince(A);
    check('A vuelve a contar desde que recompro', a.since === fecha(3500), a.since);
    check('A conserva su primera compra', a.first === fecha(100), a.first);
    check('A minteo 2', a.minted === 2, String(a.minted));
    check('A ya no tiene ninguno de los que minteo', a.mintedHeld === 0, String(a.mintedHeld));
    check('A mando 2', a.sent === 2, String(a.sent));
    check('quemar no cuenta como mandar', transfers.holderSince(B).sent === 1, String(transfers.holderSince(B).sent));
    check('C conserva el que no minteo', transfers.holderSince(C).mintedHeld === 0);
    const b = transfers.holderSince(B);
    check('B quedo en cero al quemar', b.since === null, String(b.since));
    check('B tiene la fecha que vino sin blockTimestamp', b.first === fecha(1500), b.first);    check('C desde su compra', transfers.holderSince(C).since === fecha(3000));
    check('una wallet sin Primals', transfers.holderSince('0x00000000000000000000000000000000000000dd').since === null);
    check('cuenta holders con Primals', transfers.status().holders === 2, String(transfers.status().holders));

    console.log('\n--- Lo usa el explorador ---');
    check('collectionIndex.owners es el del indice', (await collection.owners()) === duenos);
    const { conteo } = await collection.holders();
    check('holders por wallet', conteo.get(A) === 1 && conteo.get(C) === 1 && conteo.size === 2, JSON.stringify([...conteo]));

    console.log('\n--- Retomar desde lo guardado ---');
    check('guardo el estado', fs.existsSync(transfers.STATE_PATH));
    const guardado = JSON.parse(fs.readFileSync(transfers.STATE_PATH, 'utf8'));
    check('el archivo es del contrato', guardado.contract === CONTRACT_ADDRESS.toLowerCase());
    check('sin syncedAt en el archivo', !('syncedAt' in guardado));

    cadena.push(evento(5100, C, B, 2), evento(5150, CERO, B, 5));
    fuente = fuenteFalsa(5202);
    transfers.usarFuente(fuente);
    check('al reiniciar no esta al dia hasta leer', !transfers.alDia());
    await transfers.sincronizar();
    check('lee solo los bloques nuevos', fuente.pedidos === 1, String(fuente.pedidos));
    check('ve la transferencia nueva', transfers.duenos().get('2') === B);
    check('C queda en cero', transfers.holderSince(C).since === null);
    check('B vuelve a tener desde ahora', transfers.holderSince(B).since === fecha(5100));
    check('B sigue teniendo el que minteo', transfers.holderSince(B).mintedHeld === 1, String(transfers.holderSince(B).mintedHeld));

    console.log('\n--- Otro bloque de inicio ---');
    fs.writeFileSync(transfers.STATE_PATH, JSON.stringify({ ...guardado, fromBlock: 1 }));
    fuente = fuenteFalsa(5202);
    transfers.usarFuente(fuente);
    await transfers.sincronizar();
    check('arranca de cero si cambia el bloque de inicio', transfers.status().fromBlock === 100 && transfers.duenos().get('2') === B);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exitCode = fail ? 1 : 0;
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
