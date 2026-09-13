// server.js
const express = require('express');
const cors = require('cors');
const nftRoutes = require('./routes/nftRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const { TRAITS_PATH, seedTraitsIfEmpty } = require('./lib/traitsStore');
const { isAdminEnabled, getAdminTokenLength } = require('./middleware/adminAuth');
const { isWalletAuthEnabled } = require('./lib/walletAuth');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Prepara el volumen persistente antes de atender el primer request.
seedTraitsIfEmpty();

// CORS (permitir desde cualquier origen)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
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

// Los traits salen de TRAITS_PATH (volumen persistente en producción), no de
// la carpeta del repo. Va antes del /assets general para tener prioridad.
app.use('/assets/traits', express.static(TRAITS_PATH));

// Servir el resto de assets (base_primal, empty_canvas, etc.)
const ASSETS_PATH = path.join(__dirname, 'assets');
app.use('/assets', express.static(ASSETS_PATH));

// Rutas de tu router
app.use('/api/nft', nftRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`[traits] Sirviendo traits desde ${TRAITS_PATH}`);
  if (!isWalletAuthEnabled()) {
    console.warn('[auth] WALLET_JWT_SECRET no definido: el login por wallet está deshabilitado.');
  } else {
    console.log('[auth] Login por wallet habilitado.');
  }
  if (!isAdminEnabled()) {
    console.warn('[admin] ADMIN_TOKEN no definido: el panel de admin está deshabilitado.');
  } else {
    // Solo la longitud, nunca el token: sirve para detectar desde los logs un
    // pegado truncado o con espacios sin exponer el secreto.
    console.log(`[admin] Panel habilitado (token de ${getAdminTokenLength()} caracteres).`);
  }
});
