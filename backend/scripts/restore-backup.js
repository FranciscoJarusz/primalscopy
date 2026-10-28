// Uso:
//   node --env-file=.env scripts/restore-backup.js list
//   node --env-file=.env scripts/restore-backup.js <carpeta vacia> [snapshot] [--sin-archivos]
//
// Baja un backup a una carpeta nueva, nunca encima de los datos en uso. Sin
// snapshot usa el ultimo. Despues se copia esa carpeta al volumen a mano.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { bucket, isConfigured } = require('../lib/backup');

function dentro(raiz, rel) {
    const archivo = path.resolve(raiz, rel);
    if (!archivo.startsWith(raiz + path.sep)) throw new Error(`Ruta invalida en el backup: ${rel}`);
    return archivo;
}

async function main() {
    const args = process.argv.slice(2);
    const sinArchivos = args.includes('--sin-archivos');
    const [destino, elegido] = args.filter(a => !a.startsWith('--'));
    if (!isConfigured()) throw new Error('Faltan las variables BACKUP_S3_*.');
    if (!destino) throw new Error('Falta la carpeta de destino (o "list").');
    const b = bucket();

    const snapshots = (await b.list('snapshots/')).sort();
    if (destino === 'list') {
        for (const s of snapshots) console.log(s);
        console.log(`${snapshots.length} snapshots.`);
        return;
    }

    const raiz = path.resolve(destino);
    if (fs.existsSync(raiz) && fs.readdirSync(raiz).length) throw new Error(`${raiz} no esta vacia.`);
    const key = elegido ? (elegido.startsWith('snapshots/') ? elegido : `snapshots/${elegido}`) : snapshots.at(-1);
    if (!key) throw new Error('No hay ningun snapshot.');

    const gz = await b.get(key);
    if (!gz) throw new Error(`No existe ${key}.`);
    const { createdAt, files } = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
    for (const [rel, contenido] of Object.entries(files)) {
        const archivo = dentro(raiz, rel);
        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        fs.writeFileSync(archivo, contenido);
    }
    console.log(`${key} (${createdAt}): ${Object.keys(files).length} archivos de datos.`);
    if (sinArchivos) return;

    const archivos = await b.list('files/');
    let hechos = 0;
    for (const k of archivos) {
        const archivo = dentro(raiz, k.slice('files/'.length));
        const datos = await b.get(k);
        if (!datos) continue;
        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        fs.writeFileSync(archivo, datos);
        if (++hechos % 100 === 0) console.log(`  ${hechos}/${archivos.length} imagenes...`);
    }
    console.log(`${hechos} imagenes y traits.`);
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
