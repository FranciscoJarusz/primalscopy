const express = require('express');
const index = require('../lib/collectionIndex');
const staking = require('../lib/stakingStore');
const feed = require('../lib/feedStore');
const forge = require('../lib/forgeStore');
const exiled = require('../lib/exiledStore');
const { getRarity } = require('../lib/traitRarity');
const profiles = require('../lib/profileStore');
const og = require('../lib/ogCards');
const primalThumbs = require('../lib/primalThumbs');
const { getNickname, getAllNicknames } = require('../lib/nicknameStore');
const supply = require('../lib/collectionSupply');
const transfers = require('../lib/transferIndex');

const router = express.Router();
const TOKEN_ID_REGEX = /^\d{1,10}$/;
const WALLET_REGEX = /^0x[0-9a-fA-F]{40}$/;

router.get('/collection', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(index.coleccion());
});

router.get('/owner/:wallet', async (req, res) => {
    if (!WALLET_REGEX.test(req.params.wallet)) return res.status(400).json({ error: 'Invalid wallet.' });
    try {
        res.set('Cache-Control', 'no-cache');
        res.json({ tokenIds: await index.idsDe(req.params.wallet) });
    } catch {
        res.status(503).json({ error: "Couldn't reach the blockchain. Try again in a few seconds." });
    }
});

// Cuantos Primals tiene cada wallet, para /stats.
router.get('/holders', async (req, res) => {
    try {
        const [{ conteo }, totalSupply] = await Promise.all([index.holders(), supply.totalSupply()]);
        res.set('Cache-Control', 'no-cache');
        res.json({ totalSupply, holders: Object.fromEntries(conteo) });
    } catch {
        res.status(503).json({ error: "Couldn't reach the blockchain. Try again in a few seconds." });
    }
});

function historialForge(id) {
    const historial = forge.readHistory();
    const antes = new Map(historial.filter(h => h.event === 'roll' && h.tokenId === id).map(h => [h.rollId, h.before]));
    return historial
        .filter(h => h.event === 'choose' && h.tokenId === id && !h.testMode)
        .map(h => ({
            at: h.at,
            changes: Object.entries(h.changes || {}).map(([category, value]) => ({
                category,
                from: antes.get(h.rollId)?.[category] ?? null,
                to: value
            }))
        }))
        .reverse();
}

router.get('/primal/:id', async (req, res) => {
    const id = req.params.id;
    if (!TOKEN_ID_REGEX.test(id)) return res.status(404).json({ error: 'Unknown Primal.' });

    let datos;
    try {
        datos = await index.primal(id);
    } catch (error) {
        return res.status(error.status === 404 ? 404 : 502).json({ error: `Couldn't load Primal #${id}.` });
    }

    let owner = null;
    let ownerKnown = true;
    try {
        owner = await index.ownerOf(id);
    } catch {
        ownerKnown = false;
    }
    if (ownerKnown && !owner) return res.status(404).json({ error: `Primal #${id} doesn't exist.` });

    const stake = staking.stakeOf(id);
    res.set('Cache-Control', 'no-cache');
    res.json({
        ...datos,
        owner,
        ownerName: owner ? getNickname(owner) || null : null,
        exiled: exiled.TOKEN_IDS.map(String).includes(id),
        staking: stake && !stake.finished && stake.wallet === owner
            ? { days: stake.days, startAt: stake.startAt, endsAt: stake.endsAt, earned: stake.earned, perDayNow: stake.perDayNow }
            : null,
        customizations: feed.list()
            .filter(e => e.tokenId === id)
            .map(e => ({ at: e.createdAt, thumbnail: `/feed/thumbs/${e.thumbnail}` })),
        forge: historialForge(id)
    });
});

router.get('/avatars', async (req, res) => {
    try {
        const [porDefecto, mapa] = await Promise.all([index.avatares(), index.owners()]);
        const resultado = Object.fromEntries(porDefecto);
        for (const [wallet, perfil] of Object.entries(profiles.allProfiles())) {
            if (perfil.avatar && mapa.get(perfil.avatar) === wallet) resultado[wallet] = perfil.avatar;
        }
        res.set('Cache-Control', 'no-cache');
        res.json(resultado);
    } catch {
        res.status(503).json({ error: "Couldn't reach the blockchain. Try again in a few seconds." });
    }
});

router.get('/avatar/:wallet', async (req, res) => {
    if (!WALLET_REGEX.test(req.params.wallet)) return res.status(400).json({ error: 'Invalid wallet.' });
    const wallet = req.params.wallet.toLowerCase();
    try {
        const [porDefecto, mapa] = await Promise.all([index.avatares(), index.owners()]);
        const elegido = profiles.getProfile(wallet)?.avatar;
        res.set('Cache-Control', 'no-cache');
        res.json({ tokenId: elegido && mapa.get(elegido) === wallet ? elegido : porDefecto.get(wallet) ?? null });
    } catch {
        res.status(503).json({ error: "Couldn't reach the blockchain. Try again in a few seconds." });
    }
});

function walletDe(texto) {
    if (WALLET_REGEX.test(texto)) return texto.toLowerCase();
    const buscado = texto.toLowerCase();
    const encontrada = Object.entries(getAllNicknames()).find(([, apodo]) => apodo.toLowerCase() === buscado);
    return encontrada?.[0] ?? null;
}

// Lo ultimo que hizo la wallet en el sitio, lo mas nuevo primero.
function actividad(wallet, cuantos = 8) {
    const igual = w => String(w || '').toLowerCase() === wallet;
    const eventos = [
        ...forge.readHistory()
            .filter(h => h.event === 'choose' && !h.testMode && igual(h.wallet))
            .map(h => ({ at: h.at, kind: 'forge', tokenId: h.tokenId })),
        ...feed.list()
            .filter(e => igual(e.wallet))
            .map(e => ({ at: e.createdAt, kind: 'customize', tokenId: e.tokenId })),
        ...staking.actividadDe(wallet)
    ];
    return eventos
        .filter(e => e.at && Date.parse(e.at) <= Date.now())
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, cuantos);
}

async function datosHolder(wallet) {
    const [tokenIds, ranking] = await Promise.all([index.idsDe(wallet), index.holders()]);
    const porRareza = [...tokenIds].sort((a, b) => (index.puestoDe(a) ?? Infinity) - (index.puestoDe(b) ?? Infinity));
    const resumen = staking.walletSummary(wallet);
    const propios = new Set(tokenIds);
    const guardado = profiles.getProfile(wallet);
    return {
        wallet,
        nickname: getNickname(wallet),
        profile: {
            avatar: guardado?.avatar && propios.has(guardado.avatar) ? guardado.avatar : porRareza[0] ?? null,
            bio: guardado?.bio ?? '',
            x: guardado?.x ?? '',
            discord: guardado?.discord ?? '',
            featured: (guardado?.featured ?? []).filter(id => propios.has(id))
        },
        tokens: porRareza.map(id => ({ id, rank: index.puestoDe(id) })),
        rank: tokenIds.length ? ranking.puesto.get(tokenIds.length) ?? null : null,
        holders: ranking.total,
        oneOfOnes: tokenIds.filter(id => getRarity().isOneOfOne(id)).length,
        holding: transfers.holderSince(wallet),
        activity: actividad(wallet),
        fog: {
            balance: resumen.balance,
            perDay: resumen.dailyFog,
            training: resumen.stakes.filter(s => !s.finished).length,
            badges: resumen.badges
        }
    };
}

router.get('/holder/:id', async (req, res) => {
    const wallet = walletDe(String(req.params.id));
    if (!wallet) return res.status(404).json({ error: 'Unknown holder.' });
    try {
        const datos = await datosHolder(wallet);
        res.set('Cache-Control', 'no-cache');
        res.json(datos);
    } catch {
        res.status(503).json({ error: "Couldn't reach the blockchain. Try again in a few seconds." });
    }
});

function enviarTarjeta(res, archivo) {
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('image/png').sendFile(archivo);
}

router.get('/og/holder/:id.png', async (req, res) => {
    const wallet = walletDe(String(req.params.id));
    if (!wallet) return res.status(404).end();
    try {
        enviarTarjeta(res, await og.tarjetaHolder(await datosHolder(wallet)));
    } catch (error) {
        console.error('[og] holder:', error.message);
        res.status(502).end();
    }
});

router.get('/og/primal/:id.png', async (req, res) => {
    const id = req.params.id;
    if (!TOKEN_ID_REGEX.test(id)) return res.status(404).end();
    try {
        const ficha = await index.primal(id);
        let dueno = null;
        try {
            const owner = await index.ownerOf(id);
            dueno = owner ? getNickname(owner) || `${owner.slice(0, 6)}...${owner.slice(-4)}` : null;
        } catch { }
        if (exiled.TOKEN_IDS.map(String).includes(id)) dueno = 'THE CORE BEACON';
        enviarTarjeta(res, await og.tarjetaPrimal(ficha, dueno));
    } catch (error) {
        console.error('[og] primal:', error.message);
        res.status(502).end();
    }
});

router.get('/download/:id.:formato', async (req, res) => {
    const { id, formato } = req.params;
    if (!TOKEN_ID_REGEX.test(id) || !['gif', 'png'].includes(formato)) return res.status(404).end();
    try {
        const archivo = await primalThumbs.descarga(id, formato);
        res.set('Cache-Control', 'no-cache');
        res.attachment(`primal-${id}.${formato}`);
        res.type(`image/${formato}`).send(archivo);
    } catch (error) {
        console.error('[download] primal:', error.message);
        res.status(error.status || 502).end();
    }
});

module.exports = router;
