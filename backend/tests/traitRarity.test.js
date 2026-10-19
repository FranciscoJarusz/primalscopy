// Prueba el sorteo que usan los rolls del Forge: que los comunes salgan en
// proporcion a cuantos NFTs los tienen, que los raros salgan con las odds que
// fijo el dueño (ROLL_ODDS), que se respeten las exclusiones, y que la foto de
// rareza no tenga traits sin arte (un roll no puede dar algo que despues no se
// puede dibujar).
//
// Correr con: npm test

const fs = require('fs');
const path = require('path');
const { createRarity, getRarity, ROLL_ODDS, MAX_ODDS, TICKETS } = require('../lib/traitRarity');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok   ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

console.log('\n--- Cada ticket cae en el valor que le toca ---');
{
    // Dos comunes (70% y 30%): sin raros, las odds son la rareza. Comun se
    // queda con el primer 70% de los tickets.
    const rarity = createRarity({ categories: { Hat: { Comun: 7, Otro: 3 } } });
    const con = ticket => ({ randomInt: () => ticket });
    const corte = TICKETS * 0.7;
    check('primer ticket -> Comun', rarity.pick('Hat', con(0)) === 'Comun');
    check('ultimo ticket de Comun -> Comun', rarity.pick('Hat', con(corte - 1)) === 'Comun');
    check('siguiente -> Otro', rarity.pick('Hat', con(corte)) === 'Otro');
    check('ultimo ticket -> Otro', rarity.pick('Hat', con(TICKETS - 1)) === 'Otro');

    let pedido = null;
    rarity.pick('Hat', { randomInt: n => { pedido = n; return 0; } });
    check('sortea sobre el total de tickets', pedido === TICKETS, `(${pedido})`);
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

console.log('\n--- Odds de los raros (las que fijo el dueño) ---');
{
    // 100 NFTs: cinco comunes de 18 se reparten el resto (ninguno llega al
    // tope); Rare 6 (6%), VeryRare 3 (3%) y Super 1 (1%) tienen odds fija.
    const rarity = createRarity({ categories: { Hat: { Comun: 18, Mas: 18, C3: 18, C4: 18, C5: 18, Rare: 6, VeryRare: 3, Super: 1 } } });
    const odds = rarity.rollOdds('Hat');
    const cerca = (a, b) => Math.abs(a - b) < 1e-12;
    // Cada uno en el medio de su franja de coleccion -> el medio de su rango.
    check('Rare 6% -> 2%', cerca(odds.Rare, 0.02), `(${odds.Rare})`);
    check('Very Rare 3% -> 0,75%', cerca(odds.VeryRare, 0.0075), `(${odds.VeryRare})`);
    check('Super Rare 1% -> 0,3%', cerca(odds.Super, 0.003), `(${odds.Super})`);
    const resto = 1 - 0.02 - 0.0075 - 0.003;
    check('los comunes se reparten el resto segun sus NFTs',
        cerca(odds.Comun, resto / 5) && cerca(odds.Mas, resto / 5), JSON.stringify(odds));
    check('suman 100%', cerca(Object.values(odds).reduce((a, b) => a + b, 0), 1));

    const sinActual = rarity.rollOdds('Hat', { exclude: ['Comun'] });
    check('excluir un comun no cambia las odds de los raros', cerca(sinActual.Rare, 0.02));
    check('...y los otros comunes se reparten el resto', cerca(sinActual.Mas, resto / 4));

    const soloRaros = rarity.rollOdds('Hat', { exclude: ['Comun', 'Mas', 'C3', 'C4', 'C5'] });
    check('sin comunes, los raros se reparten el 100%',
        cerca(Object.values(soloRaros).reduce((a, b) => a + b, 0), 1) && soloRaros.Rare > soloRaros.Super);

    const real = getRarity();
    const fuera = [];
    for (const category of real.categories.filter(c => c !== 'Effect')) {
        const share = real.probabilities(category);
        const odds = real.rollOdds(category);
        if (Object.values(odds).some(p => p >= MAX_ODDS - 1e-12)) continue;
        for (const [valor, p] of Object.entries(odds)) {
            const band = ROLL_ODDS.find(b => share[valor] >= b.desde && share[valor] < b.hasta);
            if (band && (p < band.min || p > band.max)) fuera.push(`${category}/${valor} ${p}`);
        }
    }
    check('sin tope, cada raro de la coleccion real queda dentro de su rango', fuera.length === 0, fuera.join(', '));
}

console.log('\n--- Tope por trait ---');
{
    // Un solo comun (80%) se llevaria ~94%: queda en el tope y lo que sobra va
    // a los Rare. El Super Rare no cambia.
    const rarity = createRarity({ categories: { Eyes: { Comun: 81, R1: 6, R2: 6, R3: 6, Super: 1 } } });
    const odds = rarity.rollOdds('Eyes');
    const cerca = (a, b) => Math.abs(a - b) < 1e-9;
    check('el comun queda en el tope', cerca(odds.Comun, MAX_ODDS), `(${odds.Comun})`);
    check('el Super Rare no cambia', odds.Super < 0.006, `(${odds.Super})`);
    check('los Rare se llevan lo que sobra', cerca(odds.R1, (1 - MAX_ODDS - odds.Super) / 3), `(${odds.R1})`);
    check('suman 100%', cerca(Object.values(odds).reduce((a, b) => a + b, 0), 1));

    const pocos = createRarity({ categories: { Hat: { Comun: 7, Otro: 3 } } }).rollOdds('Hat');
    check('con muy pocos valores no se topea', cerca(pocos.Comun, 0.7), `(${pocos.Comun})`);

    const real = getRarity();
    const pasados = [];
    for (const category of real.categories.filter(c => c !== 'Effect')) {
        for (const actual of [undefined, ...Object.keys(real.probabilities(category))]) {
            const odds = real.rollOdds(category, { exclude: actual ? [actual] : [] });
            const suma = Object.values(odds).reduce((a, b) => a + b, 0);
            if (!cerca(suma, 1)) pasados.push(`${category} sin ${actual}: suma ${suma}`);
            for (const [valor, p] of Object.entries(odds)) {
                if (p > MAX_ODDS + 1e-9) pasados.push(`${category}/${valor} sin ${actual}: ${p}`);
            }
        }
    }
    check('con la coleccion real, ningun trait pasa el tope y todo suma 100%', pasados.length === 0, pasados.join(', '));
}

console.log('\n--- Con la rareza real, el sorteo respeta las odds ---');
{
    const rarity = getRarity();
    const esperado = rarity.rollOdds('Tunic');
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
