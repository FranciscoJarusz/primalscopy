// server.js
const express = require('express');
// Antes de armar las rutas: los errores de los handlers async van a next().
require('./lib/asyncErrors');
const cors = require('cors');
const nftRoutes = require('./routes/nftRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const forgeRoutes = require('./routes/forgeRoutes');
const profileRoutes = require('./routes/profileRoutes');
const promoRoutes = require('./routes/promoRoutes');
const stakingRoutes = require('./routes/stakingRoutes');
const { startStakingJob } = require('./lib/stakingJob');
const stakingStore = require('./lib/stakingStore');
const primalThumbs = require('./lib/primalThumbs');
const { paymentConfig } = require('./lib/forgePayments');
const { formatEther } = require('viem');
const { TRAITS_PATH, seedTraitsIfEmpty } = require('./lib/traitsStore');
const { servirMiniatura, generarTodas } = require('./lib/traitThumbs');
const { isAdminEnabled, getAdminTokenLength } = require('./middleware/adminAuth');
const { isWalletAuthEnabled } = require('./lib/walletAuth');
const assets = require('./lib/assetStore');
const feed = require('./lib/feedStore');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Railway pone un proxy adelante: sin esto req.ip seria la del proxy para
// todos, y el limite de intentos de los codigos frenaria a todo el mundo junto.
app.set('trust proxy', 1);

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

// Los traits salen de TRAITS_PATH (volumen persistente en producción), no de
// la carpeta del repo. Va antes del /assets general para tener prioridad.
app.use('/assets/traits', express.static(TRAITS_PATH));

// Miniaturas animadas de los traits para las grillas (ver lib/traitThumbs.js).
// Misma ruta que en /assets/traits, con /assets/thumbs adelante.
app.get(/^\/assets\/thumbs\/(.+)$/, servirMiniatura);

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
feed.ensureDirs();

// Miniaturas que quedaron sin entrada en el indice, por ejemplo si el proceso
// murio a mitad de un guardado. Se limpian una vez al arrancar y no en cada
// customizacion: con el historial lleno son 1000 archivos para listar.
const huerfanas = feed.cleanupOrphans();
if (huerfanas > 0) console.log(`[feed] Se borraron ${huerfanas} miniatura(s) huerfana(s).`);

// La imagen lleva ?v=<timestamp> en la metadata, asi que cada version es una
// URL distinta y se puede cachear fuerte sin que nadie quede viendo la vieja.
app.use('/images', express.static(assets.IMAGES_DIR, {
  maxAge: '365d',
  immutable: true
}));

// Las miniaturas del feed de customizaciones recientes. Cada una tiene un
// nombre unico e irrepetible y se borra cuando su entrada sale de los ultimos
// 10, asi que se puede cachear para siempre: nadie va a ver una vieja.
app.use('/feed/thumbs', express.static(feed.THUMBS_DIR, {
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

// Archivos sueltos que ya vivian en este subdominio y no tienen que ver con la
// coleccion (la metadata no los referencia), pero pueden estar linkeados desde
// la web, Twitter o Discord. Se migran para que el cambio de dominio no rompa
// ningun link viejo. Son 46 archivos, 8,9 MB.
app.use('/category', express.static(path.join(ASSETS_PATH, 'legacy', 'category'), { maxAge: '30d' }));
app.use('/t', express.static(path.join(ASSETS_PATH, 'legacy', 't'), { maxAge: '30d' }));

// Rutas de tu router
app.use('/api/nft', nftRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/forge', forgeRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/staking', stakingRoutes);

// Lo que se escapo de una ruta (ver lib/asyncErrors.js). Se contesta un 500 y
// el server sigue: antes una excepcion en una ruta lo tiraba entero.
app.use((err, req, res, next) => {
  // Los errores de Express traen su status (un JSON mal formado es un 400).
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status === 500) console.error(`[ERROR] ${req.method} ${req.originalUrl} ->`, err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server. Try again.' : err.message });
});

// La red de seguridad para lo que corre fuera de una request (timers, tareas
// en segundo plano): se registra en vez de terminar el proceso.
process.on('unhandledRejection', error => {
  console.error('[ERROR] Promesa rechazada sin atrapar ->', error);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  // Las miniaturas que falten, en segundo plano. Solo con el server lanzado
  // directo: los tests cargan este archivo y no tienen por que generarlas.
  if (require.main === module) {
    setTimeout(() => generarTodas().catch(error => console.error('[thumbs]', error)), 3000);
    // Igual el chequeo del staking: los tests lo llaman a mano.
    startStakingJob();
    // Las miniaturas de los Primals que estan entrenando, para el mapa.
    primalThumbs.habilitarPrecalentado();
    primalThumbs.precalentar(Object.values(stakingStore.trainingByPeriod()).flat());
  }
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
  const forgeCobro = paymentConfig();
  if (process.env.FORGE_TEST_MODE === 'true') {
    console.warn(`[forge] MODO DE PRUEBA: los cambios del Forge quedan solo en este server. ${
      forgeCobro ? 'Los rolls se cobran de verdad.' : 'Rolls gratis.'}`);
  }
  if (forgeCobro) {
    console.log(`[forge] Cobro: ${formatEther(forgeCobro.priceWei)} APE por roll a ${forgeCobro.treasury} (cadena ${forgeCobro.chainId}).`);
    if (forgeCobro.fromBlock === 0n) {
      console.warn('[forge] FORGE_PAYMENTS_FROM_BLOCK no definido: se aceptan transferencias viejas al treasury como pago.');
    }
  }
});
