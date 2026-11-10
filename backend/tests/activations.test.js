const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-activations-'));
process.env.TRAITS_PATH = TMP;

const activations = require('../lib/activationStore');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

async function main() {
    let d = activations.admin();
    check('arranca con las 12 de la semilla', d.activations.length === 12 && d.activations[0].id === 'settlement');
    check('la publica las trae todas sin el flag', activations.publico().length === 12 && !('enabled' in activations.publico()[0]));

    d = activations.crear({ title: 'Primal Arena' });
    const nueva = d.activations[0];
    check('crea arriba, oculta y con id del titulo', nueva.id === 'primal-arena' && nueva.enabled === false, nueva.id);
    check('la oculta no sale en la publica', !activations.publico().some(h => h.id === 'primal-arena'));
    d = activations.crear({ title: 'Primal Arena' });
    check('no repite ids', d.activations[0].id === 'primal-arena-2');

    check('sin titulo no', activations.actualizar(nueva.id, { title: ' ' }).error);
    check('estado inventado no', activations.actualizar(nueva.id, { status: 'soon' }).error);
    check('encuadre inventado no', activations.actualizar(nueva.id, { fit: 'stretch' }).error);
    check('enlace http no', activations.actualizar(nueva.id, { href: 'http://x.com' }).error);
    check('enlace // no', activations.actualizar(nueva.id, { href: '//x.com' }).error);
    check('enlace javascript no', activations.actualizar(nueva.id, { href: 'javascript:alert(1)' }).error);

    d = activations.actualizar(nueva.id, { status: 'live', href: '/arena', date: 'Dec 2026', enabled: true, text: 'Fight.' });
    const editada = d.activations.find(h => h.id === nueva.id);
    check('guarda la edicion', editada.status === 'live' && editada.href === '/arena' && editada.date === 'Dec 2026' && editada.enabled);
    check('y aparece en la publica', activations.publico().some(h => h.id === nueva.id));
    check('acepta https', !activations.actualizar(nueva.id, { href: 'https://x.com/primal_cult' }).error);

    const ids = d.activations.map(h => h.id);
    check('orden incompleto no', activations.ordenar(ids.slice(1)).error);
    d = activations.ordenar([...ids].reverse());
    check('reordena', d.activations[0].id === ids.at(-1));

    const png = await require('sharp')({ create: { width: 1800, height: 2700, channels: 4, background: '#f00' } }).png().toBuffer();
    d = await activations.ponerImagen(nueva.id, png);
    const imagen = d.activations.find(h => h.id === nueva.id).image;
    const meta = imagen && await require('sharp')(fs.readFileSync(activations.imagePath(imagen))).metadata();
    check('sube la portada en webp y achicada', meta && meta.format === 'webp' && meta.width === 900 && meta.height === 1350, JSON.stringify(meta && [meta.width, meta.height]));
    check('una imagen que no es imagen no', (await activations.ponerImagen(nueva.id, Buffer.from('hola'))).error);
    check('no sirve rutas raras', activations.imagePath('../activations.json') === null);
    d = activations.quitarImagen(nueva.id);
    check('quita la imagen', d.activations.find(h => h.id === nueva.id).image === null);

    d = activations.borrar(nueva.id);
    check('borra', !d.activations.some(h => h.id === nueva.id));
    check('y lo guardado sobrevive', activations.admin().activations.length === d.activations.length);

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exitCode = fail ? 1 : 0;
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
