// lib/labRoll.js
//
// Las reglas de un roll del LAB, sin nada de HTTP ni disco:
//
//   - Entran 6 categorias. Effect no: todos los Primals tienen "Standart"
//     salvo el #15, cuyo Morale Amulet no tiene arte, asi que rollearla no
//     cambiaria nada y el #15 podria perder su amuleto. Lo decidio el dueño.
//   - Se pueden conservar hasta 3; el resto se sortea.
//   - Salen 2 opciones distintas entre si. Cada trait sorteado sale segun la
//     rareza original de la coleccion, y nunca repite el valor que el NFT ya
//     tiene: si pagaste para cambiar el fondo, el fondo cambia.

const ROLLABLE_CATEGORIES = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat'];
const MAX_KEEP = 3;
const OPTIONS_PER_ROLL = 2;

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400 });
}

// Lo que manda el cliente para "conservar": se valida antes de cobrar nada.
function validateKeep(keep) {
    if (keep === undefined || keep === null) return [];
    if (!Array.isArray(keep)) throw badRequest('"keep" tiene que ser una lista de categorias.');

    const unique = [...new Set(keep)];
    if (unique.length !== keep.length) throw badRequest('Hay categorias repetidas en "keep".');
    for (const category of unique) {
        if (!ROLLABLE_CATEGORIES.includes(category)) {
            throw badRequest(`"${category}" no es una categoria que se pueda conservar.`);
        }
    }
    if (unique.length > MAX_KEEP) throw badRequest(`Se pueden conservar hasta ${MAX_KEEP} traits.`);
    return unique;
}

// Los traits de un NFT como { Background: 'Aquamarine', ... } a partir de su
// metadata.
function traitsFromMetadata(metadata) {
    const traits = {};
    for (const attr of metadata?.attributes || []) {
        if (attr?.trait_type) traits[attr.trait_type] = attr.value;
    }
    return traits;
}

// La misma metadata con los traits cambiados. Solo reemplaza valores de
// categorias que ya existen: un roll nunca agrega ni saca atributos.
function applyTraits(metadata, changes) {
    return {
        ...metadata,
        attributes: (metadata.attributes || []).map(attr => (
            Object.hasOwn(changes, attr.trait_type) ? { ...attr, value: changes[attr.trait_type] } : attr
        ))
    };
}

/**
 * Sortea las opciones de un roll. Cada opcion es { changes }, con solo las
 * categorias que cambian.
 *
 * hasArt(category, value) filtra los traits que no se pueden dibujar.
 */
function generateOptions({ current, keep, rarity, hasArt, randomInt }) {
    const rolled = ROLLABLE_CATEGORIES.filter(category => !keep.includes(category));
    const options = [];
    const seen = new Set();

    // Con 3 categorias sorteadas y al menos 7 valores cada una, que dos
    // opciones salgan identicas es rarisimo; el tope es solo para no quedar
    // en un loop si la coleccion algun dia tuviera muy pocos traits.
    for (let attempt = 0; options.length < OPTIONS_PER_ROLL && attempt < 50; attempt++) {
        const changes = {};
        for (const category of rolled) {
            const value = rarity.pick(category, {
                exclude: [current[category]],
                allow: v => hasArt(category, v),
                randomInt
            });
            if (value === null) {
                throw Object.assign(new Error(`No hay traits para sortear en ${category}.`), { status: 500 });
            }
            changes[category] = value;
        }

        const key = JSON.stringify(changes);
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ changes });
    }

    if (options.length < OPTIONS_PER_ROLL) {
        throw Object.assign(new Error('No se pudieron generar dos opciones distintas.'), { status: 500 });
    }
    return options;
}

module.exports = {
    ROLLABLE_CATEGORIES,
    MAX_KEEP,
    OPTIONS_PER_ROLL,
    validateKeep,
    traitsFromMetadata,
    applyTraits,
    generateOptions
};
