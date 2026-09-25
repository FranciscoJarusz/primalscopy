// controllers/labController.js
//
// El LAB: rolls pagos que cambian los traits de un NFT.
//
// El ciclo es: se paga un roll, salen 2 opciones, y el dueño elige una o
// cancela. Si elige, esos traits pasan a ser los del NFT: cambian en la
// metadata (y con eso en OpenSea y en la rareza) y el customizer empieza a
// ofrecer las variantes de los traits nuevos, porque las saca de ahi. Si
// cancela, el NFT queda como estaba y el roll no se devuelve.
//
// El cobro todavia no existe. Hasta entonces el LAB solo funciona con
// LAB_TEST_MODE=true: rolls gratis y nada se publica fuera de este server
// (ver markSandbox en lib/labStore.js).

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
const lab = require('../lib/labStore');
const { fingerprint } = require('../lib/traitFingerprint');
const { getRarity } = require('../lib/traitRarity');
const {
    ROLLABLE_CATEGORIES,
    MAX_KEEP,
    validateKeep,
    traitsFromMetadata,
    applyTraits,
    generateOptions
} = require('../lib/labRoll');

function isTestMode() {
    return process.env.LAB_TEST_MODE === 'true';
}

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

function sendError(res, error, where) {
    const status = error.status || 500;
    if (status === 500) console.error(`[ERROR] ${where} ->`, error);
    res.status(status).json({ error: error.message || 'Error en el LAB.' });
}

// Con que variante se dibuja cada categoria si el NFT pasara a tener
// `metadata`. Las categorias que cambian en el roll arrancan con la variante
// base de su trait nuevo (la que se llama igual que el trait, o la primera de
// su carpeta). Las que no cambian mantienen lo que el dueño ya tenia elegido
// en el customizer, incluidos los adornos de _GLOBAL como el cuervo.
async function layersFor(nftId, metadata, changes) {
    const options = await buildCustomizationOptions(nftId, metadata);
    const saved = assets.readSelection(nftId)?.applied || {};
    const layers = {};

    for (const category of LAYER_ORDER) {
        const option = options[category];
        if (!option) continue;

        let variant = null;
        if (Object.hasOwn(changes, category)) {
            const own = option.variants.filter(v => !v.isGlobal);
            variant = own.find(v => normalizeKey(v.name) === normalizeKey(changes[category])) || own[0];
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

// GET /api/lab/:nftId — si el NFT puede usar el LAB y si tiene un roll
// pendiente. Publico: no dice nada que no este en la metadata.
async function getLabStatus(req, res) {
    try {
        const { nftId } = req.params;
        const rarity = getRarity();

        const base = {
            tokenId: nftId,
            rollableCategories: ROLLABLE_CATEGORIES,
            maxKeep: MAX_KEEP,
            testMode: isTestMode(),
            // El cobro todavia no existe: sin modo de prueba no se puede rollear.
            available: isTestMode()
        };

        if (rarity.isOneOfOne(nftId)) {
            return res.json({ ...base, eligible: false, reason: 'one-of-one' });
        }

        const metadata = await loadOrSeedMetadata(nftId);
        const traits = traitsFromMetadata(metadata);
        const probabilities = Object.fromEntries(ROLLABLE_CATEGORIES.map(category => [
            category,
            rarity.probabilities(category, {
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
            pending: publicRoll(lab.readPending(nftId))
        });
    } catch (error) {
        sendError(res, error, 'getLabStatus');
    }
}

// POST /api/lab/:nftId/roll  { keep: ['Hat', ...] }
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
            throw httpError(422, 'Esta pieza es unica (1/1) y no se puede modificar en el LAB.');
        }

        // Un roll pendiente se resuelve antes de pagar otro. Se devuelve el
        // mismo, para que recargar la pagina nunca regale opciones nuevas.
        const pending = lab.readPending(nftId);
        if (pending) {
            return res.status(409).json({
                error: 'Este NFT ya tiene un roll sin resolver: elegi una opcion o cancelalo.',
                pending: publicRoll(pending)
            });
        }

        if (!isTestMode()) {
            throw httpError(503, 'El cobro del LAB todavia no esta habilitado.');
        }

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
            options.push({ changes, layers: await layersFor(nftId, applyTraits(metadata, changes), changes) });
        }

        const newRoll = {
            rollId: crypto.randomUUID(),
            tokenId: nftId,
            wallet: req.walletAddress,
            keep,
            before: current,
            options,
            payment: { mode: 'test' },
            createdAt: new Date().toISOString()
        };

        lab.writePending(nftId, newRoll);
        lab.appendHistory({ event: 'roll', ...newRoll });

        res.status(201).json(publicRoll(newRoll));
    } catch (error) {
        sendError(res, error, 'roll');
    } finally {
        soltarTurno(nftId);
    }
}

// El roll pendiente, si el rollId que manda el cliente es el suyo. Pedir el
// rollId evita que un click viejo (otra pestaña, un doble click) resuelva un
// roll distinto del que la persona estaba mirando.
function requirePending(nftId, rollId) {
    const pending = lab.readPending(nftId);
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

// POST /api/lab/:nftId/choose  { rollId, option: 0 | 1 }
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
            lab.markSandbox(nftId, {
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

        lab.clearPending(nftId);
        lab.appendHistory({
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

// POST /api/lab/:nftId/cancel  { rollId }
async function cancel(req, res) {
    const { nftId } = req.params;
    try {
        tomarTurno(nftId);
    } catch (error) {
        return sendError(res, error, 'cancel');
    }

    try {
        const pending = requirePending(nftId, req.body?.rollId);
        lab.clearPending(nftId);
        lab.appendHistory({ event: 'cancel', rollId: pending.rollId, tokenId: nftId, wallet: req.walletAddress });
        res.json({ tokenId: nftId, cancelled: pending.rollId });
    } catch (error) {
        sendError(res, error, 'cancel');
    } finally {
        soltarTurno(nftId);
    }
}

module.exports = { getLabStatus, roll, choose, cancel };
