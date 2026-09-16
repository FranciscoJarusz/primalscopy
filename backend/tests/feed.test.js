// tests/feed.test.js
//
// Prueba la regla del feed: se guardan las ultimas N y la que sobra se borra,
// con su JPEG. Sin esto, la carpeta de miniaturas crece para siempre.
//
// No compone GIFs: eso ya lo cubre customization.test.js de punta a punta. Aca
// solo importa la contabilidad del historial, asi que las "imagenes" son bytes
// cualquiera.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-feed-'));
process.env.TRAITS_PATH = TMP;
process.env.FEED_MAX_ITEMS = '10';

const feed = require('../lib/feedStore');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok   ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const jpegFalso = (n) => Buffer.from(`imagen-${n}`);
const thumbsEnDisco = () => fs.readdirSync(feed.THUMBS_DIR).filter(f => f.endsWith('.jpg'));

async function main() {
    console.log('\n--- El feed guarda solo las ultimas 10 ---');

    const guardadas = [];
    for (let i = 1; i <= 12; i++) {
        guardadas.push(await feed.record({ tokenId: String(i), wallet: '0xabc', jpeg: jpegFalso(i) }));
    }

    const items = feed.list();
    check('quedan 10 entradas', items.length === 10, `(${items.length})`);
    check('la primera es la ultima que entro', items[0].tokenId === '12', `(${items[0].tokenId})`);
    check('la ultima es la numero 3', items[9].tokenId === '3', `(${items[9].tokenId})`);
    check('las dos mas viejas salieron',
        !items.some(item => item.tokenId === '1' || item.tokenId === '2'));

    console.log('\n--- Y borra sus imagenes ---');
    check('no quedan JPEG de mas en disco', thumbsEnDisco().length === 10, `(${thumbsEnDisco().length})`);
    check('el JPEG de la entrada 1 se borro',
        !fs.existsSync(path.join(feed.THUMBS_DIR, guardadas[0].thumbnail)));
    check('el JPEG de la entrada 12 esta',
        fs.existsSync(path.join(feed.THUMBS_DIR, guardadas[11].thumbnail)));

    console.log('\n--- Un mismo token puede aparecer varias veces ---');
    await feed.record({ tokenId: '777', wallet: '0xabc', jpeg: jpegFalso('a') });
    await feed.record({ tokenId: '777', wallet: '0xabc', jpeg: jpegFalso('b') });
    await feed.record({ tokenId: '777', wallet: '0xabc', jpeg: jpegFalso('c') });
    const conRepetidos = feed.list();
    check('las 3 versiones del mismo primal conviven',
        conRepetidos.filter(item => item.tokenId === '777').length === 3,
        `(${conRepetidos.filter(item => item.tokenId === '777').length})`);
    check('cada una tiene su propia miniatura',
        new Set(conRepetidos.map(item => item.thumbnail)).size === conRepetidos.length);

    console.log('\n--- Dos guardados simultaneos no se pisan ---');
    // El controller permite dos a la vez, y escribir el index es leer-modificar
    // -escribir: sin la cola del store, uno de los dos desaparecia.
    await Promise.all([
        feed.record({ tokenId: '901', wallet: '0xabc', jpeg: jpegFalso('x') }),
        feed.record({ tokenId: '902', wallet: '0xabc', jpeg: jpegFalso('y') })
    ]);
    const paralelo = feed.list();
    check('entraron las dos',
        paralelo.some(item => item.tokenId === '901') && paralelo.some(item => item.tokenId === '902'));
    check('el tope se sigue respetando', paralelo.length === 10, `(${paralelo.length})`);

    console.log('\n--- Una entrada sin su archivo no se muestra ---');
    fs.unlinkSync(path.join(feed.THUMBS_DIR, paralelo[0].thumbnail));
    check('se saltea la que perdio la imagen', feed.list().length === 9, `(${feed.list().length})`);

    console.log(`\n${pass} ok, ${fail} fallas\n`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(err => {
    console.error(err);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ya no esta */ }
    process.exit(1);
});
