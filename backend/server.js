const express = require('express');
const cors = require('cors');
const nftRoutes = require('./routes/nftRoutes');
const path = require('path');
const fs = require('fs');

// --- NUEVA IMPORTACIÓN PARA RECIBIR ARCHIVOS ---
const multer = require('multer');
// Configuramos multer para que guarde los archivos en la carpeta de imágenes generadas
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const shareDir = path.join(__dirname, 'generated_images', 'shares');
    if (!fs.existsSync(shareDir)) {
      fs.mkdirSync(shareDir, { recursive: true });
    }
    cb(null, shareDir);
  },
  filename: (req, file, cb) => {
    // Nombre único: share-timestamp-original.gif
    cb(null, `share-${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Crear carpeta base si no existe
const GENERATED_IMAGES_PATH = path.join(__dirname, 'generated_images');
if (!fs.existsSync(GENERATED_IMAGES_PATH)) {
  fs.mkdirSync(GENERATED_IMAGES_PATH);
}

// Servir imágenes generadas (Esto permite que X acceda al link)
app.use('/generated_images', express.static(GENERATED_IMAGES_PATH));

// Servir assets
const ASSETS_PATH = path.join(__dirname, 'assets');
app.use('/assets', express.static(ASSETS_PATH));

// Rutas de tu router
app.use('/api/nft', nftRoutes);

// --- NUEVO ENDPOINT PARA COMPARTIR EN X (SOLO RAILWAY) ---
app.post('/api/nft/share-gif', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No se recibió el archivo." });
        }

        // Construimos la URL pública de Railway
        // Si tenés una variable RAILWAY_STATIC_URL usala, sino detectamos el host automáticamente
        const host = req.get('host');
        const protocol = req.protocol;
        const baseUrl = process.env.RAILWAY_STATIC_URL || `https://${req.get('host')}`;
        const publicUrl = `${baseUrl}/generated_images/shares/${req.file.filename}`;

        console.log(`GIF listo para compartir en: ${publicUrl}`);

        res.json({ shareUrl: publicUrl });
    } catch (error) {
        console.error("Error en el guardado local:", error);
        res.status(500).json({ error: "Error interno al guardar el GIF." });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});