// lib/traitRarity.js
//
// Rareza de la coleccion y sorteo de traits para los rolls del Forge.
//
// Hay dos numeros distintos por trait, y conviene no mezclarlos:
//   - La rareza en la coleccion (`probabilities`): que parte de los NFTs lo
//     tiene. Un trait que tienen 30 de 2700 NFTs es ~1,1%. De aca sale el
//     color con que se muestra (Common, Rare, Super Rare...).
//   - Las odds del roll (`rollOdds`, y lo que usa `pick`): con que
//     probabilidad sale en el Forge. Los traits raros salen MENOS que su
//     rareza en la coleccion, segun los rangos que fijo el dueño (ROLL_ODDS);
//     lo que se les saca va a los comunes.
//
// Los conteos salen de data/trait-rarity.json, una foto fija que genera
// scripts/snapshot-rarity.js. Ver ahi por que no se recalcula.

const crypto = require('crypto');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'trait-rarity.json');

// Odds de un roll para cada color de rareza, por trait (fijadas por el dueño,
// 2026-09-27). Los cortes `desde`/`hasta` son los mismos que usa el front para
// los colores (web/src/components/forge/rareza.ts): si cambian alla, cambiar
// aca. Dentro de cada color, un trait cae en el rango en proporcion a su
// rareza: el mas raro cerca de `min`, el menos raro cerca de `max`.
// Common (15% o mas) y Uncommon (8% a 15%) no estan: se quedan con lo que
// sobra, repartido segun cuantos NFTs los tienen.
const ROLL_ODDS = [
    { tier: 'Rare', desde: 0.04, hasta: 0.08, min: 0.01, max: 0.03 },
    { tier: 'Very Rare', desde: 0.02, hasta: 0.04, min: 0.005, max: 0.01 },
    { tier: 'Super Rare', desde: 0, hasta: 0.02, min: 0.001, max: 0.005 }
];

// Odds fija de un trait segun su rareza en la coleccion, o null si es
// Common/Uncommon (esos no tienen odds fija).
function fixedOdds(share) {
    const band = ROLL_ODDS.find(b => share >= b.desde && share < b.hasta);
    if (!band) return null;
    return band.min + (share - band.desde) / (band.hasta - band.desde) * (band.max - band.min);
}

// El sorteo trabaja con enteros (crypto.randomInt no acepta decimales): cada
// odds se pasa a "tickets" sobre este total.
const TICKETS = 1_000_000_000;

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

    // Que parte de la coleccion tiene cada valor (de lo que queda despues de
    // las exclusiones). Sin exclusiones, es la rareza que define los colores.
    function probabilities(category, options = {}) {
        const weights = weightsFor(category, options);
        const total = weights.reduce((sum, [, count]) => sum + count, 0);
        return Object.fromEntries(weights.map(([value, count]) => [value, total ? count / total : 0]));
    }

    // Odds de cada valor en un roll. Los raros tienen su odds fija (el color
    // se decide con la rareza en TODA la categoria, no con lo que queda
    // despues de excluir el valor actual); los comunes se reparten el resto.
    function rollOdds(category, options = {}) {
        const allowed = weightsFor(category, options);
        if (allowed.length === 0) return {};

        const share = probabilities(category);
        const odds = {};
        const free = [];
        let fixedSum = 0;
        let freeCount = 0;
        for (const [value, count] of allowed) {
            const fixed = fixedOdds(share[value]);
            if (fixed === null) {
                free.push([value, count]);
                freeCount += count;
            } else {
                odds[value] = fixed;
                fixedSum += fixed;
            }
        }

        // Sin comunes sorteables (no pasa con la coleccion real), los raros
        // se reparten el 100% manteniendo sus proporciones.
        if (freeCount === 0) {
            for (const value of Object.keys(odds)) odds[value] /= fixedSum;
            return odds;
        }

        const rest = Math.max(0, 1 - fixedSum);
        for (const [value, count] of free) odds[value] = rest * count / freeCount;
        return odds;
    }

    // Sorteo ponderado por las odds del roll. randomInt es de crypto y no
    // Math.random porque cada roll se paga: tiene que ser imposible de predecir.
    function pick(category, options = {}) {
        const entries = Object.entries(rollOdds(category, options))
            .map(([value, p]) => [value, Math.round(p * TICKETS)])
            .filter(([, tickets]) => tickets > 0);
        const total = entries.reduce((sum, [, tickets]) => sum + tickets, 0);
        if (total === 0) return null;

        const randomInt = options.randomInt || crypto.randomInt;
        let ticket = randomInt(total);
        for (const [value, tickets] of entries) {
            if (ticket < tickets) return value;
            ticket -= tickets;
        }
        return null; // inalcanzable: ticket < total
    }

    return {
        categories: Object.keys(categories),
        isOneOfOne: tokenId => oneOfOnes.has(String(tokenId)),
        weightsFor,
        pick,
        probabilities,
        rollOdds
    };
}

let defaultInstance = null;
function getRarity() {
    if (!defaultInstance) defaultInstance = createRarity(require(SNAPSHOT_PATH));
    return defaultInstance;
}

module.exports = { createRarity, getRarity, SNAPSHOT_PATH, ROLL_ODDS, TICKETS };
