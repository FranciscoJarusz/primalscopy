// SOLO EN DESARROLLO: /staking?demo=600 llena el mapa con Primals de mentira
// para ver como queda con mucha gente. En el build de produccion
// import.meta.env.DEV es false y esto no hace nada. La excepcion es el link de
// `.\dev.ps1 share`: ese build define PUBLIC_STAKING_DEMO para que el dueño
// pueda verlo lleno. Vercel no la define.
//
// Se reparten entre las regiones (mas en las largas) y tres quedan marcados
// como de la wallet, para ver como pasean. Las miniaturas son solo una docena
// de Primals reales repetidos: pedir cientos distintos haria que el backend
// baje cientos de GIFs del servidor de origen, que es prestado.
import { miniaturaPrimal } from '@/lib/staking';

const REPARTO: [number, number][] = [
    [90, 0.4],
    [30, 0.25],
    [14, 0.2],
    [7, 0.15],
];

export function demoStaking() {
    if (!import.meta.env.DEV && import.meta.env.PUBLIC_STAKING_DEMO !== '1') return null;
    const n = Math.min(2712, Number(new URLSearchParams(location.search).get('demo')) || 0);
    if (n <= 0) return null;

    const poblacion: Record<string, string[]> = {};
    let siguiente = 1;
    REPARTO.forEach(([dias, parte], i) => {
        const cuantos = i === REPARTO.length - 1 ? n - siguiente + 1 : Math.round(n * parte);
        poblacion[dias] = Array.from({ length: Math.max(0, cuantos) }, () => String(siguiente++));
    });
    const mios = new Set([poblacion[90][3], poblacion[30][5], poblacion[7][1]].filter(Boolean));
    const miniatura = (tokenId: string) => miniaturaPrimal(String(((Number(tokenId) - 1) % 12) + 1));
    return { poblacion, mios, miniatura };
}
