// Las definiciones de las insignias (lib/badgeStore.js): semilla, alta,
// edicion, validacion, orden e imagen.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-badges-'));
process.env.TRAITS_PATH = TMP;

const badges = require('../lib/badgeStore');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

async function main() {
    let d = badges.admin();
    check('arranca con las del boceto', d.badges.length > 20 && d.badges.some(b => b.id === 'diamond-hands'));
    check('trae las metricas', d.metrics.some(m => m.id === 'stakedPeriod' && m.param));

    d = badges.crear({ name: 'Beer Chugger 2' });
    const nueva = d.badges.at(-1);
    check('crea una con id del nombre', nueva.id === 'beer-chugger-2' && nueva.enabled === false, nueva.id);
    d = badges.crear({ name: 'Beer Chugger 2' });
    check('no repite ids', d.badges.at(-1).id === 'beer-chugger-2-2');

    check('sin nombre no', badges.actualizar(nueva.id, { name: ' ' }).error);
    check('metrica inventada no', badges.actualizar(nueva.id, { metric: 'yates' }).error);
    check('comparacion inventada no', badges.actualizar(nueva.id, { op: '>' }).error);
    check('wallet mal escrita no', badges.actualizar(nueva.id, { kind: 'manual', wallets: 'hola' }).error);

    const W = '0x00000000000000000000000000000000000000AA';
    d = badges.actualizar(nueva.id, { kind: 'manual', wallets: `${W}\n${W.toLowerCase()}`, enabled: true });
    const editada = d.badges.find(b => b.id === nueva.id);
    check('guarda las wallets en minusculas y sin repetir', editada.wallets.length === 1 && editada.wallets[0] === W.toLowerCase());

    const ids = d.badges.map(b => b.id);
    check('orden incompleto no', badges.ordenar(ids.slice(1)).error);
    d = badges.ordenar([...ids].reverse());
    check('reordena', d.badges[0].id === ids.at(-1));

    const png = await require('sharp')({ create: { width: 900, height: 600, channels: 4, background: '#f00' } }).png().toBuffer();
    d = await badges.ponerImagen(nueva.id, png);
    const imagen = d.badges.find(b => b.id === nueva.id).image;
    check('sube la imagen en webp', imagen && fs.existsSync(badges.imagePath(imagen)));
    check('una imagen que no es imagen no', (await badges.ponerImagen(nueva.id, Buffer.from('hola'))).error);
    check('no sirve rutas raras', badges.imagePath('../badges.json') === null);

    d = badges.borrar(nueva.id);
    check('borra', !d.badges.some(b => b.id === nueva.id));
    check('y lo guardado sobrevive', badges.admin().badges.length === d.badges.length);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exitCode = fail ? 1 : 0;
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
