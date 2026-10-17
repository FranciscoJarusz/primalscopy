// lib/collectionSupply.js
//
// Cuantos Primals hay. Sale de la cadena (totalSupply del contrato) y no de un
// numero fijo: el dueño puede subir el supply (setSupply) y nada tiene que
// quedar desfasado. RESPALDO es lo que se usa hasta la primera lectura o si
// la cadena no contesta.
//
// No es como la propiedad de un token, que se consulta en cada operacion (ver
// nftOwnership.js): el supply cambia muy de vez en cuando, asi que se guarda
// unos minutos.

const RESPALDO = 2712;
// Al recorrer ids se leen algunos de mas: si se quema un token, totalSupply
// baja pero los ids altos siguen existiendo.
const MARGEN_IDS = 100;
const VIGENCIA_MS = 10 * 60 * 1000;

let actual = { valor: RESPALDO, leido: 0 };

async function totalSupply() {
    if (Date.now() - actual.leido < VIGENCIA_MS) return actual.valor;
    try {
        const n = Number(await require('./nftOwnership').readTotalSupply());
        if (Number.isInteger(n) && n > 0) actual = { valor: n, leido: Date.now() };
    } catch (error) {
        console.warn(`[supply] No se pudo leer totalSupply: ${error.message}`);
    }
    return actual.valor;
}

// El ultimo valor leido, sin ir a la cadena.
function conocido() {
    return actual.valor;
}

module.exports = { totalSupply, conocido, MARGEN_IDS, RESPALDO };
