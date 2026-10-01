import type { APIRoute } from 'astro';
import { parseAbi } from 'viem';
import { client, json } from '@/lib/cultomizer/client';
import { NFT_CONTRACT_ADDRESS } from '@/lib/cultomizer/contracts';
import { readEnvValue } from '@/lib/env';
import { ROLES, rolDe } from '@/lib/stats/roles';

export const prerender = false;

const ABI = parseAbi([
    'function totalSupply() view returns (uint256)',
    'function ownerOf(uint256 tokenId) view returns (address)',
]);

const DURACION_CACHE = 10 * 60 * 1000;
const TOP = 100;
// Si se quema algun token, totalSupply baja pero los ids altos siguen
// existiendo: se leen algunos de mas y los que no existen se ignoran.
const MARGEN_IDS = 100;
const SIN_DUENO = new Set([
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dead',
]);

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

async function calcular(): Promise<Stats> {
    const [supply, volumen] = await Promise.all([
        client.readContract({
            address: NFT_CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'totalSupply',
        }),
        leerVolumen(),
    ]);

    const ids = Array.from(
        { length: Number(supply) + MARGEN_IDS },
        (_, i) => BigInt(i + 1)
    );
    const duenos = await client.multicall({
        contracts: ids.map((id) => ({
            address: NFT_CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'ownerOf' as const,
            args: [id] as const,
        })),
        batchSize: 1024 * 200,
    });

    const porWallet = new Map<string, number>();
    for (const d of duenos) {
        if (d.status !== 'success') continue;
        const address = d.result.toLowerCase();
        if (SIN_DUENO.has(address)) continue;
        porWallet.set(address, (porWallet.get(address) ?? 0) + 1);
    }

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
        totalSupply: Number(supply),
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

export const GET: APIRoute = async () => {
    if (cache && Date.now() - cache.actualizado < DURACION_CACHE) {
        return cacheada(cache);
    }

    enCurso ??= calcular().finally(() => {
        enCurso = null;
    });

    try {
        cache = await enCurso;
        return cacheada(cache);
    } catch {
        if (cache) return json(cache);
        return json({ error: 'No se pudieron leer los holders' }, 503);
    }
};
