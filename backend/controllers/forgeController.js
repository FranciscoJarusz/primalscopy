// controllers/forgeController.js
//
// El Forge: rolls pagos que cambian los traits de un NFT.
//
// El ciclo es: se paga un roll, salen 2 opciones, y el dueño elige una o
// cancela. Si elige, esos traits pasan a ser los del NFT: cambian en la
// metadata (y con eso en OpenSea y en la rareza) y el customizer empieza a
// ofrecer las variantes de los traits nuevos, porque las saca de ahi. Si
// cancela, el NFT queda como estaba y el roll no se devuelve.
//
// Cada roll se paga con APE en ApeChain (ver lib/forgePayments.js): el
// usuario transfiere al treasury, informa el hash en POST /payments, y eso le
// deja un roll pagado que consume el siguiente POST /:nftId/roll.
//
// FORGE_TEST_MODE=true es para probar en local: nada se publica fuera de este
// server (ver markSandbox en lib/forgeStore.js). Si ademas no hay cobro
// configurado, los rolls son gratis. Sin modo de prueba y sin cobro, el Forge
// esta cerrado.

const crypto = require('crypto');
const fs = require('fs');
const {
    buildCustomizationOptions,
    resolveLayerPath,
    normalizeKey,
    hasArtFor
} = require('./nftController');
const {
    LAYER_ORDER,
    tomarTurno,
    soltarTurno,
    publicarNft,
    loadOrSeedMetadata
} = require('./customizationController');
const assets = require('../lib/assetStore');
const forge = require('../lib/forgeStore');
const { fingerprint } = require('../lib/traitFingerprint');
const { getRarity } = require('../lib/traitRarity');
const { paymentConfig, publicPaymentInfo, verifyPayment } = require('../lib/forgePayments');
const { miniatura } = require('../lib/traitThumbs');
const {
    ROLLABLE_CATEGORIES,
    MAX_KEEP,
    validateKeep,
    traitsFromMetadata,
    applyTraits,
    generateOptions
} = require('../lib/forgeRoll');

function isTestMode() {
    return process.env.FORGE_TEST_MODE === 'true';
}

function httpError(status, message, code) {
    return Object.assign(new Error(message), { status, code });
}

// `code` le dice al front que hacer sin tener que leer el texto del error
// (por ejemplo, 'payment-required' abre el pago).
function sendError(res, error, where) {
    const status = error.status || 500;
    if (status === 500) console.error(`[ERROR] ${where} ->`, error);
    res.status(status).json({ error: error.message || 'Error en el Forge.', ...(error.code ? { code: error.code } : {}) });
}

// El Forge esta abierto si se cobra, o si es una prueba local.
function isAvailable(config) {
    return Boolean(config) || isTestMode();
}

// Con que variante se dibuja cada categoria si el NFT pasara a tener
// `metadata`. Las categorias que cambian en el roll salen con una variante al
// azar de la carpeta de su trait nuevo si se pasa `randomInt` (asi lo pidio el
// dueño: que cada roll traiga tambien la variante), o si no con la base (la
// que se llama igual que el trait, o la primera). Nunca una de _GLOBAL: esas
// son adornos que se eligen a mano. Las que no cambian mantienen lo que el
// dueño ya tenia elegido en el customizer, incluidos los adornos como el cuervo.
async function layersFor(nftId, metadata, changes, { randomInt } = {}) {
    const options = await buildCustomizationOptions(nftId, metadata);
    const saved = assets.readSelection(nftId)?.applied || {};
    const layers = {};

    for (const category of LAYER_ORDER) {
        const option = options[category];
        if (!option) continue;

        let variant = null;
        if (Object.hasOwn(changes, category)) {
            const own = option.variants.filter(v => !v.isGlobal);
            variant = randomInt && own.length
                ? own[randomInt(own.length)]
                : own.find(v => normalizeKey(v.name) === normalizeKey(changes[category])) || own[0];
        } else {
            variant = option.variants.find(v => v.imageUrl === saved[category]?.imageUrl)
                || option.variants.find(v => v.name === option.currentValue)
                || option.variants[0];
        }
        if (variant) layers[category] = { name: variant.name, imageUrl: variant.imageUrl };
    }
    return layers;
}

// El "?v=" con la fecha del archivo hace que el navegador pida la imagen
// nueva despues de cada eleccion en vez de mostrar la que tenia en cache.
function localImageUrl(nftId) {
    try {
        const { mtimeMs } = fs.statSync(assets.imagePath(nftId));
        return `/images/${nftId}.gif?v=${Math.round(mtimeMs)}`;
    } catch {
        return null;
    }
}

// Lo que ve el cliente de un roll pendiente. La wallet que pago queda solo en
// el historial.
function publicRoll(roll) {
    if (!roll) return null;
    return {
        rollId: roll.rollId,
        keep: roll.keep,
        before: roll.before,
        options: roll.options,
        createdAt: roll.createdAt
    };
}

// GET /api/forge/:nftId — si el NFT puede usar el Forge y si tiene un roll
// pendiente. Publico: no dice nada que no este en la metadata.
async function getForgeStatus(req, res) {
    try {
        const { nftId } = req.params;
        const rarity = getRarity();
        const config = paymentConfig();

        const base = {
            tokenId: nftId,
            rollableCategories: ROLLABLE_CATEGORIES,
            maxKeep: MAX_KEEP,
            testMode: isTestMode(),
            available: isAvailable(config),
            payment: publicPaymentInfo(config)
        };

        if (rarity.isOneOfOne(nftId)) {
            return res.json({ ...base, eligible: false, reason: 'one-of-one' });
        }

        const metadata = await loadOrSeedMetadata(nftId);
        const traits = traitsFromMetadata(metadata);
        // Las odds de un roll (los raros salen menos que su rareza en la
        // coleccion, ver ROLL_ODDS en lib/traitRarity.js), sin el valor actual.
        const probabilities = Object.fromEntries(ROLLABLE_CATEGORIES.map(category => [
            category,
            rarity.rollOdds(category, {
                exclude: [traits[category]],
                allow: v => hasArtFor(category.toUpperCase(), v)
            })
        ]));

        res.set('Cache-Control', 'no-cache');
        res.json({
            ...base,
            eligible: true,
            traits,
            image: metadata.image || null,
            // La copia de este server, relativa al backend. En modo de prueba
            // es la unica que tiene los traits nuevos: la publica no se toca.
            localImage: localImageUrl(nftId),
            probabilities,
            // Que parte de la coleccion tiene cada trait, sin filtrar nada:
            // es la rareza que se ve en los nombres y junto al Preview.
            collectionShare: Object.fromEntries(rarity.categories.map(category => [
                category,
                rarity.probabilities(category)
            ])),
            pending: publicRoll(forge.readPending(nftId))
        });
    } catch (error) {
        sendError(res, error, 'getForgeStatus');
    }
}

// POST /api/forge/:nftId/roll  { keep: ['Hat', ...] }
async function roll(req, res) {
    const { nftId } = req.params;
    try {
        tomarTurno(nftId);
    } catch (error) {
        return sendError(res, error, 'roll');
    }

    try {
        const keep = validateKeep(req.body?.keep);
        const rarity = getRarity();

        if (rarity.isOneOfOne(nftId)) {
            throw httpError(422, 'Esta pieza es unica (1/1) y no se puede modificar en el Forge.');
        }

        // Un roll pendiente se resuelve antes de pagar otro. Se devuelve el
        // mismo, para que recargar la pagina nunca regale opciones nuevas.
        const pending = forge.readPending(nftId);
        if (pending) {
            return res.status(409).json({
                error: 'Este NFT ya tiene un roll sin resolver: elegi una opcion o cancelalo.',
                pending: publicRoll(pending)
            });
        }

        const config = paymentConfig();
        if (!isAvailable(config)) {
            throw httpError(503, 'El Forge todavia no esta abierto.', 'closed');
        }

        // El pago se toma antes de cualquier await: si la misma wallet rollea
        // dos NFTs a la vez, el segundo no encuentra el mismo pago. Si algo
        // falla despues, se devuelve.
        const rollId = crypto.randomUUID();
        let payment = null;
        if (config) {
            payment = forge.takePayment(req.walletAddress, config.chainId, rollId, nftId);
            if (!payment) throw httpError(402, 'Primero hay que pagar el roll.', 'payment-required');
        }

        try {
            const metadata = await loadOrSeedMetadata(nftId);
            const current = traitsFromMetadata(metadata);
            const drawn = generateOptions({
                current,
                keep,
                rarity,
                hasArt: (category, value) => hasArtFor(category.toUpperCase(), value)
            });

            // Las capas se calculan y se guardan ahora: lo que se muestra en la
            // vista previa es exactamente lo que se aplica al elegir.
            const options = [];
            for (const { changes } of drawn) {
                options.push({
                    changes,
                    layers: await layersFor(nftId, applyTraits(metadata, changes), changes, {
                        randomInt: crypto.randomInt
                    })
                });
            }

            const newRoll = {
                rollId,
                tokenId: nftId,
                wallet: req.walletAddress,
                keep,
                before: current,
                options,
                payment: payment
                    ? { mode: 'ape', txHash: payment.txHash, valueWei: payment.valueWei }
                    : { mode: 'test' },
                createdAt: new Date().toISOString()
            };

            forge.writePending(nftId, newRoll);
            forge.appendHistory({ event: 'roll', ...newRoll });
            precalentarMiniaturas(options);

            res.status(201).json(publicRoll(newRoll));
        } catch (error) {
            if (payment) forge.returnPayment(payment.txHash);
            throw error;
        }
    } catch (error) {
        sendError(res, error, 'roll');
    } finally {
        soltarTurno(nftId);
    }
}

// Las opciones se muestran con las miniaturas de sus capas, y las variantes
// salen al azar: casi seguro nadie pidio todavia esas miniaturas. Se empiezan
// a generar ya, sin esperar, para que esten listas (o en camino) cuando el
// navegador las pida; si no, las capas aparecerian de a una.
function precalentarMiniaturas(options) {
    for (const { layers } of options) {
        for (const { imageUrl } of Object.values(layers)) {
            const relativa = String(imageUrl || '').replace(/^\/assets\/traits\//, '');
            if (relativa !== imageUrl) miniatura(relativa, 'grande').catch(() => {});
        }
    }
}

// El roll pendiente, si el rollId que manda el cliente es el suyo. Pedir el
// rollId evita que un click viejo (otra pestaña, un doble click) resuelva un
// roll distinto del que la persona estaba mirando.
function requirePending(nftId, rollId) {
    const pending = forge.readPending(nftId);
    if (!pending) throw httpError(404, 'Este NFT no tiene un roll pendiente.');
    if (!rollId || rollId !== pending.rollId) {
        throw httpError(409, 'Ese roll ya no es el pendiente. Recarga la pagina.');
    }
    return pending;
}

// Las capas guardadas en el roll, como rutas en disco. Si alguna ya no existe
// (un admin borro ese trait mientras tanto) se recalculan: mejor la variante
// base del mismo trait que fallar un roll pago.
async function resolveLayers(nftId, metadata, option) {
    let layers = option.layers;
    const missing = Object.values(layers).some(layer => {
        const filePath = resolveLayerPath(layer.imageUrl);
        return !filePath || !fs.existsSync(filePath);
    });
    if (missing) layers = await layersFor(nftId, metadata, option.changes);

    const paths = [];
    const applied = {};
    for (const category of LAYER_ORDER) {
        const layer = layers[category];
        if (!layer) continue;
        const filePath = resolveLayerPath(layer.imageUrl);
        if (!filePath || !fs.existsSync(filePath)) {
            throw httpError(409, `El arte de ${category} (${layer.name}) no esta en el servidor.`);
        }
        paths.push(filePath);
        applied[category] = { name: layer.name, imageUrl: layer.imageUrl, sha256: fingerprint(filePath) };
    }
    return { paths, applied };
}

// POST /api/forge/:nftId/choose  { rollId, option: 0 | 1 }
async function choose(req, res) {
    const { nftId } = req.params;
    try {
        tomarTurno(nftId);
    } catch (error) {
        return sendError(res, error, 'choose');
    }

    try {
        const pending = requirePending(nftId, req.body?.rollId);
        const index = req.body?.option;
        if (!Number.isInteger(index) || !pending.options[index]) {
            throw httpError(400, '"option" tiene que ser 0 o 1.');
        }
        const option = pending.options[index];

        const metadata = await loadOrSeedMetadata(nftId);
        const updatedMetadata = applyTraits(metadata, option.changes);
        const { paths, applied } = await resolveLayers(nftId, updatedMetadata, option);

        const testMode = isTestMode();
        if (testMode) {
            forge.markSandbox(nftId, {
                metadata: assets.metadataPath(nftId),
                image: assets.imagePath(nftId),
                selection: assets.selectionPath(nftId)
            });
        }

        const result = await publicarNft(nftId, {
            layers: paths,
            applied,
            metadata: updatedMetadata,
            wallet: req.walletAddress,
            remoto: !testMode
        });

        forge.clearPending(nftId);
        forge.appendHistory({
            event: 'choose',
            rollId: pending.rollId,
            tokenId: nftId,
            wallet: req.walletAddress,
            option: index,
            changes: option.changes,
            testMode
        });

        res.json({
            tokenId: nftId,
            traits: traitsFromMetadata(updatedMetadata),
            image: result.updated.image,
            applied,
            published: result.published,
            marketplaceRefresh: result.refresh
        });
    } catch (error) {
        sendError(res, error, 'choose');
    } finally {
        soltarTurno(nftId);
    }
}

// POST /api/forge/:nftId/cancel  { rollId }
async function cancel(req, res) {
    const { nftId } = req.params;
    try {
        tomarTurno(nftId);
    } catch (error) {
        return sendError(res, error, 'cancel');
    }

    try {
        const pending = requirePending(nftId, req.body?.rollId);
        forge.clearPending(nftId);
        forge.appendHistory({ event: 'cancel', rollId: pending.rollId, tokenId: nftId, wallet: req.walletAddress });
        res.json({ tokenId: nftId, cancelled: pending.rollId });
    } catch (error) {
        sendError(res, error, 'cancel');
    } finally {
        soltarTurno(nftId);
    }
}

// GET /api/forge/payments/me — cuantos rolls pagados sin usar tiene la wallet
// logueada, y los datos para pagar uno.
function myPayments(req, res) {
    try {
        const config = paymentConfig();
        res.set('Cache-Control', 'no-store');
        res.json({
            paidRolls: config ? forge.availablePayments(req.walletAddress, config.chainId).length : 0,
            payment: publicPaymentInfo(config)
        });
    } catch (error) {
        sendError(res, error, 'myPayments');
    }
}

// POST /api/forge/payments  { txHash }
// Registra una transferencia al treasury como roll pagado. Se puede llamar
// varias veces con el mismo hash (el front reintenta mientras se confirma, o
// al volver a entrar si se corto): la segunda vez no suma otro roll.
async function registerPayment(req, res) {
    try {
        const config = paymentConfig();
        if (!config) throw httpError(503, 'El cobro del Forge no esta configurado.', 'not-configured');

        const txHash = String(req.body?.txHash || '');
        const existing = forge.getPayment(txHash);
        if (existing) {
            if (existing.wallet.toLowerCase() !== req.walletAddress.toLowerCase()) {
                throw httpError(403, 'Ese pago lo hizo otra wallet.', 'wrong-sender');
            }
        } else {
            const payment = await verifyPayment(txHash, req.walletAddress, config);
            if (forge.addPayment(payment)) forge.appendHistory({ event: 'payment', ...payment });
        }

        res.status(existing ? 200 : 201).json({
            txHash: txHash.toLowerCase(),
            paidRolls: forge.availablePayments(req.walletAddress, config.chainId).length
        });
    } catch (error) {
        sendError(res, error, 'registerPayment');
    }
}

module.exports = { getForgeStatus, roll, choose, cancel, myPayments, registerPayment };
