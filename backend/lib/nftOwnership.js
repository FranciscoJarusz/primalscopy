// lib/nftOwnership.js
//
// Lee quien es el dueño de un token, directo de ApeChain.
//
// Esto SIEMPRE se consulta en el momento de la operacion, nunca se cachea ni
// se resuelve al momento del login. La propiedad cambia con cada venta:
// alguien puede loguearse siendo dueño, vender el NFT diez minutos despues y
// seguir con la sesion abierta. Si la propiedad se verificara solo al entrar,
// ese usuario podria editar un NFT que ya no es suyo.

const { createPublicClient, http, getAddress } = require('viem');
const { apeChain } = require('viem/chains');

const CONTRACT_ADDRESS = getAddress(
    (process.env.NFT_CONTRACT_ADDRESS || '0xe277A7643562775C4f4257E23B068ba8F45608b4').trim()
);

const OWNER_OF_ABI = [{
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}];

const publicClient = createPublicClient({
    chain: apeChain,
    transport: http()
});

// Devuelve la direccion dueña del token, o null si el token no existe.
// ownerOf revierte para un tokenId no minteado; eso no es un error nuestro.
async function getTokenOwner(tokenId) {
    try {
        return await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: OWNER_OF_ABI,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)]
        });
    } catch {
        return null;
    }
}

// Distingue tres casos a proposito, porque el llamador los trata distinto:
// un token inexistente es un 404, una wallet que no es dueña es un 403, y un
// RPC caido es un 503 (no es culpa del usuario y conviene que reintente).
async function checkOwnership(address, tokenId) {
    if (!/^\d+$/.test(String(tokenId))) {
        return { status: 'invalid-token-id' };
    }

    let owner;
    try {
        owner = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: OWNER_OF_ABI,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)]
        });
    } catch (error) {
        // Un token no minteado hace revertir ownerOf. Cualquier otra falla
        // (timeout, RPC caido) es un problema de infraestructura, no del
        // usuario, y no hay que reportarla como "no sos el dueño".
        const message = String(error?.message || '');
        const isRevert = /revert|nonexistent|invalid token|ERC721/i.test(message);
        return isRevert ? { status: 'token-not-found' } : { status: 'chain-unavailable' };
    }

    const isOwner = owner.toLowerCase() === String(address).toLowerCase();
    return { status: isOwner ? 'owner' : 'not-owner', owner };
}

module.exports = { checkOwnership, getTokenOwner, CONTRACT_ADDRESS };
