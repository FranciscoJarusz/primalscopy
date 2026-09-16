// lib/feedStore.js
//
// El historial de las ultimas customizaciones publicadas: lo que alimenta la
// pantalla "Recent Customizations".
//
// Es un feed de EVENTOS, no un estado por token. Si alguien actualiza el mismo
// primal tres veces, aparece tres veces, una por cada variante que armo. Eso es
// lo que se pidio: la gracia es ver que esta haciendo la comunidad, y las tres
// pasadas de un mismo token son tres ideas distintas.
//
// Cada entrada guarda un JPEG del primer frame y no el GIF. Diez GIFs de 2000px
// en una sola pantalla son decenas de MB y hacen que la grilla tarde en cargar;
// el JPEG chico se ve igual de bien en una miniatura.
//
// Vive dentro de ASSETS_ROOT, o sea dentro del volumen: el feed sobrevive a los
// deploys igual que la metadata y las imagenes.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');

const FEED_DIR = path.join(ASSETS_ROOT, 'feed');
const THUMBS_DIR = path.join(FEED_DIR, 'thumbs');
const INDEX_PATH = path.join(FEED_DIR, 'index.json');

// Cuantas entradas se conservan. Al entrar la numero 11 se borra la mas vieja,
// con su JPEG: el feed no crece nunca, ni en disco ni en lo que baja el que
// abre la pantalla.
const MAX_ITEMS = Math.max(1, Number(process.env.FEED_MAX_ITEMS || 10));

function ensureDirs() {
    fs.mkdirSync(THUMBS_DIR, { recursive: true });
}

function thumbPath(fileName) {
    // Nunca se concatena a mano lo que venga del index: si un archivo quedo con
    // un nombre raro, que no se pueda salir de la carpeta de miniaturas.
    return path.join(THUMBS_DIR, path.basename(fileName));
}

function readIndex() {
    try {
        const parsed = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// El id lleva el timestamp adelante para que ordene solo, y un sufijo al azar
// para que dos guardados en el mismo milisegundo no compartan nombre de
// archivo. Como cada miniatura tiene un nombre unico, se puede cachear para
// siempre sin que nadie vea una imagen vieja.
function newId() {
    return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

// Borra los JPEG que ya no referencia nadie. Cubre dos casos: la entrada que se
// acaba de caer del final, y cualquier archivo que haya quedado suelto si el
// proceso murio entre escribir la imagen y escribir el index.
function pruneOrphans(entries) {
    const vivos = new Set(entries.map(entry => entry.thumbnail));
    let archivos;
    try {
        archivos = fs.readdirSync(THUMBS_DIR);
    } catch {
        return;
    }
    for (const archivo of archivos) {
        if (vivos.has(archivo)) continue;
        try {
            fs.unlinkSync(thumbPath(archivo));
        } catch {
            // Que no se pueda borrar una miniatura vieja no es motivo para
            // fallar un guardado que ya salio bien.
        }
    }
}

// Los guardados corren de a dos en paralelo (MAX_SIMULTANEOS en el controller),
// y este index es un leer-modificar-escribir. Sin esta cola, dos guardados
// simultaneos leen la misma lista y el segundo pisa la entrada del primero.
let cola = Promise.resolve();

function record({ tokenId, wallet, jpeg }) {
    const tarea = cola.then(() => recordNow({ tokenId, wallet, jpeg }));
    // La cola sigue viva aunque una tarea falle; el error se lo lleva quien
    // llamo, no el proximo de la fila.
    cola = tarea.catch(() => {});
    return tarea;
}

async function recordNow({ tokenId, wallet, jpeg }) {
    ensureDirs();

    const id = newId();
    const entry = {
        id,
        tokenId: String(tokenId),
        wallet: wallet || null,
        createdAt: new Date().toISOString(),
        thumbnail: `${id}.jpg`
    };

    // Primero la imagen: una entrada en el index sin su archivo se veria rota
    // en la grilla. Al reves solo deja un huerfano, que pruneOrphans limpia.
    writeAtomic(thumbPath(entry.thumbnail), jpeg);

    const entries = [entry, ...readIndex()].slice(0, MAX_ITEMS);
    writeAtomic(INDEX_PATH, JSON.stringify(entries, null, 2));
    pruneOrphans(entries);

    return entry;
}

// Las mas nuevas primero. Se filtran las que perdieron su archivo para que la
// pantalla no muestre huecos.
function list() {
    return readIndex().filter(entry => {
        try {
            return fs.statSync(thumbPath(entry.thumbnail)).size > 0;
        } catch {
            return false;
        }
    });
}

module.exports = { FEED_DIR, THUMBS_DIR, MAX_ITEMS, ensureDirs, record, list };
