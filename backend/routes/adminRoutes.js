const express = require('express');
const multer = require('multer');
const path = require('path');

const { adminAuth } = require('../middleware/adminAuth');
const { getStorageStatus } = require('../lib/traitsStore');
const { getAssetsStatus } = require('../lib/assetStore');
const { startSeeding, getSeedProgress, ORIGIN_URL, LAST_TOKEN } = require('../lib/assetSeeder');
const remote = require('../lib/remotePublisher');
const nicknames = require('../lib/nicknameStore');
const promo = require('../lib/promoStore');
const staking = require('../lib/stakingStore');
const { verifyStakes, refreshVaultNow } = require('../lib/stakingJob');
const wheels = require('../lib/stakingWheels');
const {
    listTraits,
    uploadTrait,
    renameTrait,
    deleteTrait,
    adminErrorHandler
} = require('../controllers/adminController');

const router = express.Router();

const ALLOWED_EXTENSIONS = ['.png', '.gif', '.bmp', '.webp'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            const error = new Error(
                `Extensión no permitida: ${extension || '(ninguna)'}. Solo ${ALLOWED_EXTENSIONS.join(', ')}.`
            );
            // Lo marca como error del cliente para que el handler no lo trate como 500.
            error.status = 400;
            return cb(error);
        }
        cb(null, true);
    }
});

// Los iconos de los premios del staking: se pasan a WebP de 256 px, asi que
// cualquier imagen comun sirve.
const ICON_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const uploadIcon = multer({
    storage: multer.memoryStorage(),
    // El mismo tope que los traits: el handler de errores avisa "25 MB".
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        if (!ICON_EXTENSIONS.includes(extension)) {
            const error = new Error(`Only ${ICON_EXTENSIONS.join(', ')} images.`);
            error.status = 400;
            return cb(error);
        }
        cb(null, true);
    }
});

// Todo lo que cuelga de acá requiere el token de admin.
router.use(adminAuth);

router.get('/session', (req, res) => res.json({ ok: true }));

// Diagnostico de almacenamiento: dice si TRAITS_PATH es un volumen de verdad y
// si el marcador sobrevivio a reinicios anteriores. Sin esto, que el volumen no
// persista solo se nota cuando el cliente pierde el trabajo.
router.get('/storage', (req, res) => {
    const status = getStorageStatus();
    res.json({
        ...status,
        healthy: status.isRealMountPoint,
        warning: status.isRealMountPoint
            ? null
            : 'TRAITS_PATH no es un volumen montado: todo lo que se suba se pierde al reiniciar.'
    });
});

// --- Migracion de la coleccion al volumen ----------------------------------
//
// Trae los 2712 archivos desde el servidor donde viven hoy. Hace falta ANTES
// de mudar el DNS: despues del switch este dominio resuelve a nosotros mismos
// y no habria de donde traerlos.

router.get('/assets', (req, res) => {
    const status = getAssetsStatus();
    const progress = getSeedProgress();
    res.json({
        ...status,
        originUrl: ORIGIN_URL,
        expected: LAST_TOKEN,
        // Listo para mudar el DNS solo cuando esten los 2712 de cada cosa.
        readyForDns: status.images >= LAST_TOKEN && status.metadata >= LAST_TOKEN,
        seeding: progress
    });
});

router.post('/assets/seed', (req, res) => {
    const result = startSeeding();
    if (!result.started) return res.status(409).json({ error: result.reason });
    res.status(202).json({ message: 'Migration started. Check GET /api/admin/assets for progress.' });
});

// Comprueba que el backend pueda escribir en el hosting de la coleccion, que
// es lo que hace falta para que una customizacion se vea en las wallets.
// Escribe un temporal con nombre propio y lo borra: no toca ningun NFT.
router.get('/publisher', async (req, res) => {
    res.json(await remote.verifyAccess());
});

router.get('/traits', listTraits);
router.post('/traits', upload.single('file'), uploadTrait);
router.patch('/traits', renameTrait);
router.delete('/traits', deleteTrait);

router.get('/nicknames', (req, res) => res.json(nicknames.listNicknames()));
router.delete('/nicknames/:address', (req, res) => {
    if (!nicknames.deleteNickname(req.params.address)) {
        return res.status(404).json({ error: 'That wallet has no nickname.' });
    }
    res.json({ ok: true });
});

// Codigos promocionales: crearlos, verlos con sus canjes, desactivarlos y
// archivarlos. No se borran, para que quede el registro de quien canjeo que.
router.get('/promo', (req, res) => res.json({ codes: promo.listCodes(), rewards: promo.rewardTypes() }));
router.post('/promo', (req, res) => {
    const result = promo.createCode(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result.code);
});
// { active } o { archived }.
router.patch('/promo/:code', (req, res) => {
    const body = req.body || {};
    const result = 'archived' in body
        ? promo.setArchived(req.params.code, body.archived)
        : promo.setActive(req.params.code, body.active);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result.code);
});

// Staking: la tasa, los periodos y el catalogo se cambian desde aca para
// probar sin deploys. Ver lib/stakingStore.js.
router.get('/staking', (req, res) => res.json(staking.adminSummary()));
router.patch('/staking/config', (req, res) => {
    const result = staking.updateConfig(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result.config);
});
// El icono de un premio: subirlo lo cambia al toque, sin esperar a guardar el
// resto del formulario. Borrarlo vuelve al que viene con el sitio.
router.post('/staking/icon/:id', uploadIcon.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Pick an image.' });
    const result = await staking.setCatalogIcon(req.params.id, req.file.buffer);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result.config);
});
router.delete('/staking/icon/:id', (req, res) => {
    const result = staking.clearCatalogIcon(req.params.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result.config);
});
router.get('/staking/wheels', (req, res) => res.json(wheels.adminWheels()));
router.put('/staking/wheels/:item', (req, res) => {
    const result = wheels.updateWheel(req.params.item, req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(wheels.adminWheels());
});
router.post('/staking/wheels/:item/prizes/:prize/image', uploadIcon.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Pick an image.' });
    const result = await wheels.setPrizeImage(req.params.item, req.params.prize, req.file.buffer);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(wheels.adminWheels());
});
router.patch('/staking/vault', async (req, res) => {
    const result = wheels.setVault(req.body?.address);
    if (result.error) return res.status(400).json({ error: result.error });
    try {
        await refreshVaultNow();
    } catch (error) {
        return res.status(503).json({ error: `Saved, but couldn't read the vault right now: ${error.message}` });
    }
    res.json(wheels.adminWheels());
});
router.post('/staking/vault/refresh', async (req, res) => {
    try {
        await refreshVaultNow();
        res.json(wheels.adminWheels());
    } catch (error) {
        res.status(503).json({ error: `Couldn't read the vault right now: ${error.message}` });
    }
});
router.patch('/staking/prizes/:id', (req, res) => {
    const result = wheels.setWinStatus(req.params.id, req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(wheels.adminWheels());
});
// Corre el chequeo de dueños y listados ya, sin esperar los 10 minutos.
router.post('/staking/verify', async (req, res) => {
    try {
        res.json(await verifyStakes());
    } catch (error) {
        res.status(503).json({ error: `Couldn't check right now: ${error.message}` });
    }
});

router.use(adminErrorHandler);

module.exports = router;
