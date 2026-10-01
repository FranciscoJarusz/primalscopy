// lib/forgePayments.js
//
// El cobro del Forge: cada roll se paga con una transferencia de APE (moneda
// nativa de ApeChain) a la wallet del treasury. No hay contrato: el usuario
// manda la transferencia desde su wallet y despues nos pasa el hash, y este
// modulo la busca en la cadena y comprueba que sea un pago valido.
//
// Un pago verificado queda registrado como "roll pagado" de la wallet que lo
// mando, y el siguiente roll de esa wallet lo consume. Asi, si algo se corta
// entre pagar y rollear (se cierra la pestaña, se reinicia el server), el pago
// no se pierde: el roll sigue ahi para usarlo.
//
// Configuracion (variables de entorno):
//   FORGE_TREASURY           a donde van los pagos. Sin esto no se cobra.
//   FORGE_ROLL_PRICE         precio de un roll en APE, ej. "5" o "0.5".
//   FORGE_PAYMENTS_FROM_BLOCK  bloque desde el que se aceptan pagos. Sin esto,
//                            cualquier transferencia vieja al treasury desde
//                            la misma wallet contaria como pago.
//   FORGE_CONFIRMATIONS      bloques de espera antes de aceptar (default 2).
//   FORGE_RPC_URL / FORGE_CHAIN_ID  otra cadena, solo para los tests (anvil).

const { createPublicClient, http, getAddress, parseEther, formatEther, defineChain } = require('viem');
const { apeChain } = require('viem/chains');

function httpError(status, message, code) {
    return Object.assign(new Error(message), { status, code });
}

// Se lee en cada llamada y no al cargar el modulo: asi cambiar el .env y
// reiniciar alcanza, y los tests pueden cambiarla en caliente.
function paymentConfig() {
    const treasury = (process.env.FORGE_TREASURY || '').trim();
    const price = (process.env.FORGE_ROLL_PRICE || '').trim();
    if (!treasury || !price) return null;

    const priceWei = parseEther(price);
    if (priceWei <= 0n) throw new Error('FORGE_ROLL_PRICE tiene que ser mayor que 0.');

    const chainId = Number(process.env.FORGE_CHAIN_ID || apeChain.id);
    return {
        treasury: getAddress(treasury),
        priceWei,
        chainId,
        rpcUrl: (process.env.FORGE_RPC_URL || '').trim() || null,
        confirmations: Math.max(1, Number(process.env.FORGE_CONFIRMATIONS || 2)),
        fromBlock: BigInt(process.env.FORGE_PAYMENTS_FROM_BLOCK || 0)
    };
}

// Lo que el front necesita para armar la transferencia. El precio va en wei
// como texto porque JSON no tiene enteros de ese tamaño.
function publicPaymentInfo(config) {
    if (!config) return { required: false };
    return {
        required: true,
        chainId: config.chainId,
        treasury: config.treasury,
        priceWei: config.priceWei.toString(),
        price: formatEther(config.priceWei),
        confirmations: config.confirmations
    };
}

let cachedClient = null;
let cachedKey = null;

function clientFor(config) {
    const key = `${config.chainId}|${config.rpcUrl}`;
    if (cachedClient && cachedKey === key) return cachedClient;

    const chain = config.chainId === apeChain.id && !config.rpcUrl
        ? apeChain
        : defineChain({
            id: config.chainId,
            name: `chain-${config.chainId}`,
            nativeCurrency: { name: 'ApeCoin', symbol: 'APE', decimals: 18 },
            rpcUrls: { default: { http: [config.rpcUrl] } }
        });

    // cacheTime 0: viem guarda el numero de bloque 4 segundos, y con eso las
    // confirmaciones se contarian de menos.
    cachedClient = createPublicClient({ chain, transport: http(config.rpcUrl || undefined), cacheTime: 0 });
    cachedKey = key;
    return cachedClient;
}

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

// Comprueba que `txHash` sea un pago de un roll hecho por `wallet`. Devuelve
// los datos del pago o tira un error con `code`:
//   not-confirmed  todavia no esta en un bloque o le faltan confirmaciones.
//                  Es el unico reintentable: el front vuelve a preguntar.
//   failed, wrong-chain, wrong-recipient, wrong-sender, underpaid, too-old
async function verifyPayment(txHash, wallet, config = paymentConfig()) {
    if (!config) throw httpError(503, 'El cobro del Forge no esta configurado.', 'not-configured');
    if (!TX_HASH_REGEX.test(String(txHash || ''))) {
        throw httpError(400, '"txHash" no es un hash de transaccion valido.', 'invalid-hash');
    }

    const client = clientFor(config);
    let tx;
    let receipt;
    try {
        tx = await client.getTransaction({ hash: txHash });
        receipt = await client.getTransactionReceipt({ hash: txHash });
    } catch (error) {
        // viem tira "not found" mientras la transaccion sigue en el mempool.
        if (/not be found|not found/i.test(error.message || '')) {
            throw httpError(409, 'El pago todavia no se confirmo. Espera unos segundos.', 'not-confirmed');
        }
        throw httpError(503, 'No se pudo consultar ApeChain. Proba de nuevo en un rato.', 'rpc-error');
    }

    if (receipt.status !== 'success') {
        throw httpError(422, 'Esa transaccion fallo en la cadena: no se cobro nada.', 'failed');
    }
    if (tx.chainId !== undefined && Number(tx.chainId) !== config.chainId) {
        throw httpError(422, 'Ese pago es de otra red.', 'wrong-chain');
    }
    if (!tx.to || tx.to.toLowerCase() !== config.treasury.toLowerCase()) {
        throw httpError(422, 'Esa transaccion no es un pago al treasury del Forge.', 'wrong-recipient');
    }
    if (tx.from.toLowerCase() !== String(wallet).toLowerCase()) {
        throw httpError(403, 'Ese pago lo hizo otra wallet.', 'wrong-sender');
    }
    if (tx.value < config.priceWei) {
        throw httpError(422, `El pago es menor al precio de un roll (${formatEther(config.priceWei)} APE).`, 'underpaid');
    }
    if (receipt.blockNumber < config.fromBlock) {
        throw httpError(422, 'Ese pago es anterior a la apertura del Forge.', 'too-old');
    }

    const latest = await client.getBlockNumber();
    const confirmations = latest - receipt.blockNumber + 1n;
    if (confirmations < BigInt(config.confirmations)) {
        throw httpError(409, 'El pago todavia no se confirmo. Espera unos segundos.', 'not-confirmed');
    }

    return {
        txHash: txHash.toLowerCase(),
        wallet: getAddress(tx.from),
        valueWei: tx.value.toString(),
        blockNumber: receipt.blockNumber.toString(),
        chainId: config.chainId
    };
}

module.exports = { paymentConfig, publicPaymentInfo, verifyPayment, httpError };
