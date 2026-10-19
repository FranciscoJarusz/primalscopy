const path = require('path');
const { ASSETS_ROOT } = require('./assetStore');
const { readJson, writeJson } = require('./jsonFiles');

const CONFIG_PATH = path.join(ASSETS_ROOT, 'exiled', 'config.json');
const TOKEN_IDS = Array.from({ length: 20 }, (_, i) => String(1382 + i));
const CODIGO_DE_EJEMPLO = 'COREBEACON';

const normalizar = code => String(code || '').trim().toUpperCase().replace(/\s+/g, ' ');

function masterCode() {
    return readJson(CONFIG_PATH, {}).masterCode ?? CODIGO_DE_EJEMPLO;
}

function setMasterCode(code) {
    const limpio = normalizar(code);
    if (limpio.length < 3 || limpio.length > 64) return { error: 'The master code needs between 3 and 64 characters.' };
    writeJson(CONFIG_PATH, { ...readJson(CONFIG_PATH, {}), masterCode: limpio });
    return { masterCode: limpio };
}

const esValido = code => normalizar(code) === masterCode();

module.exports = { TOKEN_IDS, masterCode, setMasterCode, esValido };
