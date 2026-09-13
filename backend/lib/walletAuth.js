// lib/walletAuth.js
//
// Autenticacion por firma de wallet.
//
// La idea central: conocer una direccion no prueba nada. Las direcciones son
// publicas, cualquiera puede copiar la del dueño de un NFT y decir que es
// suya. Lo unico que prueba que alguien controla una wallet es una firma
// hecha con su clave privada.
//
// El flujo es en dos pasos a proposito:
//   1. El server emite un nonce y arma el mensaje exacto que hay que firmar.
//   2. El cliente devuelve la firma de ese mensaje.
//
// El server guarda el mensaje que emitio y verifica contra ESE, no contra lo
// que le manda el cliente. Asi no existe la posibilidad de que la wallet
// muestre un texto y el server valide otro.
//
// El nonce es lo que evita el replay: sin el, una firma capturada una sola vez
// serviria para siempre para hacerse pasar por ese usuario. Cada nonce se usa
// una vez y vence a los pocos minutos.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createPublicClient, http, getAddress, isAddress } = require('viem');
const { apeChain } = require('viem/chains');

// Igual que ADMIN_TOKEN: el .trim() no es cosmetico. Pegar un secreto en el
// dashboard de Railway suele arrastrar un espacio o un salto de linea, y eso
// da errores imposibles de diagnosticar desde afuera.
const JWT_SECRET = (process.env.WALLET_JWT_SECRET || '').trim();

// Va dentro del mensaje que firma el usuario para que vea a que sitio le esta
// dando acceso, y para que una firma hecha para otro sitio no sirva aca.
const APP_DOMAIN = (process.env.APP_DOMAIN || 'cultomizer.primalcult.xyz').trim();

const NONCE_TTL_MS = 5 * 60 * 1000;        // 5 minutos para firmar
const SESSION_TTL_SECONDS = 24 * 60 * 60;  // 24 horas de sesion

const publicClient = createPublicClient({
    chain: apeChain,
    transport: http()
});

// Si no hay secreto, toda la autenticacion queda deshabilitada. Es deliberado,
// mismo criterio que el panel de admin: prefiero que no funcione a que quede
// abierto por accidente.
function isWalletAuthEnabled() {
    return JWT_SECRET.length > 0;
}

// ---------------------------------------------------------------------------
// Nonces pendientes
//
// En memoria. Alcanza mientras el backend corra en una sola instancia: un
// nonce vive 5 minutos y lo unico que se pierde en un reinicio es que el
// usuario tenga que volver a firmar.
//
// Cuando agreguemos Postgres para guardar las customizaciones, esto se mueve
// ahi. Si Railway escala a mas de una instancia antes de eso, un nonce emitido
// por una no lo va a encontrar la otra y los logins van a fallar de forma
// intermitente.
// ---------------------------------------------------------------------------
const pendingNonces = new Map();

function purgeExpiredNonces() {
    const now = Date.now();
    for (const [nonce, entry] of pendingNonces) {
        if (entry.expiresAt <= now) pendingNonces.delete(nonce);
    }
}

function buildSignInMessage({ address, nonce, issuedAt }) {
    return [
        `${APP_DOMAIN} quiere verificar que sos el dueño de esta wallet.`,
        '',
        `Wallet: ${address}`,
        `Nonce: ${nonce}`,
        `Emitido: ${issuedAt}`,
        '',
        'Firmar este mensaje no autoriza ninguna transaccion ni movimiento de fondos.'
    ].join('\n');
}

// Emite el nonce y el mensaje a firmar para una direccion.
function createNonce(rawAddress) {
    if (!isAddress(rawAddress)) {
        throw new Error('Direccion de wallet invalida.');
    }
    purgeExpiredNonces();

    // Checksum: normaliza mayusculas/minusculas para que lo que ve el usuario
    // en la wallet sea siempre la misma forma canonica.
    const address = getAddress(rawAddress);
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const message = buildSignInMessage({ address, nonce, issuedAt });

    pendingNonces.set(nonce, {
        address,
        message,
        expiresAt: Date.now() + NONCE_TTL_MS
    });

    return { nonce, message, expiresInSeconds: NONCE_TTL_MS / 1000 };
}

// Verifica la firma contra el mensaje que emitimos nosotros y devuelve el
// token de sesion. Consume el nonce pase lo que pase: un nonce que ya se
// intento usar no se puede reintentar, aunque la firma haya sido invalida.
async function verifySignature({ nonce, signature }) {
    if (!isWalletAuthEnabled()) {
        throw new Error('La autenticacion por wallet esta deshabilitada.');
    }
    if (typeof nonce !== 'string' || typeof signature !== 'string') {
        throw new Error('Faltan el nonce o la firma.');
    }

    purgeExpiredNonces();
    const entry = pendingNonces.get(nonce);
    // Se borra antes de verificar, no despues: si se borrara solo en el camino
    // feliz, un atacante podria reintentar firmas contra el mismo nonce.
    pendingNonces.delete(nonce);

    if (!entry) {
        throw new Error('Nonce invalido o vencido. Pedi uno nuevo.');
    }

    // verifyMessage de viem cubre wallets normales (EOA) y tambien contratos
    // (ERC-1271, tipo Safe), que no se pueden validar con un ecrecover pelado.
    const valid = await publicClient.verifyMessage({
        address: entry.address,
        message: entry.message,
        signature
    });

    if (!valid) {
        throw new Error('La firma no corresponde a esa wallet.');
    }

    return {
        address: entry.address,
        token: issueSessionToken(entry.address),
        expiresInSeconds: SESSION_TTL_SECONDS
    };
}

function issueSessionToken(address) {
    return jwt.sign(
        { sub: address.toLowerCase() },
        JWT_SECRET,
        { expiresIn: SESSION_TTL_SECONDS }
    );
}

// Devuelve la direccion probada, o null. Nunca tira.
function readSessionToken(token) {
    if (!isWalletAuthEnabled() || !token) return null;
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        return payload.sub ? getAddress(payload.sub) : null;
    } catch {
        return null;
    }
}

module.exports = {
    isWalletAuthEnabled,
    createNonce,
    verifySignature,
    readSessionToken,
    SESSION_TTL_SECONDS
};
