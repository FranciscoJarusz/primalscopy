// lib/traitFingerprint.js
//
// Identifica un trait por su contenido y no por su ruta.
//
// Hace falta porque desde /admin se pueden renombrar traits y moverlos entre
// carpetas, incluida _GLOBAL. Cuando eso pasa, una customizacion guardada
// queda apuntando a una ruta que ya no existe y el customizer no puede mostrar
// lo que el NFT tiene puesto de verdad.
//
// Paso exactamente eso con el token 54: NAKED-ARMY-SWORD.gif se movio de
// HAT/SPIKES/ a HAT/_GLOBAL/ y se renombro a Z-SWORD-NAKEDARMY.gif. El archivo
// es identico byte a byte, asi que buscandolo por contenido se lo encuentra
// igual.
//
// Las rutas se siguen guardando: son el camino rapido. La huella es el plan B.

const fs = require('fs');
const crypto = require('crypto');

// Calcular el sha256 de un GIF de 150 KB es barato, pero hacerlo para las 151
// variantes de una categoria en cada consulta no lo es. La cache se invalida
// sola si el archivo cambia de tamaño o de fecha, que es lo que pasa cuando se
// sube uno nuevo con el mismo nombre.
const cache = new Map();

function fingerprint(filePath) {
    let stats;
    try {
        stats = fs.statSync(filePath);
    } catch {
        return null;
    }

    const key = filePath;
    const stamp = `${stats.size}:${stats.mtimeMs}`;
    const hit = cache.get(key);
    if (hit && hit.stamp === stamp) return hit.hash;

    try {
        const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        cache.set(key, { stamp, hash });
        return hash;
    } catch {
        return null;
    }
}

/**
 * Busca entre las variantes ofrecidas hoy alguna cuyo archivo tenga la misma
 * huella. Devuelve la variante o null.
 */
function findVariantByFingerprint(variants, hash, resolvePath) {
    if (!hash || !Array.isArray(variants)) return null;
    for (const variant of variants) {
        if (!variant?.imageUrl) continue;
        const filePath = resolvePath(variant.imageUrl);
        if (!filePath) continue;
        if (fingerprint(filePath) === hash) return variant;
    }
    return null;
}

module.exports = { fingerprint, findVariantByFingerprint };
