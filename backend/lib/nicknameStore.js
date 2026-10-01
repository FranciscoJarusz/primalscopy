// lib/nicknameStore.js
//
// El apodo de cada wallet, para mostrarlo en el top de holders de /stats.
//
// Vive en el volumen, en un solo JSON chico: son a lo sumo unos cientos de
// wallets. Se lee una vez y se mantiene en memoria.
//
// Los apodos son unicos sin importar mayusculas: si no, cualquiera podria
// ponerse el nombre de un holder conocido y hacerse pasar por el.

const fs = require('fs');
const path = require('path');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');

const NICKNAMES_PATH = path.join(ASSETS_ROOT, 'profiles', 'nicknames.json');
const FORMATO = /^[A-Za-z0-9_]{3,20}$/;

let cache = null;

function load() {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(NICKNAMES_PATH, 'utf8'));
    } catch {
        cache = {};
    }
    return cache;
}

function save() {
    fs.mkdirSync(path.dirname(NICKNAMES_PATH), { recursive: true });
    writeAtomic(NICKNAMES_PATH, JSON.stringify(cache, null, 2));
}

function validate(nickname) {
    const value = String(nickname || '').trim();
    if (!FORMATO.test(value)) {
        return { error: 'Nickname must be 3-20 characters: letters, numbers or _.' };
    }
    return { value };
}

function getNickname(address) {
    return load()[address.toLowerCase()]?.nickname ?? null;
}

// { address: nickname } de todas las wallets, para el top de holders.
function getAllNicknames() {
    return Object.fromEntries(
        Object.entries(load()).map(([address, { nickname }]) => [address, nickname])
    );
}

// Con fechas, para el panel de admin.
function listNicknames() {
    return Object.entries(load())
        .map(([address, entry]) => ({ address, ...entry }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function setNickname(address, nickname) {
    const { value, error } = validate(nickname);
    if (error) return { error };

    const key = address.toLowerCase();
    const data = load();
    const taken = Object.entries(data).some(
        ([other, entry]) => other !== key && entry.nickname.toLowerCase() === value.toLowerCase()
    );
    if (taken) return { error: 'That nickname is already taken.' };

    data[key] = { nickname: value, updatedAt: new Date().toISOString() };
    save();
    return { nickname: value };
}

function deleteNickname(address) {
    const key = String(address || '').toLowerCase();
    const data = load();
    if (!data[key]) return false;
    delete data[key];
    save();
    return true;
}

module.exports = {
    getNickname,
    getAllNicknames,
    listNicknames,
    setNickname,
    deleteNickname,
    NICKNAMES_PATH
};
