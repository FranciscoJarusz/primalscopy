// tests/feed.test.js
//
// Prueba la contabilidad del feed: se guardan las ultimas N, la que sobra se
// borra con su JPEG, y las paginas salen de a 50. Sin el recorte, la carpeta de
// miniaturas crece para siempre.
//
// No compone GIFs: eso ya lo cubre customization.test.js de punta a punta. Aca
// las "imagenes" son bytes cualquiera.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-feed-'));
process.env.TRAITS_PATH = TMP;
// Un tope chico para no escribir 1000 archivos en un test. La regla que importa
// es la misma que en produccion, solo cambia el numero.
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
    console.log('\n--- El feed guarda solo las ultimas N ---');

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

    console.log('\n--- Paginado ---');
    const primera = feed.page({ page: 1, perPage: 4 });
    check('la pagina 1 trae 4', primera.items.length === 4, `(${primera.items.length})`);
    check('dice cuantas paginas hay', primera.pages === 3, `(${primera.pages})`);
    check('dice el total', primera.total === 10, `(${primera.total})`);
    check('arranca por la mas nueva', primera.items[0].tokenId === '12', `(${primera.items[0].tokenId})`);

    const segunda = feed.page({ page: 2, perPage: 4 });
    check('la pagina 2 sigue donde termino la 1', segunda.items[0].tokenId === '8', `(${segunda.items[0].tokenId})`);
    check('no repite nada de la pagina 1',
        !segunda.items.some(item => primera.items.some(previo => previo.id === item.id)));

    const ultima = feed.page({ page: 3, perPage: 4 });
    check('la ultima pagina trae el resto', ultima.items.length === 2, `(${ultima.items.length})`);

    console.log('\n--- Parametros fuera de rango no rompen nada ---');
    check('una pagina que no existe devuelve la ultima',
        feed.page({ page: 99, perPage: 4 }).page === 3, `(${feed.page({ page: 99, perPage: 4 }).page})`);
    check('una pagina negativa devuelve la primera', feed.page({ page: -5 }).page === 1);
    check('perPage vacio usa el default de 50', feed.page({}).perPage === 50, `(${feed.page({}).perPage})`);
    check('perPage gigante se recorta al tope',
        feed.page({ perPage: 9999 }).perPage === feed.MAX_PAGE_SIZE,
        `(${feed.page({ perPage: 9999 }).perPage})`);
    check('perPage basura usa el default', feed.page({ perPage: 'muchas' }).perPage === 50,
        `(${feed.page({ perPage: 'muchas' }).perPage})`);

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
    // El controller permite dos a la vez, y escribir el indice es leer-modificar
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
    check('se saltea la que perdio la imagen',
        feed.page({ perPage: 50 }).items.length === 9, `(${feed.page({ perPage: 50 }).items.length})`);

    console.log('\n--- Limpieza de huerfanas al arrancar ---');
    fs.writeFileSync(path.join(feed.THUMBS_DIR, 'quedo-suelta.jpg'), 'basura');
    const borradas = feed.cleanupOrphans();
    check('borra la que no esta en el indice', borradas === 1, `(${borradas})`);
    check('no toca las que si estan', thumbsEnDisco().length === 9, `(${thumbsEnDisco().length})`);

    console.log(`\n${pass} ok, ${fail} fallas\n`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(err => {
    console.error(err);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ya no esta */ }
    process.exit(1);
});
