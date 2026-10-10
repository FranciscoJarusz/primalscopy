// controllers/customizationController.js
//
// Guarda la customizacion de un NFT: compone el GIF final, lo escribe y
// actualiza la metadata que leen las wallets y los marketplaces.
//
// Cuando se llega aca, requireWallet y requireTokenOwner ya probaron que quien
// pide es dueño del token EN ESTE MOMENTO. Lo que falta validar es el
// contenido: que las variantes elegidas sean de las que este token puede usar.

const { buildCustomizationOptions, resolveLayerPath } = require('./nftController');
const { composeGif } = require('../lib/gifComposer');
const assets = require('../lib/assetStore');
const { currentMetadata } = require('../lib/metadataSync');
const remote = require('../lib/remotePublisher');
const { fingerprint, findVariantByFingerprint } = require('../lib/traitFingerprint');
const marketplaces = require('../lib/marketplaceRefresh');
const feed = require('../lib/feedStore');
const forge = require('../lib/forgeStore');
const sharp = require('sharp');
const fs = require('fs');

// De atras hacia adelante. Es el mismo orden que usa el front; si difirieran,
// el NFT guardado no se pareceria al preview.
const LAYER_ORDER = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];

// Componer un GIF de 2000x2000 tarda entre 4 y 10 segundos y usa bastante
// memoria. Sin un limite, unos pocos pedidos simultaneos tumban el servicio.
const enProceso = new Set();
const MAX_SIMULTANEOS = 2;

// Lado de la miniatura que va al feed. La grilla las muestra a menos de 300px
// en pantalla; 512 alcanza para que se vean nitidas tambien en retina y deja
// cada archivo en unos 40 KB, contra los varios MB que pesa el GIF.
const FEED_THUMB_SIZE = 512;

/**
 * Valida lo que manda el cliente contra lo que este token puede usar.
 *
 * Es la defensa central del endpoint. Sin esto, alguien podria mandar la ruta
 * de un trait de otro valor y cambiar de hecho la rareza de su NFT, o una ruta
 * arbitraria del disco. Nunca se usa la ruta del cliente para tocar el
 * filesystem: se busca la variante en la lista permitida y se usa la ruta de
 * ESA.
 */
function resolveSelections(options, selections) {
    if (!selections || typeof selections !== 'object') {
        throw Object.assign(new Error('Falta "selections".'), { status: 400 });
    }

    const layers = [];
    const applied = {};

    for (const category of LAYER_ORDER) {
        const option = options[category];
        if (!option) continue; // esta coleccion no usa esa categoria

        const chosen = selections[category];
        if (!chosen) {
            throw Object.assign(
                new Error(`Falta elegir una variante para ${category}.`),
                { status: 400 }
            );
        }

        const variant = option.variants.find(v => v.imageUrl === chosen);
        if (!variant) {
            throw Object.assign(
                new Error(`La variante elegida para ${category} no esta disponible para este NFT.`),
                { status: 400 }
            );
        }

        const filePath = resolveLayerPath(variant.imageUrl);
        if (!filePath || !fs.existsSync(filePath)) {
            throw Object.assign(
                new Error(`El archivo del trait ${variant.name} no esta en el servidor.`),
                { status: 409 }
            );
        }

        layers.push(filePath);
        // La huella del archivo se guarda junto a la ruta: si mañana el trait
        // se renombra o se mueve de carpeta desde /admin, se lo puede volver a
        // encontrar por contenido.
        applied[category] = {
            name: variant.name,
            imageUrl: variant.imageUrl,
            sha256: fingerprint(filePath)
        };
    }

    if (layers.length === 0) {
        throw Object.assign(new Error('No hay capas para componer.'), { status: 400 });
    }

    return { layers, applied };
}

// La metadata vigente, que es la que se va a reescribir. Tiene que salir del
// hosting y no de la copia del volumen: si el dueño cambio el NFT por afuera,
// guardar con la copia vieja desharia su cambio. Ver lib/metadataSync.js.
async function loadOrSeedMetadata(tokenId) {
    return currentMetadata(tokenId);
}

// Un NFT se escribe de a uno por vez, lo pida el customizer o el Forge: si dos
// escrituras se pisaran, la metadata podria quedar con los traits de una y la
// imagen de la otra. Tira con el status listo para responder.
function tomarTurno(nftId) {
    if (enProceso.has(nftId)) {
        throw Object.assign(new Error('Ya se esta guardando un cambio de este NFT.'), { status: 409 });
    }
    if (enProceso.size >= MAX_SIMULTANEOS) {
        throw Object.assign(
            new Error('El servidor esta generando otras imagenes. Reintenta en unos segundos.'),
            { status: 503 }
        );
    }
    enProceso.add(nftId);
}

function soltarTurno(nftId) {
    enProceso.delete(nftId);
}

/**
 * Compone el GIF, lo publica y deja todo escrito. Lo usan el customizer y el
 * Forge; el llamador tiene que tener el turno del NFT.
 *
 * `metadata` es la metadata completa que va a quedar publicada, salvo
 * "image", que se arma aca. El customizer la pasa con los attributes intactos
 * (las variantes son diseños del MISMO valor de trait); el Forge, con los
 * traits que salieron en el roll.
 *
 * Con remoto=false no se toca el hosting de la coleccion ni se avisa a
 * OpenSea: todo queda solo en el volumen. Es lo que usa el modo de prueba del
 * Forge, para poder probarlo en local aunque el .env tenga las credenciales de
 * produccion.
 */
async function publicarNft(nftId, { layers, applied, metadata, wallet, remoto = true }) {
    const publicado = remoto && remote.isConfigured();
    if (publicado && forge.isSandbox(nftId)) {
        throw Object.assign(new Error(
            `El NFT #${nftId} tiene cambios de prueba del Forge en este server y no se puede publicar. `
            + 'Restauralo con: node scripts/forge-reset-sandbox.js'
        ), { status: 409 });
    }

    // El primer frame se aprovecha de la pasada que ya hace composeGif, en
    // vez de decodificar y componer las siete capas una segunda vez.
    let primerFrame = null;
    const gif = composeGif(layers, {
        onFirstFrame: (rgba, size) => { primerFrame = { rgba, size }; }
    });

    const version = Date.now();
    const updated = { ...metadata, image: assets.publicImageUrl(nftId, version) };

    // Primero el hosting donde vive la coleccion: es lo que leen las
    // wallets y los marketplaces, o sea la fuente de verdad. Si esto falla,
    // no se toca la copia local, para que no queden diciendo cosas
    // distintas.
    if (publicado) {
        try {
            await remote.publishNft(nftId, { gif, metadata: updated });
        } catch (error) {
            throw Object.assign(
                new Error(`No se pudo publicar en el hosting de la coleccion: ${error.message}`),
                { status: 502 }
            );
        }
    }

    // Copia espejo en el volumen. Sirve de respaldo y deja todo listo por
    // si mas adelante se decide mudar el dominio aca. Va despues del
    // publish y nunca antes.
    assets.writeImage(nftId, gif);
    assets.writeMetadata(nftId, updated);

    assets.writeSelection(nftId, {
        tokenId: nftId,
        wallet,
        applied,
        updatedAt: new Date().toISOString()
    });

    // Recien aca entra al feed: una customizacion aparece en "Recent
    // Customizations" solo si llego a escribirse de verdad. Si algo de
    // arriba fallo, nunca se llega a esta linea.
    await registrarEnFeed(nftId, wallet, primerFrame);

    // Se le avisa a los marketplaces recien ahora, con todo ya escrito. Si
    // no contestan no pasa nada: el NFT ya esta guardado y la miniatura se
    // va a actualizar mas tarde por su cuenta.
    const refresh = remoto
        ? await marketplaces.refreshToken(nftId)
        : { requested: false, reason: 'modo de prueba: no se publica' };

    return { updated, sizeBytes: gif.length, published: publicado, refresh };
}

// POST /api/nft/:nftId/customization
async function saveCustomization(req, res) {
    const { nftId } = req.params;

    try {
        tomarTurno(nftId);
    } catch (error) {
        return res.status(error.status).json({ error: error.message });
    }

    try {
        const options = await buildCustomizationOptions(nftId);
        const { layers, applied } = resolveSelections(options, req.body?.selections);

        // Los attributes quedan intactos a proposito: las variantes son
        // diseños alternativos del MISMO valor de trait, asi que la rareza de
        // la coleccion no se toca. Los traits solo los cambia el Forge.
        const metadata = await loadOrSeedMetadata(nftId);

        const result = await publicarNft(nftId, { layers, applied, metadata, wallet: req.walletAddress });

        res.json({
            tokenId: nftId,
            image: result.updated.image,
            applied,
            sizeBytes: result.sizeBytes,
            published: result.published,
            marketplaceRefresh: result.refresh
        });
    } catch (error) {
        const status = error.status || 500;
        if (status === 500) console.error('[ERROR] saveCustomization ->', error);
        res.status(status).json({ error: error.message || 'No se pudo guardar la customizacion.' });
    } finally {
        soltarTurno(nftId);
    }
}

// Guarda la entrada del feed: el JPEG del primer frame mas quien y cuando.
//
// Todo lo que pasa aca es accesorio. La customizacion ya esta publicada y
// escrita; si la miniatura falla se registra en el log y el usuario igual
// recibe su 200, porque su NFT quedo bien guardado.
async function registrarEnFeed(tokenId, wallet, primerFrame) {
    if (!primerFrame) return null;
    try {
        const jpeg = await sharp(primerFrame.rgba, {
            raw: { width: primerFrame.size, height: primerFrame.size, channels: 4 }
        })
            // Algun trait puede tener zonas transparentes; sin aplanar, el JPEG
            // (que no tiene alpha) las pintaria de blanco sobre un fondo oscuro.
            .flatten({ background: '#000000' })
            .resize(FEED_THUMB_SIZE, FEED_THUMB_SIZE, { fit: 'cover' })
            .jpeg({ quality: 82, mozjpeg: true })
            .toBuffer();

        return await feed.record({ tokenId, wallet, jpeg });
    } catch (error) {
        console.error('[feed] No se pudo registrar la customizacion ->', error.message);
        return null;
    }
}

// GET /api/nft/:nftId/customization — que hay puesto hoy este token.
//
// Si una ruta guardada ya no existe porque el trait se renombro o se movio, se
// lo busca por huella entre las variantes que se ofrecen ahora. Sin esto, el
// customizer mostraria el trait original en lugar del que el NFT tiene puesto
// de verdad, que es justo lo que confundia.
async function getCustomization(req, res) {
    try {
        await respondWithCustomization(req, res);
    } catch (error) {
        // Express 4 no atrapa los rechazos de un handler async: sin esto, un
        // fallo aca dejaria la request colgada hasta el timeout del cliente.
        console.error('[ERROR] getCustomization ->', error);
        res.status(500).json({ error: 'No se pudo leer la customizacion.' });
    }
}

async function respondWithCustomization(req, res) {
    const { nftId } = req.params;
    // Primero la metadata: si el NFT cambio por afuera, esto da por vencida
    // la seleccion antes de leerla.
    let metadata = null;
    try {
        metadata = await currentMetadata(nftId);
    } catch {
        metadata = assets.readMetadata(nftId);
    }
    const selection = assets.readSelection(nftId);

    if (!selection?.applied) {
        return res.json({
            tokenId: nftId,
            saved: Boolean(selection),
            applied: null,
            updatedAt: selection?.updatedAt || null,
            // Cuando el NFT cambio fuera del customizer. El front lo usa para
            // olvidar lo que tenia guardado en el navegador de antes.
            supersededAt: selection?.superseded?.at || null,
            image: metadata?.image || null
        });
    }

    const applied = {};
    const relocated = [];
    let options = null;

    for (const [category, entry] of Object.entries(selection.applied)) {
        const filePath = resolveLayerPath(entry.imageUrl);
        if (filePath && fs.existsSync(filePath)) {
            applied[category] = entry;
            continue;
        }

        // La ruta murio. Buscar el mismo archivo entre lo que hay ahora.
        if (!options) {
            try {
                options = await buildCustomizationOptions(nftId);
            } catch {
                options = {};
            }
        }
        const match = findVariantByFingerprint(options[category]?.variants, entry.sha256, resolveLayerPath);
        if (match) {
            applied[category] = { name: match.name, imageUrl: match.imageUrl, sha256: entry.sha256 };
            relocated.push({ category, from: entry.name, to: match.name });
        } else {
            // No esta en ningun lado: se informa igual para que el front pueda
            // avisar en vez de mostrar otra cosa en silencio.
            applied[category] = { ...entry, missing: true };
        }
    }

    res.json({
        tokenId: nftId,
        saved: true,
        applied,
        relocated,
        updatedAt: selection.updatedAt || null,
        image: metadata?.image || null
    });
}

module.exports = {
    saveCustomization,
    getCustomization,
    LAYER_ORDER,
    // Los usa el Forge para escribir el NFT por el mismo camino.
    tomarTurno,
    soltarTurno,
    publicarNft,
    loadOrSeedMetadata
};
