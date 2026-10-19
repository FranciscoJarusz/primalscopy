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
const { bearerToken } = require('./bearerToken');

function requireWallet(req, res, next) {
    if (!isWalletAuthEnabled()) {
        return res.status(503).json({
            error: 'Wallet sign-in is disabled. Set WALLET_JWT_SECRET on the server.'
        });
    }

    const address = readSessionToken(bearerToken(req));
    if (!address) {
        return res.status(401).json({ error: 'Your session expired. Sign again with your wallet.' });
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
        return res.status(500).json({ error: 'requireTokenOwner needs requireWallet first.' });
    }

    const { nftId } = req.params;
    const result = await checkOwnership(address, nftId);

    switch (result.status) {
        case 'owner':
            return next();
        case 'not-owner':
            return res.status(403).json({ error: `That wallet doesn't own Primal #${nftId}.` });
        case 'token-not-found':
            return res.status(404).json({ error: `Primal #${nftId} doesn't exist.` });
        case 'invalid-token-id':
            return res.status(400).json({ error: 'Invalid Primal id.' });
        default:
            // No pudimos leer la blockchain. No es culpa del usuario y no hay
            // que tratarlo como "no sos el dueño": eso convertiria una caida
            // del RPC en un permiso denegado.
            return res.status(503).json({ error: "Couldn't check ownership right now. Try again in a few seconds." });
    }
}

module.exports = { requireWallet, requireTokenOwner };
