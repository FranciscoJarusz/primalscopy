// scripts/snapshot-rarity.js
//
// Saca una foto de la rareza ORIGINAL de la coleccion: cuantos NFTs tienen
// cada valor de trait. De ahi salen las probabilidades de los rolls del Forge
// (el dueño lo decidio asi: un trait raro sale poco).
//
// Es una foto y no se recalcula a proposito. Cuando el Forge empiece a cambiar
// traits, la rareza "en vivo" se mueve con lo que la gente elige: si se
// recalculara, los traits mas elegidos serian cada vez mas faciles de sacar y
// la rareza se deformaria sola. NO volver a correr esto despues de que el Forge
// este en produccion: la foto dejaria de ser la de la coleccion original.
//
// Uso:
//   node scripts/snapshot-rarity.js              (baja la metadata del origen)
//   node scripts/snapshot-rarity.js <carpeta>    (lee <id>.json de una carpeta)
//
// Solo lee. Escribe data/trait-rarity.json.

const fs = require('fs');
const path = require('path');

const ORIGIN = (process.env.ORIGIN_METADATA_URL || 'https://ipfs.primalcult.xyz/metadata/').trim();
const TOTAL_TOKENS = 2712;
const OUT = path.join(__dirname, '..', 'data', 'trait-rarity.json');

async function fetchMetadata(id) {
    for (let intento = 1; ; intento++) {
        try {
            const res = await fetch(`${ORIGIN}${id}`, { signal: AbortSignal.timeout(15000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (error) {
            if (intento === 3) throw new Error(`Token ${id}: ${error.message}`);
        }
    }
}

async function loadAll(folder) {
    const all = new Map();
    if (folder) {
        for (let id = 1; id <= TOTAL_TOKENS; id++) {
            all.set(id, JSON.parse(fs.readFileSync(path.join(folder, `${id}.json`), 'utf8')));
        }
        return all;
    }

    // De a 8 pedidos: el origen es un server compartido y no es nuestro.
    let next = 1;
    const worker = async () => {
        while (next <= TOTAL_TOKENS) {
            const id = next++;
            all.set(id, await fetchMetadata(id));
        }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    return all;
}

async function main() {
    const all = await loadAll(process.argv[2]);

    const categories = {};
    const oneOfOnes = [];

    for (const [id, metadata] of [...all].sort((a, b) => a[0] - b[0])) {
        const attributes = Array.isArray(metadata.attributes) ? metadata.attributes : [];
        // Las piezas unicas no tienen traits por capas: un solo atributo
        // "1/1". No entran en la rareza ni en el Forge.
        if (attributes.some(a => a?.trait_type === '1/1')) {
            oneOfOnes.push(id);
            continue;
        }
        for (const { trait_type: category, value } of attributes) {
            if (!category) continue;
            categories[category] ??= {};
            categories[category][value] = (categories[category][value] || 0) + 1;
        }
    }

    // Ordenado de mas comun a mas raro, para que el archivo se lea solo.
    for (const category of Object.keys(categories)) {
        categories[category] = Object.fromEntries(
            Object.entries(categories[category]).sort((a, b) => b[1] - a[1])
        );
    }

    const snapshot = {
        description: 'Rareza original de la coleccion. No regenerar despues de que el Forge este en produccion.',
        generatedAt: new Date().toISOString(),
        totalTokens: TOTAL_TOKENS,
        oneOfOnes,
        categories
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Listo: ${all.size - oneOfOnes.length} NFTs con traits, ${oneOfOnes.length} piezas unicas -> ${OUT}`);
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
