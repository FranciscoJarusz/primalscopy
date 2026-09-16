// controllers/feedController.js
//
// Lectura publica del feed de customizaciones recientes.
//
// No expone nada privado: el token y la wallet que lo customizo ya son publicos
// on-chain, y la miniatura es una version chica de la imagen que el NFT ya
// muestra en cualquier marketplace.

const feed = require('../lib/feedStore');

// La miniatura se sirve desde ESTE servicio y no desde PUBLIC_ASSETS_URL: el
// hosting de la coleccion recibe el GIF y la metadata, pero no el feed, que es
// nuestro. Se devuelve la ruta sin dominio para que el front la pegue a su
// BACKEND_BASE_URL, igual que hace con los traits, y funcione tanto en local
// como en produccion sin configurar nada.
function thumbnailUrl(entry) {
    return `/feed/thumbs/${entry.thumbnail}`;
}

// GET /api/nft/recent-customizations
function listRecentCustomizations(req, res) {
    try {
        const items = feed.list().map(entry => ({
            id: entry.id,
            tokenId: entry.tokenId,
            wallet: entry.wallet,
            createdAt: entry.createdAt,
            thumbnailUrl: thumbnailUrl(entry)
        }));

        // El "hace cuanto" lo calcula el front con createdAt, pero necesita
        // saber la hora del server: si el reloj del visitante esta corrido,
        // sin esto veria "en 3 horas" o "hace 5 horas" en cosas recien hechas.
        res.set('Cache-Control', 'no-cache');
        res.json({ limit: feed.MAX_ITEMS, serverTime: new Date().toISOString(), items });
    } catch (error) {
        console.error('[ERROR] listRecentCustomizations ->', error);
        res.status(500).json({ error: 'No se pudo leer el feed de customizaciones.' });
    }
}

module.exports = { listRecentCustomizations };
