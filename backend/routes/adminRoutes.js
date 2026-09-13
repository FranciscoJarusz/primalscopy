// routes/adminRoutes.js

const express = require('express');
const multer = require('multer');
const path = require('path');

const { adminAuth } = require('../middleware/adminAuth');
const { getStorageStatus } = require('../lib/traitsStore');
const { getAssetsStatus } = require('../lib/assetStore');
const { startSeeding, getSeedProgress, ORIGIN_URL, LAST_TOKEN } = require('../lib/assetSeeder');
const {
    listTraits,
    uploadTrait,
    renameTrait,
    deleteTrait,
    adminErrorHandler
} = require('../controllers/adminController');

const router = express.Router();

// Los GIFs de traits son de 2000x2000 y pesan bastante; 25 MB da margen.
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

// Todo lo que cuelga de acá requiere el token de admin.
router.use(adminAuth);

// Sirve para que el panel valide el token antes de mostrar la UI.
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
    res.status(202).json({ message: 'Migracion iniciada. Consultá GET /api/admin/assets para ver el avance.' });
});

router.get('/traits', listTraits);
router.post('/traits', upload.single('file'), uploadTrait);
router.patch('/traits', renameTrait);
router.delete('/traits', deleteTrait);

router.use(adminErrorHandler);

module.exports = router;
