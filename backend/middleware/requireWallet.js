// middleware/requireWallet.js
//
// Dos guardas que se usan encadenadas:
//
//   requireWallet     -> "esta request viene de alguien que probo tener esta wallet"
//   requireTokenOwner -> "...y esa wallet es dueña de este token AHORA MISMO"
//
// La sesion viaja como Bearer en el header Authorization, no como cookie. El
// front esta en otro dominio (Vercel) que el backend (Railway), asi que una
// cookie seria cross-site: necesitaria SameSite=None y la bloquean cada vez
// mas navegadores. Con Bearer alcanza el CORS que ya tiene el server.

const { readSessionToken, isWalletAuthEnabled } = require('../lib/walletAuth');
const { checkOwnership } = require('../lib/nftOwnership');

function extractToken(req) {
    const header = req.get('authorization') || '';
    if (header.toLowerCase().startsWith('bearer ')) {
        return header.slice(7).trim();
    }
    return '';
}

function requireWallet(req, res, next) {
    if (!isWalletAuthEnabled()) {
        return res.status(503).json({
            error: 'La autenticacion por wallet esta deshabilitada. Defini WALLET_JWT_SECRET en el servidor.'
        });
    }

    const address = readSessionToken(extractToken(req));
    if (!address) {
        return res.status(401).json({ error: 'Sesion invalida o vencida. Volve a firmar con tu wallet.' });
    }

    // La direccion probada. Todo lo que siga usa esto y nunca algo que venga
    // del body o de la query, que el cliente puede inventar.
    req.walletAddress = address;
    next();
}

async function requireTokenOwner(req, res, next) {
    const address = req.walletAddress;
    if (!address) {
        // Error de programacion: alguien monto esta guarda sin requireWallet
        // adelante. Corta con 500 en vez de dejar pasar la request.
        return res.status(500).json({ error: 'requireTokenOwner necesita requireWallet antes.' });
    }

    const { nftId } = req.params;
    const result = await checkOwnership(address, nftId);

    switch (result.status) {
        case 'owner':
            return next();
        case 'not-owner':
            return res.status(403).json({ error: `Esa wallet no es dueña del NFT #${nftId}.` });
        case 'token-not-found':
            return res.status(404).json({ error: `El NFT #${nftId} no existe.` });
        case 'invalid-token-id':
            return res.status(400).json({ error: 'ID de NFT invalido.' });
        default:
            // No pudimos leer la blockchain. No es culpa del usuario y no hay
            // que tratarlo como "no sos el dueño": eso convertiria una caida
            // del RPC en un permiso denegado.
            return res.status(503).json({ error: 'No se pudo verificar la propiedad ahora. Reintenta en unos segundos.' });
    }
}

module.exports = { requireWallet, requireTokenOwner };
