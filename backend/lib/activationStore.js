const fs = require('fs');
const path = require('path');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');
const { readJson, writeJson } = require('./jsonFiles');

const DIR = path.join(ASSETS_ROOT, 'activations');
const DEFS_PATH = path.join(DIR, 'activations.json');
const IMAGES_DIR = path.join(DIR, 'images');
const IMAGE_FILE_REGEX = /^[a-z0-9-]{1,40}-\d{13}\.webp$/;
const ID_REGEX = /^[a-z0-9-]{1,40}$/;
const ANCHO = 900;
const ALTO = 1350;

const ESTADOS = ['finished', 'live', 'progress', 'upcoming'];
const ENCUADRES = ['cover', 'contain'];

const hito = (id, title, text, status, category, date, image, href = '', fit = 'cover') =>
    ({ id, title, text, status, category, date, image, fit, href, enabled: true });

const SEMILLA = [
    hito('settlement', 'The settlement', 'A new home for the Cult is being built. More details soon.', 'progress', 'Community', 'TBA', '/images/primals/20.webp'),
    hito('legacy-campaign', 'The legacy campaign', 'Community-led, decentralized campaigns on X. "Trade to Burn." The more we trade, the better.', 'upcoming', 'Community', 'TBA', '/images/primals/35.webp'),
    hito('mudwater', 'Mudwater event', 'Open Primal Event Packs every day, climb the leaderboard and win Mudwater packs.', 'live', 'Games', 'Nov 2026', '/packs/pack-color.webp', '/mudwater', 'contain'),
    hito('raffles', 'Weekly raffles', 'Giveaways for members and holders, now live on the website with FOG entries.', 'live', 'Rewards', 'Oct 2026', '/images/primals/12.webp', '/raffles'),
    hito('explore', 'The cult never dies', 'The website is a living archive: every Primal, holder and $APE burned, tracked in real time.', 'live', 'Tools', 'Oct 2026', '/images/primals/1520.webp', '/explore'),
    hito('shop', 'The Shop', 'Get FOG with APE and spend it on keys, raffle tickets, rerolls and more.', 'live', 'Rewards', 'Oct 2026', '/images/primals/66.webp', '/shop'),
    hito('staking', 'Soft staking', 'Stake your Primals on the website and earn FOG every day. They never leave your wallet.', 'live', 'Rewards', 'Oct 2026', '/images/landing/staking.webp', '/staking'),
    hito('forge', 'The Forge', "Roll your Primal's traits. Keep up to 3 and roll the rest, with the same odds as the collection.", 'live', 'Tools', 'Oct 2026', '/images/forge/hero.webp', '/forge'),
    hito('cultomizer', 'The Cultomizer', 'Customize your Primal on-chain, tailor it to your liking on our website.', 'live', 'Tools', 'Sep 2026', '/images/landing/cultomizer.webp', '/cultomizer'),
    hito('otherside', 'Otherside avatar', 'Our Legacy Model is ready to glitch the Yuga Labs Metaverse.', 'live', 'Community', 'TBA', '/images/primals/48.webp'),
    hito('quests', 'Quests and events', 'Fun interactive actions made in order to activate engagement in the community.', 'live', 'Community', 'TBA', '/images/primals/7.webp'),
    hito('launch', 'Smooth launch', 'Community creation around all the collection to get a smooth launch on Blever.', 'finished', 'Community', 'TBA', '/images/primals/1.webp'),
];

function leer() {
    const guardadas = readJson(DEFS_PATH, null);
    return Array.isArray(guardadas) ? guardadas : SEMILLA.map(h => ({ ...h }));
}

const escribir = lista => writeJson(DEFS_PATH, lista);

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

const enlaceValido = href => href === '' || (/^\/(?!\/)/.test(href)) || /^https:\/\/[^\s]+$/.test(href);

function limpiar(body, actual) {
    const h = { ...actual };
    if ('title' in body) h.title = texto(body.title, 60);
    if ('text' in body) h.text = texto(body.text, 400);
    if ('status' in body) h.status = String(body.status);
    if ('category' in body) h.category = texto(body.category, 30);
    if ('date' in body) h.date = texto(body.date, 30);
    if ('href' in body) h.href = texto(body.href, 300);
    if ('fit' in body) h.fit = String(body.fit);
    if ('enabled' in body) h.enabled = Boolean(body.enabled);
    if (!h.title) return { error: 'The activation needs a title.' };
    if (!ESTADOS.includes(h.status)) return { error: 'Unknown status.' };
    if (!ENCUADRES.includes(h.fit)) return { error: 'Unknown image fit.' };
    if (!enlaceValido(h.href)) return { error: 'The link must start with / (a page of the site) or https://.' };
    return { activation: h };
}

function admin() {
    return { activations: leer(), statuses: ESTADOS };
}

function publico() {
    return leer()
        .filter(h => h.enabled)
        .map(({ enabled, ...h }) => h);
}

function crear(body) {
    const lista = leer();
    const base = String(body?.title || 'activation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'activation';
    let id = base;
    for (let i = 2; lista.some(h => h.id === id); i++) id = `${base}-${i}`;
    const r = limpiar(body || {}, { ...hito(id, '', '', 'upcoming', '', 'TBA', null), enabled: false });
    if (r.error) return { error: r.error, status: 400 };
    lista.unshift(r.activation);
    escribir(lista);
    return admin();
}

function actualizar(id, body) {
    const lista = leer();
    const i = lista.findIndex(h => h.id === id);
    if (i < 0) return { error: 'Unknown activation.', status: 404 };
    const r = limpiar(body || {}, lista[i]);
    if (r.error) return { error: r.error, status: 400 };
    lista[i] = r.activation;
    escribir(lista);
    return admin();
}

function borrarImagen(file) {
    if (file && IMAGE_FILE_REGEX.test(file)) fs.rm(path.join(IMAGES_DIR, file), { force: true }, () => {});
}

function borrar(id) {
    const lista = leer();
    const h = lista.find(x => x.id === id);
    if (!h) return { error: 'Unknown activation.', status: 404 };
    borrarImagen(h.image);
    escribir(lista.filter(x => x.id !== id));
    return admin();
}

function ordenar(ids) {
    const lista = leer();
    if (!Array.isArray(ids) || ids.length !== lista.length || new Set(ids).size !== ids.length
        || !ids.every(id => lista.some(h => h.id === id))) {
        return { error: 'The order must list every activation once.', status: 400 };
    }
    escribir(ids.map(id => lista.find(h => h.id === id)));
    return admin();
}

async function ponerImagen(id, buffer) {
    if (!ID_REGEX.test(String(id)) || !leer().some(h => h.id === id)) return { error: 'Unknown activation.', status: 404 };
    let webp;
    try {
        webp = await require('sharp')(buffer, { animated: true })
            .resize(ANCHO, ALTO, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
    } catch {
        return { error: "That file isn't an image we can read.", status: 400 };
    }
    const lista = leer();
    const h = lista.find(x => x.id === id);
    if (!h) return { error: 'Unknown activation.', status: 404 };
    const file = `${id}-${Date.now()}.webp`;
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    writeAtomic(path.join(IMAGES_DIR, file), webp);
    borrarImagen(h.image);
    h.image = file;
    escribir(lista);
    return admin();
}

function quitarImagen(id) {
    const lista = leer();
    const h = lista.find(x => x.id === id);
    if (!h) return { error: 'Unknown activation.', status: 404 };
    borrarImagen(h.image);
    h.image = null;
    escribir(lista);
    return admin();
}

function imagePath(file) {
    return IMAGE_FILE_REGEX.test(String(file)) ? path.join(IMAGES_DIR, file) : null;
}

module.exports = { ESTADOS, admin, publico, crear, actualizar, borrar, ordenar, ponerImagen, quitarImagen, imagePath };
