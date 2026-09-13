// middleware/adminAuth.js
//
// Auth simple por token compartido. No hay usuarios ni roles: el panel es para
// el equipo que administra la colección, así que alcanza con un secreto en una
// variable de entorno de Railway.
//
// Si ADMIN_TOKEN no está definido, TODA la API de admin queda deshabilitada.
// Es deliberado: prefiero que el panel no funcione a que quede abierto.

const crypto = require('crypto');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function isAdminEnabled() {
    return ADMIN_TOKEN.length > 0;
}

// Comparación en tiempo constante para no filtrar el token carácter a carácter.
function tokensMatch(received) {
    const a = Buffer.from(received);
    const b = Buffer.from(ADMIN_TOKEN);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function extractToken(req) {
    const header = req.get('authorization') || '';
    if (header.toLowerCase().startsWith('bearer ')) {
        return header.slice(7).trim();
    }
    return '';
}

function adminAuth(req, res, next) {
    if (!isAdminEnabled()) {
        return res.status(503).json({
            error: 'El panel de admin está deshabilitado. Definí ADMIN_TOKEN en el servidor.'
        });
    }

    const token = extractToken(req);
    if (!token || !tokensMatch(token)) {
        return res.status(401).json({ error: 'Token de admin inválido.' });
    }

    next();
}

module.exports = { adminAuth, isAdminEnabled };
