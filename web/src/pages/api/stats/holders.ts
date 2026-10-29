import type { APIRoute } from 'astro';
import { json } from '@/lib/cultomizer/client';
import { backendAbsoluto } from '@/lib/backend';
import { readEnvValue } from '@/lib/env';
import { ROLES, rolDe } from '@/lib/stats/roles';

export const prerender = false;

const DURACION_CACHE = 10 * 60 * 1000;
const TOP = 100;

type Stats = {
    totalSupply: number;
    holders: number;
    distribucion: { slug: string; holders: number }[];
    top: { address: string; cantidad: number }[];
    volumen: { valor: number; simbolo: string; ventas: number } | null;
    actualizado: number;
};

let cache: Stats | null = null;
let enCurso: Promise<Stats> | null = null;

async function leerVolumen(): Promise<Stats['volumen']> {
    const apiKey = readEnvValue('OPENSEA_API_KEY');
    if (!apiKey) return null;

    try {
        const respuesta = await fetch(
            'https://api.opensea.io/api/v2/collections/primalcult/stats',
            { headers: { 'x-api-key': apiKey, accept: 'application/json' } }
        );
        if (!respuesta.ok) return null;
        const { total } = await respuesta.json();
        return {
            valor: Number(total.volume) || 0,
            simbolo: String(total.volume_symbol || 'ETH'),
            ventas: Number(total.sales) || 0,
        };
    } catch {
        return null;
    }
}

// Cuantos tiene cada wallet sale del backend, que lo lleva al dia con las
// transferencias de la cadena (ver backend/lib/transferIndex.js).
async function calcular(backend: string): Promise<Stats> {
    const [respuesta, volumen] = await Promise.all([
        fetch(`${backend}/explore/holders`, { signal: AbortSignal.timeout(60_000) }),
        leerVolumen(),
    ]);
    if (!respuesta.ok) throw new Error(`El backend respondio ${respuesta.status}`);
    const { totalSupply: supply, holders } = (await respuesta.json()) as {
        totalSupply: number;
        holders: Record<string, number>;
    };
    const porWallet = new Map(Object.entries(holders));

    const conteo = new Map(ROLES.map((r) => [r.slug, 0]));
    for (const cantidad of porWallet.values()) {
        const { slug } = rolDe(cantidad);
        conteo.set(slug, (conteo.get(slug) ?? 0) + 1);
    }

    const top = [...porWallet]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP)
        .map(([address, cantidad]) => ({ address, cantidad }));

    return {
        totalSupply: supply,
        holders: porWallet.size,
        distribucion: ROLES.map((r) => ({
            slug: r.slug,
            holders: conteo.get(r.slug) ?? 0,
        })),
        top,
        volumen,
        actualizado: Date.now(),
    };
}

// En Vercel cada instancia de la funcion arranca con `cache` vacio: el que
// evita recalcular en cada visita es el CDN, que guarda la respuesta 10 minutos.
const cacheada = (stats: Stats) => {
    const respuesta = json(stats);
    respuesta.headers.set(
        'Cache-Control',
        'public, s-maxage=600, stale-while-revalidate=3600'
    );
    return respuesta;
};

export const GET: APIRoute = async ({ url }) => {
    if (cache && Date.now() - cache.actualizado < DURACION_CACHE) {
        return cacheada(cache);
    }

    enCurso ??= calcular(backendAbsoluto(url)).finally(() => {
        enCurso = null;
    });

    try {
        cache = await enCurso;
        return cacheada(cache);
    } catch {
        if (cache) return json(cache);
        return json({ error: "Couldn't read the holders" }, 503);
    }
};
