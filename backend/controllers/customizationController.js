// controllers/customizationController.js
//
// Guarda la customizacion de un NFT: compone el GIF final, lo escribe y
// actualiza la metadata que leen las wallets y los marketplaces.
//
// Cuando se llega aca, requireWallet y requireTokenOwner ya probaron que quien
// pide es dueño del token EN ESTE MOMENTO. Lo que falta validar es el
// contenido: que las variantes elegidas sean de las que este token puede usar.

const axios = require('axios');
const { buildCustomizationOptions, resolveLayerPath } = require('./nftController');
const { composeGif } = require('../lib/gifComposer');
const assets = require('../lib/assetStore');
const remote = require('../lib/remotePublisher');
const fs = require('fs');

// De atras hacia adelante. Es el mismo orden que usa el front; si difirieran,
// el NFT guardado no se pareceria al preview.
const LAYER_ORDER = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];

const ORIGIN_METADATA_URL = (process.env.ORIGIN_METADATA_URL || 'https://ipfs.primalcult.xyz/metadata/').trim();

// Componer un GIF de 2000x2000 tarda entre 4 y 10 segundos y usa bastante
// memoria. Sin un limite, unos pocos pedidos simultaneos tumban el servicio.
const enProceso = new Set();
const MAX_SIMULTANEOS = 2;

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
        applied[category] = { name: variant.name, imageUrl: variant.imageUrl };
    }

    if (layers.length === 0) {
        throw Object.assign(new Error('No hay capas para componer.'), { status: 400 });
    }

    return { layers, applied };
}

// La metadata original vive en el servidor viejo hasta que se migre todo. Si
// todavia no esta en el volumen, se trae una vez y se guarda.
//
// Esto NO reemplaza la migracion completa: cuando el dominio apunte aca,
// tienen que estar los 2712 archivos, no solo los de los tokens que alguien
// customizo.
async function loadOrSeedMetadata(tokenId) {
    const local = assets.readMetadata(tokenId);
    if (local) return local;

    const { data } = await axios.get(`${ORIGIN_METADATA_URL}${tokenId}`, { timeout: 15000 });
    if (!data || typeof data !== 'object') {
        throw Object.assign(new Error('La metadata original no es un JSON valido.'), { status: 502 });
    }
    assets.writeMetadata(tokenId, data);
    return data;
}

// POST /api/nft/:nftId/customization
async function saveCustomization(req, res) {
    const { nftId } = req.params;

    if (enProceso.has(nftId)) {
        return res.status(409).json({ error: 'Ya se esta guardando una customizacion de este NFT.' });
    }
    if (enProceso.size >= MAX_SIMULTANEOS) {
        return res.status(503).json({ error: 'El servidor esta generando otras imagenes. Reintenta en unos segundos.' });
    }
    enProceso.add(nftId);

    try {
        const options = await buildCustomizationOptions(nftId);
        const { layers, applied } = resolveSelections(options, req.body?.selections);

        const metadata = await loadOrSeedMetadata(nftId);
        const gif = composeGif(layers);

        const version = Date.now();

        // Solo cambia "image". Los attributes quedan intactos a proposito: las
        // variantes son diseños alternativos del MISMO valor de trait, asi que
        // la rareza de la coleccion no se toca.
        const updated = { ...metadata, image: assets.publicImageUrl(nftId, version) };

        // Primero el hosting donde vive la coleccion: es lo que leen las
        // wallets y los marketplaces, o sea la fuente de verdad. Si esto falla,
        // no se toca la copia local, para que no queden diciendo cosas
        // distintas.
        if (remote.isConfigured()) {
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
            wallet: req.walletAddress,
            applied,
            updatedAt: new Date().toISOString()
        });

        res.json({
            tokenId: nftId,
            image: updated.image,
            applied,
            sizeBytes: gif.length,
            published: remote.isConfigured()
        });
    } catch (error) {
        const status = error.status || 500;
        if (status === 500) console.error('[ERROR] saveCustomization ->', error);
        res.status(status).json({ error: error.message || 'No se pudo guardar la customizacion.' });
    } finally {
        enProceso.delete(nftId);
    }
}

// GET /api/nft/:nftId/customization — que hay guardado hoy para este token.
function getCustomization(req, res) {
    const { nftId } = req.params;
    const selection = assets.readSelection(nftId);
    const metadata = assets.readMetadata(nftId);
    res.json({
        tokenId: nftId,
        saved: Boolean(selection),
        applied: selection?.applied || null,
        updatedAt: selection?.updatedAt || null,
        image: metadata?.image || null
    });
}

module.exports = { saveCustomization, getCustomization, LAYER_ORDER };
