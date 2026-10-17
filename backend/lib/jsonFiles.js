// lib/jsonFiles.js
//
// Leer y escribir los JSON del volumen. Antes cada store tenia su copia de
// estas funciones (staking, ruletas, codigos, Forge, apodos).

const fs = require('fs');
const path = require('path');
const { writeAtomic } = require('./assetStore');

// El JSON de un archivo, o `fallback` si no existe o no se puede leer.
function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

// Escritura atomica (ver writeAtomic), creando la carpeta si hace falta.
function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeAtomic(file, JSON.stringify(data, null, 2));
}

// Agrega una linea a un historial .jsonl, con la hora en `at`.
function appendJsonLine(file, entry) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

// Un historial .jsonl (un JSON por linea, solo se le agregan lineas). Una
// linea rota, por ejemplo si el proceso murio a mitad de un append, se saltea
// y se avisa: antes un solo error devolvia el historial vacio, y con eso
// desaparecian rachas e insignias y cambiaban los saldos del staking.
function readJsonLines(file, label = path.basename(file)) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch {
        return [];
    }
    const entries = [];
    let rotas = 0;
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
            entries.push(JSON.parse(line));
        } catch {
            rotas++;
        }
    }
    if (rotas > 0) console.warn(`[${label}] ${rotas} linea(s) ilegible(s) en ${file}: se ignoran.`);
    return entries;
}

// Un entero entre min y max, o null. Para validar lo que llega del admin.
function intEntre(value, min, max) {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

module.exports = { readJson, writeJson, appendJsonLine, readJsonLines, intEntre };
