import type { APIRoute } from 'astro';
import { backendAbsoluto } from '@/lib/backend';

export const prerender = false;

// Las paginas publicas y la ficha de cada Primal. Las que solo sirven con
// wallet conectada (select, edit, roll) y el admin quedan afuera a proposito:
// ver robots.txt y el noindex de BaseLayout. Si se agrega una pagina publica,
// va aca.
const PAGINAS = [
    '/',
    '/cultomizer',
    '/cultomizer/recent',
    '/forge',
    '/staking',
    '/shop',
    '/raffles',
    '/explore',
    '/stats',
];

async function idsDeLaColeccion(backend: string): Promise<number[]> {
    try {
        const r = await fetch(`${backend}/explore/collection`, { signal: AbortSignal.timeout(15_000) });
        if (!r.ok) return [];
        const { tokens } = (await r.json()) as { tokens: [number, ...unknown[]][] };
        return tokens.map(([id]) => id).sort((a, b) => a - b);
    } catch {
        return [];
    }
}

export const GET: APIRoute = async ({ url, site }) => {
    const origen = (site ?? url).origin;
    const ids = await idsDeLaColeccion(backendAbsoluto(url));
    const urls = [...PAGINAS, ...ids.map((id) => `/explore/${id}`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${origen}${u}</loc></url>`).join('\n')}
</urlset>
`;
    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': ids.length
                ? 'public, s-maxage=86400, stale-while-revalidate=604800'
                : 'public, s-maxage=300',
        },
    });
};
