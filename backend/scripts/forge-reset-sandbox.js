// scripts/forge-reset-sandbox.js
//
// Deshace lo que el modo de prueba del Forge escribio en este volumen: cada NFT
// marcado vuelve a su metadata, imagen y seleccion de antes de la primera
// prueba, y se le borra la marca. Tambien descarta su roll pendiente.
//
// Hasta correr esto, el backend se niega a publicar esos NFTs en produccion,
// para que los traits de prueba no se suban como si fueran reales.
//
// Uso (desde backend/, para que tome el TRAITS_PATH del .env):
//   node --env-file-if-exists=.env scripts/forge-reset-sandbox.js

const fs = require('fs');
const path = require('path');
const forge = require('../lib/forgeStore');

const tokens = forge.listSandbox();
if (tokens.length === 0) {
    console.log('No hay NFTs con cambios de prueba del Forge.');
    process.exit(0);
}

for (const tokenId of tokens) {
    const dir = forge.sandboxDir(tokenId);
    const restorePath = path.join(dir, 'restore.json');

    if (!fs.existsSync(restorePath)) {
        // La copia se corto a la mitad: no hay como saber que habia antes.
        console.warn(`#${tokenId}: la copia de respaldo esta incompleta, se deja la marca. Revisar a mano: ${dir}`);
        continue;
    }

    const { saved, files } = JSON.parse(fs.readFileSync(restorePath, 'utf8'));
    for (const [name, target] of Object.entries(files)) {
        if (saved[name]) {
            fs.copyFileSync(path.join(dir, name), target);
        } else {
            // Antes de la prueba no existia: se borra lo que escribio el Forge y
            // el NFT se vuelve a sembrar del origen la proxima vez.
            fs.rmSync(target, { force: true });
        }
    }

    forge.clearPending(tokenId);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`#${tokenId}: restaurado.`);
}
