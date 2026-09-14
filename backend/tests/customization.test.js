// tests/customization.test.js
//
// Prueba el guardado de una customizacion de punta a punta.
//
// El server corre DENTRO de este proceso para poder sustituir la consulta de
// propiedad: no tenemos la clave privada del dueño real de ningun token. Se
// reemplaza solo esa consulta a la blockchain; la firma, la sesion, la
// validacion de variantes, la composicion del GIF y la escritura son las
// reales.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const { privateKeyToAccount } = require('viem/accounts');

const PORT = 39871;
const BASE = `http://localhost:${PORT}`;
const TOKEN = '54';

const owner = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const stranger = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

// Un volumen de mentira para no ensuciar los assets del repo.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-test-'));
process.env.TRAITS_PATH = TMP;
process.env.WALLET_JWT_SECRET = 'secreto-solo-para-tests';
process.env.PORT = String(PORT);
process.env.PUBLIC_ASSETS_URL = BASE;

// La propiedad se resuelve antes de cargar el server, para que el middleware
// tome esta version en vez de la que consulta ApeChain.
const ownershipPath = require.resolve('../lib/nftOwnership');
require.cache[ownershipPath] = {
    id: ownershipPath,
    filename: ownershipPath,
    loaded: true,
    exports: {
        checkOwnership: async (address, tokenId) => {
            if (!/^\d+$/.test(String(tokenId))) return { status: 'invalid-token-id' };
            if (String(tokenId) !== TOKEN) return { status: 'token-not-found' };
            const isOwner = String(address).toLowerCase() === owner.address.toLowerCase();
            return { status: isOwner ? 'owner' : 'not-owner', owner: owner.address };
        },
        getTokenOwner: async () => owner.address,
        CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000000'
    }
};

// El publisher remoto se sustituye para no tocar el hosting real de la
// coleccion desde los tests. `modo` permite forzar una falla y comprobar que
// un fallo al publicar no deja la copia local desincronizada.
const publisherPath = require.resolve('../lib/remotePublisher');
const publisher = { modo: 'ok', publicados: [] };
require.cache[publisherPath] = {
    id: publisherPath,
    filename: publisherPath,
    loaded: true,
    exports: {
        isConfigured: () => true,
        missingConfig: () => [],
        publishNft: async (tokenId, payload) => {
            if (publisher.modo === 'falla') throw new Error('conexion rechazada');
            publisher.publicados.push({ tokenId, bytes: payload.gif.length, image: payload.metadata.image });
            return { imagePath: `/remoto/images/${tokenId}.gif`, metadataPath: `/remoto/metadata/${tokenId}` };
        },
        verifyAccess: async () => ({ ok: true })
    }
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const post = (url, body, token) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
});

async function login(account) {
    let r = await post(`${BASE}/api/auth/nonce`, { address: account.address });
    const { nonce, message } = await r.json();
    const signature = await account.signMessage({ message });
    r = await post(`${BASE}/api/auth/verify`, { nonce, signature });
    return (await r.json()).token;
}

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            const r = await fetch(`${BASE}/api/nft/${TOKEN}/customization`);
            if (r.ok) return;
        } catch { /* todavia no levanto */ }
        await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('El server no arranco.');
}

async function main() {
    require('../server.js');
    await waitForServer();

    const ownerToken = await login(owner);
    const strangerToken = await login(stranger);

    // Opciones legitimas de este token, para armar una seleccion valida.
    const options = await (await fetch(`${BASE}/api/nft/${TOKEN}/customize-options`)).json();
    const valid = {};
    for (const [category, option] of Object.entries(options)) {
        valid[category] = option.variants[option.variants.length - 1].imageUrl;
    }

    console.log('\n--- Quien puede guardar ---');
    let r = await post(`${BASE}/api/nft/${TOKEN}/customization`, { selections: valid });
    check('sin sesion -> 401', r.status === 401, `(dio ${r.status})`);

    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, { selections: valid }, strangerToken);
    check('sesion valida pero no es dueño -> 403', r.status === 403, `(dio ${r.status})`);

    console.log('\n--- Validacion del contenido (con sesion de dueño) ---');
    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, {}, ownerToken);
    check('sin selections -> 400', r.status === 400, `(dio ${r.status})`);

    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, {
        selections: { ...valid, Background: '/assets/traits/BACKGROUND/RED/RED.gif' }
    }, ownerToken);
    check('trait de otro valor (cambiaria la rareza) -> 400', r.status === 400, `(dio ${r.status})`);

    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, {
        selections: { ...valid, Background: '/assets/traits/../../../../etc/passwd' }
    }, ownerToken);
    check('intento de path traversal -> 400', r.status === 400, `(dio ${r.status})`);

    const sinUna = { ...valid };
    delete sinUna.Hat;
    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, { selections: sinUna }, ownerToken);
    check('falta una categoria -> 400', r.status === 400, `(dio ${r.status})`);

    console.log('\n--- Guardado real ---');
    // El "antes" es la metadata que hoy esta publicada de verdad, no la del
    // volumen de prueba, que arranca vacio.
    const original = await (await fetch(`https://ipfs.primalcult.xyz/metadata/${TOKEN}`)).json();

    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, { selections: valid }, ownerToken);
    const saved = await r.json();
    check('el dueño guarda -> 200', r.status === 200, `(dio ${r.status} ${JSON.stringify(saved).slice(0, 120)})`);
    check('devuelve una imagen con version', /\/images\/54\.gif\?v=\d+$/.test(saved.image || ''), `(dio ${saved.image})`);
    check('el GIF pesa algo razonable', saved.sizeBytes > 50_000, `(${saved.sizeBytes} bytes)`);

    console.log('\n--- Lo que quedo publicado ---');
    const meta = await (await fetch(`${BASE}/metadata/${TOKEN}`)).json();
    check('la metadata se sirve en /metadata/:id', Boolean(meta.name));
    check('el campo image apunta al GIF nuevo', meta.image === saved.image);

    // Lo mas importante: la rareza no se toca.
    check('los attributes quedaron intactos',
        JSON.stringify(meta.attributes) === JSON.stringify(original.attributes),
        '\n      antes: ' + JSON.stringify(original.attributes)?.slice(0, 80) +
        '\n      ahora: ' + JSON.stringify(meta.attributes)?.slice(0, 80));
    check('el resto de los campos tampoco cambio',
        meta.name === original.name && meta.description === original.description);

    const img = await fetch(`${BASE}/images/${TOKEN}.gif`);
    const bytes = Buffer.from(await img.arrayBuffer());
    check('la imagen se sirve en /images/:id.gif', img.status === 200, `(dio ${img.status})`);
    check('es un GIF de verdad', bytes.subarray(0, 4).toString() === 'GIF8', `(${bytes.subarray(0, 6)})`);
    check('se sirve como image/gif', (img.headers.get('content-type') || '').includes('image/gif'));

    const estado = await (await fetch(`${BASE}/api/nft/${TOKEN}/customization`)).json();
    check('queda registrado que hay customizacion', estado.saved === true);
    check('registra las 7 capas aplicadas', Object.keys(estado.applied || {}).length === 7,
        `(${Object.keys(estado.applied || {}).length})`);

    console.log('\n--- Un trait renombrado o movido se recupera por contenido ---');
    // Reproduce lo que paso de verdad: el archivo de Hat se movio a _GLOBAL con
    // otro nombre. La customizacion guardada apunta a la ruta vieja y tiene que
    // encontrarse igual, porque el contenido es el mismo.
    const hatGuardado = (await (await fetch(`${BASE}/api/nft/${TOKEN}/customization`)).json()).applied.Hat;
    const hatOrigen = path.join(TMP, ...hatGuardado.imageUrl.replace('/assets/traits/', '').split('/'));
    const globalDir = path.join(TMP, 'HAT', '_GLOBAL');

    if (fs.existsSync(hatOrigen)) {
        // Se guardan los bytes para poder dejar todo como estaba: las pruebas
        // que siguen vuelven a guardar, y sin este archivo fallarian en la
        // validacion antes de llegar a lo que quieren probar.
        const bytesOriginales = fs.readFileSync(hatOrigen);
        fs.mkdirSync(globalDir, { recursive: true });
        fs.renameSync(hatOrigen, path.join(globalDir, 'Z-MOVIDO.gif'));

        const tras = await (await fetch(`${BASE}/api/nft/${TOKEN}/customization`)).json();
        const hat = tras.applied?.Hat;
        check('encuentra el trait movido por su contenido',
            tras.relocated?.some(r => r.category === 'Hat'),
            `(relocated: ${JSON.stringify(tras.relocated)})`);
        check('devuelve la ruta nueva', Boolean(hat?.imageUrl?.includes('_GLOBAL/Z-MOVIDO.gif')), `(${hat?.imageUrl})`);
        check('no lo marca como perdido', !hat?.missing);

        // Y si el archivo directamente no esta, se informa en vez de callar.
        fs.unlinkSync(path.join(globalDir, 'Z-MOVIDO.gif'));
        const sinArchivo = await (await fetch(`${BASE}/api/nft/${TOKEN}/customization`)).json();
        check('un trait borrado se marca como perdido', sinArchivo.applied?.Hat?.missing === true,
            `(${JSON.stringify(sinArchivo.applied?.Hat)})`);

        fs.writeFileSync(hatOrigen, bytesOriginales);
        fs.rmSync(globalDir, { recursive: true, force: true });
    } else {
        check('preparacion del caso de trait movido', false, `(no existe ${hatOrigen})`);
    }

    console.log('\n--- Publicacion en el hosting de la coleccion ---');
    check('se publico al guardar', publisher.publicados.length === 1, `(${publisher.publicados.length})`);
    check('se publico el token correcto', publisher.publicados[0]?.tokenId === TOKEN);
    check('se publico la misma imagen que quedo guardada',
        publisher.publicados[0]?.image === saved.image);

    console.log('\n--- Si falla la publicacion, no se toca la copia local ---');
    const antesDeFallar = await (await fetch(`${BASE}/metadata/${TOKEN}`)).json();
    publisher.modo = 'falla';
    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, { selections: valid }, ownerToken);
    check('devuelve 502 y no 200', r.status === 502, `(dio ${r.status})`);
    const despuesDeFallar = await (await fetch(`${BASE}/metadata/${TOKEN}`)).json();
    check('la metadata local quedo intacta',
        despuesDeFallar.image === antesDeFallar.image,
        `(${antesDeFallar.image} -> ${despuesDeFallar.image})`);
    publisher.modo = 'ok';

    console.log('\n--- Guardar de nuevo cambia la version ---');
    await new Promise(res => setTimeout(res, 1100));
    r = await post(`${BASE}/api/nft/${TOKEN}/customization`, { selections: valid }, ownerToken);
    const again = await r.json();
    check('la URL de la imagen cambia entre guardados', again.image !== saved.image,
        `(${saved.image} -> ${again.image})`);

    console.log(`\n${pass} ok, ${fail} fallas\n`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(err => {
    console.error(err);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ya no esta */ }
    process.exit(1);
});
