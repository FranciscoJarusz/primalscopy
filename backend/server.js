// server.js
const express = require('express');
const cors = require('cors');
const nftRoutes = require('./routes/nftRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const { TRAITS_PATH, seedTraitsIfEmpty } = require('./lib/traitsStore');
const { isAdminEnabled, getAdminTokenLength } = require('./middleware/adminAuth');
const { isWalletAuthEnabled } = require('./lib/walletAuth');
const assets = require('./lib/assetStore');
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

// --- Assets publicos de los NFTs -------------------------------------------
//
// Estas dos rutas son las que van a servir la coleccion cuando
// ipfs.primalcult.xyz apunte a este servicio. Las URLs tienen que quedar
// exactamente asi porque el tokenURI del contrato ya apunta a
// /metadata/<id>, y eso esta escrito on-chain: no se puede cambiar.
assets.ensureDirs();

// La imagen lleva ?v=<timestamp> en la metadata, asi que cada version es una
// URL distinta y se puede cachear fuerte sin que nadie quede viendo la vieja.
app.use('/images', express.static(assets.IMAGES_DIR, {
  maxAge: '365d',
  immutable: true
}));

// La metadata, en cambio, se sobreescribe en su misma URL: tiene que
// revalidarse siempre o los marketplaces nunca se enteran de un cambio.
app.get('/metadata/:tokenId', (req, res) => {
  const metadata = assets.readMetadata(req.params.tokenId);
  if (!metadata) return res.status(404).json({ error: 'Metadata no encontrada.' });
  res.set('Cache-Control', 'no-cache');
  res.json(metadata);
});

// El animation_url de los 2712 tokens apunta a /viewer/index.html, asi que
// esta ruta tambien tiene que existir cuando el dominio apunte aca: es lo que
// muestran OpenSea y varias wallets. Va en el repo y no en el volumen porque
// es codigo, no datos de la coleccion.
app.use('/viewer', express.static(path.join(ASSETS_PATH, 'viewer'), {
  // El HTML cambia con cada deploy; que no quede cacheado una version vieja.
  setHeaders: res => res.set('Cache-Control', 'no-cache')
}));

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
