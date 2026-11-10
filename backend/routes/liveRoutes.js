const express = require('express');
const packs = require('../lib/packsStore');
const staking = require('../lib/stakingStore');
const raffles = require('../lib/raffleStore');
const forge = require('../lib/forgeStore');
const feed = require('../lib/feedStore');
const { getAllNicknames } = require('../lib/nicknameStore');

const router = express.Router();

const VIGENCIA_MS = 30 * 1000;
const ACTIVIDAD = 6;

let cache = { at: 0, datos: null };

function sorteo(lista) {
    const activo = [...lista.active].sort((a, b) => (a.endsAt ?? '9').localeCompare(b.endsAt ?? '9'))[0];
    if (activo) {
        return {
            state: 'open',
            id: activo.id,
            title: activo.title,
            image: activo.image,
            endsAt: activo.endsAt,
            participants: activo.participants,
            prizes: activo.prizes.map(p => p.label),
        };
    }
    const ultimo = lista.past[0];
    if (!ultimo) return null;
    return {
        state: 'drawn',
        id: ultimo.id,
        title: ultimo.title,
        image: ultimo.image,
        drawnAt: ultimo.drawnAt,
        participants: ultimo.participants,
        winners: ultimo.winners.map(w => ({ wallet: w.wallet, prize: w.prize })),
    };
}

function actividad() {
    const ahora = Date.now();
    const eventos = [
        ...forge.readHistory()
            .filter(h => h.event === 'choose' && !h.testMode)
            .slice(-ACTIVIDAD)
            .map(h => ({ at: h.at, kind: 'forge', wallet: h.wallet, tokenId: String(h.tokenId) })),
        ...feed.list()
            .slice(0, ACTIVIDAD)
            .map(e => ({ at: e.createdAt, kind: 'customize', wallet: e.wallet, tokenId: String(e.tokenId) })),
        ...staking.recientes(ACTIVIDAD).map(s => ({ ...s, kind: 'stake', tokenId: String(s.tokenId) })),
    ];
    return eventos
        .filter(e => e.at && Date.parse(e.at) <= ahora)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, ACTIVIDAD);
}

function armar() {
    const config = staking.publicConfig();
    const apodos = getAllNicknames();
    const conApodo = e => ({ ...e, wallet: e.wallet ? String(e.wallet).toLowerCase() : null, nickname: e.wallet ? apodos[String(e.wallet).toLowerCase()] ?? null : null });
    const raffle = sorteo(raffles.publicList());
    const packsVivo = packs.enVivo();
    return {
        packs: { ...packsVivo, pulls: packsVivo.pulls.slice(0, 4).map(conApodo) },
        raffle: raffle && raffle.winners ? { ...raffle, winners: raffle.winners.map(conApodo) } : raffle,
        staking: { staking: config.totals.staking, earned: config.totals.earned, collectionSize: config.collectionSize },
        activity: actividad().map(conApodo),
        serverTime: new Date().toISOString(),
    };
}

router.get('/', (req, res) => {
    if (!cache.datos || Date.now() - cache.at > VIGENCIA_MS) cache = { at: Date.now(), datos: armar() };
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ ...cache.datos, serverTime: new Date().toISOString() });
});

module.exports = router;
