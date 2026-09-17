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
// Cada entrada guarda un JPEG del primer frame y no el GIF. Una pantalla de
// GIFs de 2000px son decenas de MB; el JPEG chico se ve igual de bien en una
// miniatura y pesa unos 65 KB.
//
// Cuanto ocupa el historial lleno: 1000 entradas x 65 KB = unos 63 MB de
// imagenes, mas 0,2 MB del indice. Va dentro de ASSETS_ROOT, o sea dentro del
// volumen, asi que sobrevive a los deploys igual que la metadata.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');

const FEED_DIR = path.join(ASSETS_ROOT, 'feed');
const THUMBS_DIR = path.join(FEED_DIR, 'thumbs');
const INDEX_PATH = path.join(FEED_DIR, 'index.json');

// Cuantas entradas se conservan. Al entrar la numero 1001 se borra la mas
// vieja, con su JPEG: el feed no crece para siempre.
const MAX_ITEMS = Math.max(1, Number(process.env.FEED_MAX_ITEMS || 1000));

// Cuantas se mandan por pagina. 50 es lo que se pidio; el tope existe para que
// nadie se baje el historial entero de una pidiendo perPage=1000, que serian
// 63 MB en una sola respuesta.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

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

function tieneArchivo(entry) {
    try {
        return fs.statSync(thumbPath(entry.thumbnail)).size > 0;
    } catch {
        return false;
    }
}

// El id lleva el timestamp adelante para que ordene solo, y un sufijo al azar
// para que dos guardados en el mismo milisegundo no compartan nombre de
// archivo. Como cada miniatura tiene un nombre unico, se puede cachear para
// siempre sin que nadie vea una imagen vieja.
function newId() {
    return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function borrarThumb(fileName) {
    try {
        fs.unlinkSync(thumbPath(fileName));
    } catch {
        // Que no se pueda borrar una miniatura vieja no es motivo para fallar un
        // guardado que ya salio bien.
    }
}

// Barre los JPEG que no referencia nadie. Cubre lo que haya quedado suelto si
// el proceso murio entre escribir la imagen y escribir el indice.
//
// Se llama al arrancar y no en cada guardado: con el historial lleno son 1000
// archivos para listar, y no hay por que pagar eso cada vez que alguien
// customiza. Los que se caen por el tope se borran en el momento, uno por uno.
function cleanupOrphans() {
    const vivos = new Set(readIndex().map(entry => entry.thumbnail));
    let archivos;
    try {
        archivos = fs.readdirSync(THUMBS_DIR);
    } catch {
        return 0;
    }

    let borrados = 0;
    for (const archivo of archivos) {
        if (vivos.has(archivo)) continue;
        borrarThumb(archivo);
        borrados++;
    }
    return borrados;
}

// Los guardados corren de a dos en paralelo (MAX_SIMULTANEOS en el controller),
// y este indice es un leer-modificar-escribir. Sin esta cola, dos guardados
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

    // Primero la imagen: una entrada en el indice sin su archivo se veria rota
    // en la grilla. Al reves solo deja un huerfano, que cleanupOrphans limpia
    // en el proximo arranque.
    writeAtomic(thumbPath(entry.thumbnail), jpeg);

    const completo = [entry, ...readIndex()];
    const entries = completo.slice(0, MAX_ITEMS);
    writeAtomic(INDEX_PATH, JSON.stringify(entries));

    // Lo que quedo afuera del tope se borra ya, sin listar el directorio.
    for (const sobrante of completo.slice(MAX_ITEMS)) {
        borrarThumb(sobrante.thumbnail);
    }

    return entry;
}

// El indice crudo, mas nuevo primero y sin tocar el disco por cada entrada.
function list() {
    return readIndex();
}

/**
 * Una pagina del feed, de la mas nueva a la mas vieja.
 *
 * Solo se fija si existe el archivo de las entradas de ESTA pagina: con el
 * historial lleno, verificar las 1000 en cada request serian 1000 llamadas al
 * disco para mostrar 50. Por eso una pagina puede venir con menos de perPage
 * elementos si alguna miniatura se perdio, que es un caso raro.
 */
function page({ page: pageNumber = 1, perPage = DEFAULT_PAGE_SIZE } = {}) {
    const entries = readIndex();

    const tamanio = Math.min(Math.max(1, Math.floor(Number(perPage) || DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE);
    const paginas = Math.max(1, Math.ceil(entries.length / tamanio));
    // Una pagina fuera de rango devuelve la ultima en vez de una lista vacia:
    // asi, si alguien tenia abierta la pagina 20 y el feed se achico, sigue
    // viendo algo.
    const actual = Math.min(Math.max(1, Math.floor(Number(pageNumber) || 1)), paginas);

    const desde = (actual - 1) * tamanio;
    const items = entries.slice(desde, desde + tamanio).filter(tieneArchivo);

    return { items, total: entries.length, page: actual, pages: paginas, perPage: tamanio };
}

module.exports = {
    FEED_DIR,
    THUMBS_DIR,
    MAX_ITEMS,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    ensureDirs,
    cleanupOrphans,
    record,
    list,
    page
};
