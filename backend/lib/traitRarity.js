// lib/traitRarity.js
//
// Sorteo de traits segun la rareza original de la coleccion. Es la base de
// los rolls del LAB: un trait que tienen 30 de 2700 NFTs sale ~1,1% de las
// veces, uno que tienen 871 sale ~32%.
//
// Los pesos salen de data/trait-rarity.json, una foto fija que genera
// scripts/snapshot-rarity.js. Ver ahi por que no se recalcula.

const crypto = require('crypto');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'trait-rarity.json');

function createRarity(snapshot) {
    const categories = snapshot.categories || {};
    const oneOfOnes = new Set((snapshot.oneOfOnes || []).map(String));

    // [valor, cantidad] de una categoria, excluyendo lo que no se puede
    // sortear. "allow" existe porque la foto no sabe si un trait tiene arte:
    // quien sortea le pasa ese chequeo (ej. Morale Amulet no tiene carpeta).
    function weightsFor(category, { exclude = [], allow = () => true } = {}) {
        const excluded = new Set(exclude);
        return Object.entries(categories[category] || {})
            .filter(([value, count]) => count > 0 && !excluded.has(value) && allow(value));
    }

    // Sorteo ponderado. randomInt es de crypto y no Math.random porque cada
    // roll se paga: tiene que ser imposible de predecir.
    function pick(category, options = {}) {
        const weights = weightsFor(category, options);
        const total = weights.reduce((sum, [, count]) => sum + count, 0);
        if (total === 0) return null;

        const randomInt = options.randomInt || crypto.randomInt;
        let ticket = randomInt(total);
        for (const [value, count] of weights) {
            if (ticket < count) return value;
            ticket -= count;
        }
        return null; // inalcanzable: ticket < total
    }

    // Probabilidad de cada valor, para mostrarla en el LAB.
    function probabilities(category, options = {}) {
        const weights = weightsFor(category, options);
        const total = weights.reduce((sum, [, count]) => sum + count, 0);
        return Object.fromEntries(weights.map(([value, count]) => [value, total ? count / total : 0]));
    }

    return {
        categories: Object.keys(categories),
        isOneOfOne: tokenId => oneOfOnes.has(String(tokenId)),
        weightsFor,
        pick,
        probabilities
    };
}

let defaultInstance = null;
function getRarity() {
    if (!defaultInstance) defaultInstance = createRarity(require(SNAPSHOT_PATH));
    return defaultInstance;
}

module.exports = { createRarity, getRarity, SNAPSHOT_PATH };
