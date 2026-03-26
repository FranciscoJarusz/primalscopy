// server.js
const express = require('express');
const cors = require('cors');
const nftRoutes = require('./routes/nftRoutes');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS (permitir desde cualquier origen)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware para leer JSON
app.use(express.json());

// Crear carpeta si no existe
const GENERATED_IMAGES_PATH = path.join(__dirname, 'generated_images');
if (!fs.existsSync(GENERATED_IMAGES_PATH)) {
  fs.mkdirSync(GENERATED_IMAGES_PATH);
}

// Servir imágenes generadas
app.use('/generated_images', express.static(GENERATED_IMAGES_PATH));

// Servir assets si tenés capas de imágenes
const ASSETS_PATH = path.join(__dirname, 'assets');
app.use('/assets', express.static(ASSETS_PATH));

// Rutas de tu router
app.use('/api/nft', nftRoutes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
