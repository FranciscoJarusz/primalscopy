// routes/adminRoutes.js

const express = require('express');
const multer = require('multer');
const path = require('path');

const { adminAuth } = require('../middleware/adminAuth');
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

router.get('/traits', listTraits);
router.post('/traits', upload.single('file'), uploadTrait);
router.patch('/traits', renameTrait);
router.delete('/traits', deleteTrait);

router.use(adminErrorHandler);

module.exports = router;
