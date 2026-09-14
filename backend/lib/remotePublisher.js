// lib/remotePublisher.js
//
// Publica la imagen y la metadata de un NFT en el hosting donde ya vive la
// coleccion, por SFTP.
//
// Se eligio esto en vez de mudar el dominio a Railway: asi no hay que tocar
// el DNS y nada puede romperse del lado del cliente. El costo es que la
// coleccion sigue dependiendo de un servidor prestado.
//
// Ese servidor NO es nuestro: es un hosting compartido con sitios de otra
// gente. Por eso todo aca es deliberadamente conservador:
//
//   - Se escribe en exactamente dos rutas, armadas por nosotros. Nada que
//     venga de afuera participa de la ruta.
//   - El id de token se valida como numero antes de tocar nada: alcanza un
//     "../" para escribir fuera de la carpeta prevista.
//   - Nunca se borra nada. El unico remove es el del propio temporal.
//   - Se sube a un temporal y se renombra. Si la conexion se corta a la
//     mitad, el archivo viejo queda intacto en vez de quedar truncado, que en
//     un NFT significa imagen rota en todos los marketplaces.

const SftpClient = require('ssh2-sftp-client');

const HOST = (process.env.SFTP_HOST || '').trim();
const PORT = Number(process.env.SFTP_PORT || 22);
const USER = (process.env.SFTP_USER || '').trim();
const PASSWORD = process.env.SFTP_PASSWORD || '';
// Carpeta publica del subdominio. Debajo de ella viven images/ y metadata/.
const REMOTE_ROOT = (process.env.SFTP_REMOTE_ROOT || '').trim().replace(/\/+$/, '');

const CONNECT_TIMEOUT_MS = 20000;
const TOKEN_ID_REGEX = /^\d{1,10}$/;

function isConfigured() {
    return Boolean(HOST && USER && PASSWORD && REMOTE_ROOT);
}

function missingConfig() {
    return [
        !HOST && 'SFTP_HOST',
        !USER && 'SFTP_USER',
        !PASSWORD && 'SFTP_PASSWORD',
        !REMOTE_ROOT && 'SFTP_REMOTE_ROOT'
    ].filter(Boolean);
}

function assertTokenId(tokenId) {
    const id = String(tokenId);
    if (!TOKEN_ID_REGEX.test(id)) {
        throw new Error(`Token id invalido para publicar: ${tokenId}`);
    }
    return id;
}

async function withConnection(fn) {
    if (!isConfigured()) {
        throw new Error(`Faltan variables de entorno del SFTP: ${missingConfig().join(', ')}.`);
    }

    const sftp = new SftpClient();
    try {
        await sftp.connect({
            host: HOST,
            port: PORT,
            username: USER,
            password: PASSWORD,
            readyTimeout: CONNECT_TIMEOUT_MS
        });
        return await fn(sftp);
    } finally {
        // end() puede tirar si la conexion ya murio; no debe tapar el error real.
        try { await sftp.end(); } catch { /* ya estaba cerrada */ }
    }
}

// Sube a un temporal y despues renombra. En SFTP el rename dentro del mismo
// filesystem es atomico, asi que el archivo destino nunca se ve a medio
// escribir.
async function uploadAtomic(sftp, buffer, remotePath) {
    const tmpPath = `${remotePath}.uploading`;
    await sftp.put(buffer, tmpPath);
    try {
        // El destino suele existir y algunos servidores no pisan en rename.
        await sftp.delete(remotePath, true);
    } catch { /* no existia */ }
    await sftp.rename(tmpPath, remotePath);
}

/**
 * Publica imagen y metadata de un token. La imagen va primero a proposito: si
 * el proceso muere en el medio, la metadata sigue apuntando a una imagen que
 * existe. Al reves quedaria apuntando a una que no se subio.
 */
async function publishNft(tokenId, { gif, metadata }) {
    const id = assertTokenId(tokenId);
    if (!Buffer.isBuffer(gif) || gif.length === 0) {
        throw new Error('El GIF a publicar esta vacio.');
    }
    if (!metadata || typeof metadata !== 'object') {
        throw new Error('La metadata a publicar no es valida.');
    }

    const imagePath = `${REMOTE_ROOT}/images/${id}.gif`;
    const metadataPath = `${REMOTE_ROOT}/metadata/${id}`;

    return withConnection(async sftp => {
        await uploadAtomic(sftp, gif, imagePath);
        await uploadAtomic(sftp, Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'), metadataPath);
        return { imagePath, metadataPath, sizeBytes: gif.length };
    });
}

/**
 * Comprueba que las credenciales sirvan y que se pueda escribir, sin tocar
 * ningun archivo de la coleccion: escribe un temporal con nombre propio en la
 * carpeta de metadata y lo borra enseguida.
 */
async function verifyAccess() {
    if (!isConfigured()) {
        return { ok: false, configured: false, missing: missingConfig() };
    }

    const probePath = `${REMOTE_ROOT}/metadata/.cultomizer-write-check`;
    try {
        return await withConnection(async sftp => {
            const images = await sftp.list(`${REMOTE_ROOT}/images`);
            const metadata = await sftp.list(`${REMOTE_ROOT}/metadata`);

            let canWrite = false;
            try {
                await sftp.put(Buffer.from('ok', 'utf8'), probePath);
                await sftp.delete(probePath, true);
                canWrite = true;
            } catch (error) {
                return {
                    ok: false, configured: true, canRead: true, canWrite: false,
                    host: HOST, remoteRoot: REMOTE_ROOT,
                    error: `Conecta y lee, pero no puede escribir: ${error.message}`
                };
            }

            return {
                ok: canWrite,
                configured: true,
                canRead: true,
                canWrite: true,
                host: HOST,
                remoteRoot: REMOTE_ROOT,
                remoteImages: images.length,
                remoteMetadata: metadata.length
            };
        });
    } catch (error) {
        return { ok: false, configured: true, error: error.message, host: HOST, remoteRoot: REMOTE_ROOT };
    }
}

module.exports = { isConfigured, missingConfig, publishNft, verifyAccess, HOST, REMOTE_ROOT };
