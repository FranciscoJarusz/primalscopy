// Dos cosas que antes tiraban abajo o vaciaban datos sin avisar:
//   - un error despues de un await en una ruta (Express 4 no lo atrapaba y
//     Node terminaba el proceso): ver lib/asyncErrors.js.
//   - una linea rota en un historial .jsonl, que dejaba el historial entero
//     vacio: ver readJsonLines en lib/jsonFiles.js.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-robustez-'));
process.env.TRAITS_PATH = TMP;

const express = require('express');
require('../lib/asyncErrors');
const { readJsonLines } = require('../lib/jsonFiles');

const PORT = 39881;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

async function pedir(ruta) {
    const response = await fetch(`http://localhost:${PORT}${ruta}`);
    return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
    console.log('\n--- Errores en rutas async ---');
    const app = express();
    const router = express.Router();
    router.get('/async', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        throw new Error('se rompio despues del await');
    });
    router.get('/sync', () => {
        throw new Error('se rompio de una');
    });
    router.get('/bien', async (req, res) => res.json({ ok: true }));
    app.use('/api', router);
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

    const server = app.listen(PORT);
    await new Promise(resolve => server.once('listening', resolve));

    const async = await pedir('/api/async');
    check('un error despues de un await contesta 500', async.status === 500, JSON.stringify(async));
    check('y llega al manejador de errores', async.body?.error === 'se rompio despues del await');
    const sync = await pedir('/api/sync');
    check('un error sincronico sigue igual', sync.status === 500 && sync.body?.error === 'se rompio de una');
    const bien = await pedir('/api/bien');
    check('el server sigue atendiendo', bien.status === 200 && bien.body?.ok === true);
    server.closeAllConnections();
    server.close();

    console.log('\n--- Historial con una linea rota ---');
    const archivo = path.join(TMP, 'history.jsonl');
    fs.writeFileSync(archivo, '{"event":"start","n":1}\n{"event":"end","n":2}\n{"event":"sta\n{"event":"redeem","n":3}\n');
    const avisos = [];
    const warn = console.warn;
    console.warn = msg => avisos.push(msg);
    const entradas = readJsonLines(archivo, 'test');
    console.warn = warn;
    check('las lineas buenas se leen', entradas.map(e => e.n).join(',') === '1,2,3', JSON.stringify(entradas));
    check('la rota se avisa', avisos.length === 1 && /1 linea/.test(avisos[0]));
    check('un historial que no existe es vacio', readJsonLines(path.join(TMP, 'no-existe.jsonl')).length === 0);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    // Sin process.exit: en Windows, salir asi despues de un fetch hacia un
    // server propio a veces revienta en libuv. Cerrado el server, sale solo.
    process.exitCode = fail ? 1 : 0;
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
