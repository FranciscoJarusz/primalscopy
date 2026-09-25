// tests/traitRarity.test.js
//
// Prueba el sorteo por rareza que usan los rolls del LAB: que cada valor salga
// en proporcion a cuantos NFTs lo tienen, que se respeten las exclusiones, y
// que la foto de rareza no tenga traits sin arte (un roll no puede dar algo
// que despues no se puede dibujar).
//
// Correr con: npm test

const fs = require('fs');
const path = require('path');
const { createRarity, getRarity } = require('../lib/traitRarity');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok   ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

console.log('\n--- Cada ticket cae en el valor que le toca ---');
{
    // Comun: tickets 0-6, Raro: 7-9.
    const rarity = createRarity({ categories: { Hat: { Comun: 7, Raro: 3 } } });
    const con = ticket => ({ randomInt: () => ticket });
    check('ticket 0 -> Comun', rarity.pick('Hat', con(0)) === 'Comun');
    check('ticket 6 -> Comun', rarity.pick('Hat', con(6)) === 'Comun');
    check('ticket 7 -> Raro', rarity.pick('Hat', con(7)) === 'Raro');
    check('ticket 9 -> Raro', rarity.pick('Hat', con(9)) === 'Raro');

    let pedido = null;
    rarity.pick('Hat', { randomInt: n => { pedido = n; return 0; } });
    check('sortea sobre el total de NFTs (10)', pedido === 10, `(${pedido})`);
}

console.log('\n--- Exclusiones ---');
{
    const rarity = createRarity({ categories: { Hat: { A: 5, B: 3, C: 2 } } });
    check('exclude saca el valor', !Object.keys(rarity.probabilities('Hat', { exclude: ['A'] })).includes('A'));
    check('allow saca lo que no tiene arte',
        rarity.pick('Hat', { allow: v => v === 'C', randomInt: () => 0 }) === 'C');
    check('sin nada sorteable devuelve null', rarity.pick('Hat', { exclude: ['A', 'B', 'C'] }) === null);
    check('categoria desconocida devuelve null', rarity.pick('Nada') === null);
    const p = rarity.probabilities('Hat', { exclude: ['A'] });
    check('las probabilidades se renormalizan', Math.abs(p.B - 0.6) < 1e-9 && Math.abs(p.C - 0.4) < 1e-9);
}

console.log('\n--- Con la rareza real, las proporciones se respetan ---');
{
    const rarity = getRarity();
    const esperado = rarity.probabilities('Tunic');
    const N = 100000;
    const salidas = {};
    for (let i = 0; i < N; i++) {
        const v = rarity.pick('Tunic');
        salidas[v] = (salidas[v] || 0) + 1;
    }
    for (const [valor, prob] of Object.entries(esperado)) {
        const real = (salidas[valor] || 0) / N;
        // 1 punto de tolerancia: con 100k tiradas el desvio tipico es < 0,15.
        check(`Tunic ${valor}: ${(prob * 100).toFixed(1)}% esperado, ${(real * 100).toFixed(1)}% real`,
            Math.abs(real - prob) < 0.01);
    }
}

console.log('\n--- La foto de rareza ---');
{
    const rarity = getRarity();
    check('tiene las 7 categorias', rarity.categories.length === 7, `(${rarity.categories.join(', ')})`);
    check('las 12 piezas unicas estan marcadas', rarity.isOneOfOne(69) && rarity.isOneOfOne('7') && !rarity.isOneOfOne(54));

    // Cada valor tiene que tener su carpeta con al menos un archivo en la
    // semilla de traits. Morale Amulet es la excepcion conocida: lo tiene un
    // solo NFT (#15) y nunca tuvo arte por capas.
    const SIN_ARTE_CONOCIDO = new Set(['Effect/Morale Amulet']);
    const seed = path.join(__dirname, '..', 'assets', 'traits');
    const faltantes = [];
    for (const category of rarity.categories) {
        const categoryDir = path.join(seed, category.toUpperCase());
        const carpetas = fs.existsSync(categoryDir) ? fs.readdirSync(categoryDir) : [];
        for (const [valor] of rarity.weightsFor(category)) {
            if (SIN_ARTE_CONOCIDO.has(`${category}/${valor}`)) continue;
            const carpeta = carpetas.find(c => norm(c) === norm(valor));
            const archivos = carpeta ? fs.readdirSync(path.join(categoryDir, carpeta)) : [];
            if (!archivos.some(f => /\.(gif|png)$/i.test(f))) faltantes.push(`${category}/${valor}`);
        }
    }
    check('todos los traits tienen arte', faltantes.length === 0, `(${faltantes.join(', ')})`);
}

console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
