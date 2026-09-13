// controllers/adminController.js
//
// CRUD de traits sobre el filesystem. Todo lo que se escribe cae dentro de
// TRAITS_PATH, que en producción es un volumen persistente de Railway.

const fs = require('fs');
const path = require('path');

const { TRAITS_PATH, GLOBAL_DIR, IMAGE_EXTENSION_REGEX } = require('../lib/traitsStore');
const { CATEGORY_CONFIG, getVariantDirectories } = require('./nftController');

// Nombres seguros: sin separadores de ruta, sin "..", sin caracteres raros.
const SAFE_NAME_REGEX = /^[A-Za-z0-9._-]+$/;

const VALID_CATEGORIES = CATEGORY_CONFIG.map(category => category.fsName);

class AdminError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function assertValidCategory(category) {
    if (!VALID_CATEGORIES.includes(category)) {
        throw new AdminError(400, `Categoría inválida: "${category}". Válidas: ${VALID_CATEGORIES.join(', ')}`);
    }
    return category;
}

function assertSafeSegment(value, label) {
    if (!value || typeof value !== 'string') {
        throw new AdminError(400, `Falta el parámetro "${label}".`);
    }
    if (value === '.' || value === '..' || !SAFE_NAME_REGEX.test(value)) {
        throw new AdminError(400, `"${label}" inválido: solo letras, números, punto, guion y guion bajo.`);
    }
    return value;
}

function assertImageFileName(fileName) {
    assertSafeSegment(fileName, 'file');
    if (!IMAGE_EXTENSION_REGEX.test(fileName)) {
        throw new AdminError(400, 'El archivo debe ser .png, .gif, .bmp o .webp.');
    }
    return fileName;
}

// Última línea de defensa: aunque la validación de arriba falle, nada puede
// terminar escribiendo fuera del directorio de traits.
function resolveInsideTraits(...segments) {
    const resolved = path.resolve(TRAITS_PATH, ...segments);
    const root = path.resolve(TRAITS_PATH);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new AdminError(400, 'Ruta fuera del directorio de traits.');
    }
    return resolved;
}

function readTraitFiles(category, directory) {
    const dirPath = resolveInsideTraits(category, directory);
    if (!fs.existsSync(dirPath)) return [];

    return fs.readdirSync(dirPath)
        .filter(file => IMAGE_EXTENSION_REGEX.test(file))
        .sort((a, b) => a.localeCompare(b))
        .map(file => {
            const stats = fs.statSync(path.join(dirPath, file));
            return {
                file,
                name: file.replace(IMAGE_EXTENSION_REGEX, ''),
                url: `/assets/traits/${category}/${directory}/${file}`,
                sizeBytes: stats.size,
                updatedAt: stats.mtime.toISOString()
            };
        });
}

// GET /api/admin/traits
// Árbol completo. El panel lo pide una vez y filtra en el cliente.
function listTraits(req, res, next) {
    try {
        const categories = VALID_CATEGORIES
            .filter(category => fs.existsSync(path.join(TRAITS_PATH, category)))
            .map(category => {
                const categoryDir = path.join(TRAITS_PATH, category);

                // _GLOBAL primero: es el caso que más se va a usar. Se lista
                // siempre, exista o no en disco, para que el panel pueda subir
                // ahí; la carpeta se crea sola en la primera subida.
                const directories = [{
                    name: GLOBAL_DIR,
                    isGlobal: true,
                    traits: readTraitFiles(category, GLOBAL_DIR)
                }];

                for (const directory of getVariantDirectories(categoryDir)) {
                    directories.push({
                        name: directory,
                        isGlobal: false,
                        traits: readTraitFiles(category, directory)
                    });
                }

                return { name: category, directories };
            });

        res.json({ globalDirName: GLOBAL_DIR, categories });
    } catch (error) {
        next(error);
    }
}

// POST /api/admin/traits  (multipart)
// campos: category, directory, name (opcional), overwrite (opcional)
function uploadTrait(req, res, next) {
    try {
        if (!req.file) {
            throw new AdminError(400, 'No llegó ningún archivo (campo "file").');
        }

        const category = assertValidCategory(req.body.category);
        const directory = req.body.directory === GLOBAL_DIR
            ? GLOBAL_DIR
            : assertSafeSegment(req.body.directory, 'directory');

        const extension = path.extname(req.file.originalname).toLowerCase();
        // El nombre visible del trait sale del campo "name" si viene, y si no
        // del nombre original del archivo.
        const baseName = (req.body.name || path.basename(req.file.originalname, extension)).trim();
        const fileName = assertImageFileName(`${baseName}${extension}`);

        const dirPath = resolveInsideTraits(category, directory);
        const filePath = resolveInsideTraits(category, directory, fileName);

        const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;
        if (fs.existsSync(filePath) && !overwrite) {
            throw new AdminError(409, `Ya existe "${fileName}" en ${category}/${directory}.`);
        }

        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(filePath, req.file.buffer);

        res.status(201).json({
            message: 'Trait subido.',
            trait: {
                file: fileName,
                name: fileName.replace(IMAGE_EXTENSION_REGEX, ''),
                url: `/assets/traits/${category}/${directory}/${fileName}`,
                sizeBytes: req.file.size
            }
        });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/admin/traits
// body: { category, directory, file, newName }
function renameTrait(req, res, next) {
    try {
        const category = assertValidCategory(req.body.category);
        const directory = assertSafeSegment(req.body.directory, 'directory');
        const file = assertImageFileName(req.body.file);

        const newBaseName = String(req.body.newName || '').trim();
        if (!newBaseName) throw new AdminError(400, 'Falta "newName".');

        const extension = path.extname(file);
        const newFile = assertImageFileName(`${newBaseName}${extension}`);

        const currentPath = resolveInsideTraits(category, directory, file);
        const nextPath = resolveInsideTraits(category, directory, newFile);

        if (!fs.existsSync(currentPath)) {
            throw new AdminError(404, `No existe ${category}/${directory}/${file}.`);
        }
        if (currentPath !== nextPath && fs.existsSync(nextPath)) {
            throw new AdminError(409, `Ya existe "${newFile}" en ${category}/${directory}.`);
        }

        fs.renameSync(currentPath, nextPath);

        res.json({
            message: 'Trait renombrado.',
            trait: {
                file: newFile,
                name: newFile.replace(IMAGE_EXTENSION_REGEX, ''),
                url: `/assets/traits/${category}/${directory}/${newFile}`
            }
        });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/admin/traits
// body: { category, directory, file, scope }
//
// scope "all" borra ese nombre de archivo en TODAS las carpetas de la categoría.
// Sirve para limpiar los traits que se duplicaron a mano en las 21 carpetas
// antes de que existiera _GLOBAL.
function deleteTrait(req, res, next) {
    try {
        const category = assertValidCategory(req.body.category);
        const file = assertImageFileName(req.body.file);
        const scope = req.body.scope === 'all' ? 'all' : 'one';

        if (scope === 'all') {
            const categoryDir = path.join(TRAITS_PATH, category);
            const allDirectories = [GLOBAL_DIR, ...getVariantDirectories(categoryDir)];
            const deleted = [];

            for (const directory of allDirectories) {
                const target = resolveInsideTraits(category, directory, file);
                if (fs.existsSync(target)) {
                    fs.unlinkSync(target);
                    deleted.push(`${directory}/${file}`);
                }
            }

            if (deleted.length === 0) {
                throw new AdminError(404, `No se encontró "${file}" en ninguna carpeta de ${category}.`);
            }

            return res.json({ message: `Borrado de ${deleted.length} carpeta(s).`, deleted });
        }

        const directory = assertSafeSegment(req.body.directory, 'directory');
        const target = resolveInsideTraits(category, directory, file);

        if (!fs.existsSync(target)) {
            throw new AdminError(404, `No existe ${category}/${directory}/${file}.`);
        }

        fs.unlinkSync(target);
        res.json({ message: 'Trait borrado.', deleted: [`${directory}/${file}`] });
    } catch (error) {
        next(error);
    }
}

// Convierte los AdminError en respuestas JSON y deja pasar el resto al log.
function adminErrorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err instanceof AdminError) {
        return res.status(err.status).json({ error: err.message });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'El archivo supera el límite de 25 MB.' });
    }
    // Errores marcados por multer (extensión rechazada, etc.).
    if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
    }

    console.error('[ERROR] admin ->', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
}

module.exports = {
    listTraits,
    uploadTrait,
    renameTrait,
    deleteTrait,
    adminErrorHandler
};
