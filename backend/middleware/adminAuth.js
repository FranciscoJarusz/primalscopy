// middleware/adminAuth.js
//
// Auth simple por token compartido. No hay usuarios ni roles: el panel es para
// el equipo que administra la colección, así que alcanza con un secreto en una
// variable de entorno de Railway.
//
// Si ADMIN_TOKEN no está definido, TODA la API de admin queda deshabilitada.
// Es deliberado: prefiero que el panel no funcione a que quede abierto.

const crypto = require('crypto');
const { bearerToken } = require('./bearerToken');

// El .trim() no es cosmético: pegar el token en el dashboard de Railway suele
// arrastrar un salto de línea o un espacio final, y eso daba un 401 imposible
// de diagnosticar desde afuera.
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();

function isAdminEnabled() {
    return ADMIN_TOKEN.length > 0;
}

// Devuelve solo la longitud, nunca el token, para poder verificar desde los
// logs si lo que llegó al server es lo que se pegó en el dashboard.
function getAdminTokenLength() {
    return ADMIN_TOKEN.length;
}

// Comparación en tiempo constante para no filtrar el token carácter a carácter.
function tokensMatch(received) {
    const a = Buffer.from(received);
    const b = Buffer.from(ADMIN_TOKEN);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function adminAuth(req, res, next) {
    if (!isAdminEnabled()) {
        return res.status(503).json({
            error: 'The admin panel is disabled. Set ADMIN_TOKEN on the server.'
        });
    }

    const token = bearerToken(req);
    if (!token || !tokensMatch(token)) {
        return res.status(401).json({ error: 'Invalid admin token.' });
    }

    next();
}

module.exports = { adminAuth, isAdminEnabled, getAdminTokenLength };
