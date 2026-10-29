// El chequeo periodico del staking: pregunta a la cadena quien es el dueño de
// cada Primal en entrenamiento y a OpenSea cuales estan listados, y se lo pasa
// a stakingStore.applyVerification (ver el porque alla).

const staking = require('./stakingStore');
const { getTokenOwners } = require('./nftOwnership');
const listings = require('./marketplaceListings');
const wheels = require('./stakingWheels');
const supply = require('./collectionSupply');
const { ownersOf } = require('./transferIndex');

const INTERVAL_MS = 10 * 60 * 1000;
let running = null;

async function readListings() {
    if (!listings.isConfigured()) return new Map();
    try {
        return await listings.getListings();
    } catch (error) {
        console.warn(`[staking] No se pudo leer los listados de OpenSea: ${error.message}`);
        return null;
    }
}

async function verify() {
    const ids = Object.keys(staking.readActive());
    if (ids.length === 0) return { checked: 0 };

    const checkedAt = Date.now();
    const [owners, listed] = await Promise.all([getTokenOwners(ids), readListings()]);
    const ended = staking.applyVerification({ owners, listings: listed, checkedAt });
    return { checked: ids.length, listingsChecked: listed !== null, ended };
}

// Los Primals del vault que se sortean en el Summon shard. Se leen los ids de
// la coleccion con margen, como en /api/stats/holders: los que no existen
// vuelven sin dueño y se ignoran.
// Las cartas de la ruleta usan la miniatura de 192 px: se preparan aca para
// que la cinta no arranque con huecos (solo se generan las que faltan).
async function refreshVaultNow() {
    const result = await wheels.refreshVault({ getTokenOwners: ownersOf, totalSupply: (await supply.totalSupply()) + supply.MARGEN_IDS });
    require('./primalThumbs').precalentar(result.tokenIds, 192);
    return result;
}

// Uno a la vez: si el admin lo pide mientras corre el automatico, espera ese.
function verifyStakes() {
    if (!running) {
        running = verify().finally(() => { running = null; });
    }
    return running;
}

function startStakingJob() {
    const tick = () => verifyStakes()
        .then(result => {
            const { ended } = result;
            if (ended && (ended.transferred || ended.listed || ended.completed)) {
                console.log(`[staking] ${result.checked} verificados; terminaron ${ended.completed}, vendidos ${ended.transferred}, listados ${ended.listed}.`);
            }
        })
        // La cadena caida no es grave: los dias esperan al proximo chequeo.
        .catch(error => console.warn(`[staking] Chequeo fallido: ${error.message}`))
        .then(() => refreshVaultNow())
        .catch(error => console.warn(`[staking] No se pudo leer el vault: ${error.message}`));
    setTimeout(tick, 15000);
    setInterval(tick, INTERVAL_MS);
}

module.exports = { verifyStakes, startStakingJob, refreshVaultNow };
