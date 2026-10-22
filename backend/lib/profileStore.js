const path = require('path');
const { ASSETS_ROOT } = require('./assetStore');
const { readJson, writeJson } = require('./jsonFiles');

const PROFILES_PATH = path.join(ASSETS_ROOT, 'profiles', 'profiles.json');
const MAX_BIO = 160;
const MAX_FEATURED = 6;
const TOKEN_ID = /^\d{1,10}$/;
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const DISCORD = /^[a-z0-9_.]{2,32}$/;

let cache = null;

function load() {
    cache ??= readJson(PROFILES_PATH, {});
    return cache;
}

function getProfile(address) {
    return load()[String(address).toLowerCase()] ?? null;
}

function validate(datos = {}) {
    const avatar = datos.avatar == null || datos.avatar === '' ? null : String(datos.avatar);
    if (avatar !== null && !TOKEN_ID.test(avatar)) return { error: 'Invalid profile picture.' };

    const bio = String(datos.bio ?? '')
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (bio.length > MAX_BIO) return { error: `Bio can be up to ${MAX_BIO} characters.` };

    const x = String(datos.x ?? '').trim().replace(/^@/, '');
    if (x && !X_HANDLE.test(x)) return { error: 'X username must be 1-15 characters: letters, numbers or _.' };

    const discord = String(datos.discord ?? '').trim().toLowerCase();
    if (discord && !DISCORD.test(discord)) {
        return { error: 'Discord username must be 2-32 characters: lowercase letters, numbers, _ or .' };
    }

    const featured = [...new Set((Array.isArray(datos.featured) ? datos.featured : []).map(String))];
    if (featured.length > MAX_FEATURED) return { error: `You can feature up to ${MAX_FEATURED} Primals.` };
    if (!featured.every(id => TOKEN_ID.test(id))) return { error: 'Invalid featured Primal.' };

    return { value: { avatar, bio, x, discord, featured } };
}

function setProfile(address, value) {
    const data = load();
    data[address.toLowerCase()] = { ...value, updatedAt: new Date().toISOString() };
    writeJson(PROFILES_PATH, data);
    return data[address.toLowerCase()];
}

function listBios() {
    return Object.entries(load())
        .filter(([, p]) => p.bio)
        .map(([address, p]) => ({ address, bio: p.bio, updatedAt: p.updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function clearBio(address) {
    const key = String(address || '').toLowerCase();
    const data = load();
    if (!data[key]?.bio) return false;
    data[key] = { ...data[key], bio: '' };
    writeJson(PROFILES_PATH, data);
    return true;
}

function allProfiles() {
    return load();
}

module.exports = { allProfiles, getProfile, validate, setProfile, listBios, clearBio, MAX_BIO, MAX_FEATURED };
