import type { ReactNode } from 'react';
import { imagenInsignia, type Insignia } from '@/lib/insignias';
import { ZONAS } from '@/lib/zonas';
import { ROLES } from '@/lib/stats/roles';

// El arte provisorio de cada insignia, hasta que Trout suba la suya desde el
// admin: una forma, un color y el nombre. Las que no figuran aca salen con una
// forma y un color elegidos por su id. Las no ganadas son solo el contorno,
// como un hueco en el cuero.

type Forma =
    | 'circulo'
    | 'diamante'
    | 'estrella'
    | 'hexagono'
    | 'octogono'
    | 'escudo'
    | 'estampilla'
    | 'cinta'
    | 'ticket'
    | 'tarjeta'
    | 'pildora'
    | 'matasellos';

type Arte = { forma: Forma; fondo: string; texto: string; arriba?: string; grande?: string; borde?: string };

const ARTE: Record<string, Arte> = {
    'one-of-one': { forma: 'circulo', fondo: '#141414', texto: '#fff', borde: '#fff' },
    'primal-holder': { forma: 'estampilla', fondo: '#1f4fe0', texto: '#fff' },
    'class-of-2024': { forma: 'cinta', fondo: '#2de0c6', texto: '#0b0b0b', arriba: 'Holding since' },
    'mint-loyal': { forma: 'cinta', fondo: '#0b0b0b', texto: '#fff' },
    'diamond-hands': { forma: 'diamante', fondo: '#3557c9', texto: '#fff' },
    cultomized: { forma: 'estampilla', fondo: '#ff4fa3', texto: '#fff' },
    'fog-earned': { forma: 'circulo', fondo: '#7af0c8', texto: '#0b0b0b' },
    gambler: { forma: 'octogono', fondo: '#8a3ffc', texto: '#fff' },
    'forge-reroll': { forma: 'escudo', fondo: '#ff7a1a', texto: '#0b0b0b' },
    'event-attender': { forma: 'ticket', fondo: '#ffd23f', texto: '#0b0b0b' },
    'id-created': { forma: 'tarjeta', fondo: '#f2f2f2', texto: '#0b0b0b' },
    'x-linked': { forma: 'pildora', fondo: '#000', texto: '#fff' },
    'morale-amulet': { forma: 'circulo', fondo: '#ffd23f', texto: '#0b0b0b' },
    showdown: { forma: 'escudo', fondo: '#e8b923', texto: '#0b0b0b' },
    anniversary: { forma: 'cinta', fondo: '#ff4fa3', texto: '#fff' },
    miner: { forma: 'hexagono', fondo: '#8c6a4a', texto: '#fff' },
    'beer-chugger': { forma: 'tarjeta', fondo: '#f2a51a', texto: '#0b0b0b' },
};

const PALETA = ['#1f4fe0', '#ff4fa3', '#2de0c6', '#ffd23f', '#e8202a', '#8a3ffc', '#ff7a1a'];
const FORMAS_SUELTAS: Forma[] = ['circulo', 'hexagono', 'octogono', 'escudo', 'estampilla', 'diamante'];

function hash(texto: string) {
    let h = 0;
    for (const c of texto) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h);
}

function arteDe(id: string): Arte {
    if (ARTE[id]) return ARTE[id];
    const dias = id.match(/^staking-(\d+)$/);
    if (dias) return { forma: 'estrella', fondo: '#e8202a', texto: '#fff', grande: dias[1] };
    const zona = ZONAS.find((z) => z.id === id);
    if (zona) return { forma: 'matasellos', fondo: zona.color, texto: '#fff' };
    const rol = ROLES.find((r) => `role-${r.slug}` === id);
    if (rol) return { forma: 'hexagono', fondo: rol.color, texto: rol.textoOscuro ? '#0b0b0b' : '#fff' };
    const h = hash(id);
    return { forma: FORMAS_SUELTAS[h % FORMAS_SUELTAS.length], fondo: PALETA[h % PALETA.length], texto: '#fff' };
}

const VIEWBOX: Record<Forma, [number, number]> = {
    circulo: [100, 100],
    diamante: [100, 100],
    estrella: [100, 100],
    hexagono: [100, 100],
    octogono: [100, 100],
    escudo: [100, 100],
    matasellos: [100, 100],
    estampilla: [100, 124],
    cinta: [300, 96],
    ticket: [200, 100],
    tarjeta: [170, 106],
    pildora: [200, 84],
};

const ANCHO: Record<Forma, string> = {
    circulo: 'w-28 sm:w-36',
    diamante: 'w-28 sm:w-36',
    estrella: 'w-28 sm:w-36',
    hexagono: 'w-24 sm:w-32',
    octogono: 'w-24 sm:w-32',
    escudo: 'w-24 sm:w-32',
    matasellos: 'w-28 sm:w-36',
    estampilla: 'w-28 sm:w-36',
    cinta: 'w-56 sm:w-72',
    ticket: 'w-40 sm:w-52',
    tarjeta: 'w-36 sm:w-48',
    pildora: 'w-36 sm:w-44',
};

const ANCHO_CHICO: Record<Forma, string> = {
    circulo: 'w-18 sm:w-20',
    diamante: 'w-18 sm:w-20',
    estrella: 'w-18 sm:w-20',
    hexagono: 'w-16 sm:w-18',
    octogono: 'w-16 sm:w-18',
    escudo: 'w-16 sm:w-18',
    matasellos: 'w-18 sm:w-20',
    estampilla: 'w-16 sm:w-18',
    cinta: 'w-36 sm:w-40',
    ticket: 'w-28 sm:w-32',
    tarjeta: 'w-24 sm:w-28',
    pildora: 'w-24 sm:w-28',
};

function Figura({ forma, relleno, linea }: { forma: Forma; relleno: string; linea: string }) {
    const p = { fill: relleno, stroke: linea, strokeWidth: relleno === 'none' ? 1.5 : 4, vectorEffect: 'non-scaling-stroke' as const };
    switch (forma) {
        case 'circulo':
            return <circle cx="50" cy="50" r="48" {...p} />;
        case 'diamante':
            return <polygon points="50,2 98,50 50,98 2,50" {...p} />;
        case 'estrella':
            return <path d="M50 2 Q58 42 98 50 Q58 58 50 98 Q42 58 2 50 Q42 42 50 2Z" {...p} />;
        case 'hexagono':
            return <polygon points="50,2 93,26 93,74 50,98 7,74 7,26" {...p} />;
        case 'octogono':
            return <polygon points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30" {...p} />;
        case 'escudo':
            return <path d="M8 6 H92 V48 Q92 84 50 98 Q8 84 8 48Z" {...p} />;
        case 'matasellos':
            return (
                <>
                    <circle cx="50" cy="50" r="48" {...p} />
                    <circle cx="50" cy="50" r="40" fill="none" stroke={linea === 'none' ? 'rgba(255,255,255,.55)' : linea} strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                </>
            );
        case 'estampilla': {
            const agujeros = [];
            for (let x = 10; x <= 90; x += 10) agujeros.push(<circle key={`t${x}`} cx={x} cy="2" r="3.2" />, <circle key={`b${x}`} cx={x} cy="122" r="3.2" />);
            for (let y = 12; y <= 112; y += 10) agujeros.push(<circle key={`l${y}`} cx="2" cy={y} r="3.2" />, <circle key={`r${y}`} cx="98" cy={y} r="3.2" />);
            return (
                <>
                    <mask id="perforado">
                        <rect width="100" height="124" fill="#fff" />
                        <g fill="#000">{agujeros}</g>
                    </mask>
                    <rect x="2" y="2" width="96" height="120" mask="url(#perforado)" {...p} />
                </>
            );
        }
        case 'cinta':
            return <polygon points="2,2 298,2 284,48 298,94 2,94 16,48" {...p} />;
        case 'ticket':
            return <path d="M2 2 H198 V36 A14 14 0 0 0 198 64 V98 H2 V64 A14 14 0 0 0 2 36Z" {...p} />;
        case 'tarjeta':
            return (
                <>
                    <rect x="2" y="2" width="166" height="102" rx="10" {...p} />
                    <rect x="14" y="22" width="40" height="50" rx="4" fill="none" stroke={linea === 'none' ? 'currentColor' : linea} strokeWidth="1.5" opacity=".35" vectorEffect="non-scaling-stroke" />
                </>
            );
        case 'pildora':
            return <rect x="2" y="2" width="196" height="80" rx="40" {...p} />;
    }
}

// Inclinacion fija por insignia, para que parezcan pegadas a mano.
export const giro = (id: string) => (hash(id) % 9) - 4;

export default function Sticker({ b, chico = false, children }: { b: Insignia; chico?: boolean; children?: ReactNode }) {
    const arte = arteDe(b.id);
    const [w, h] = VIEWBOX[arte.forma];
    const pista = b.earned
        ? b.description
        : b.progress
          ? `${b.description} (${b.progress.value.toLocaleString('en-US')} / ${b.progress.target.toLocaleString('en-US')})`
          : b.description;

    if (b.image) {
        return (
            <div title={`${b.name}: ${pista}`} className={`${(chico ? ANCHO_CHICO : ANCHO)[arte.forma]} ${b.earned ? '' : 'opacity-20 grayscale'}`}>
                <img src={imagenInsignia(b.image)} alt={b.name} className="w-full h-auto drop-shadow-xl" />
                {children}
            </div>
        );
    }

    const ancha = w > h;
    return (
        <div
            title={`${b.name}: ${pista}`}
            className={`@container relative ${(chico ? ANCHO_CHICO : ANCHO)[arte.forma]} ${b.earned ? 'drop-shadow-xl' : ''}`}
            style={{ aspectRatio: `${w} / ${h}` }}
        >
            <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
                <Figura
                    forma={arte.forma}
                    relleno={b.earned ? arte.fondo : 'none'}
                    linea={b.earned ? (arte.borde ?? 'none') : 'rgba(255,255,255,.16)'}
                />
            </svg>
            <div
                className={`absolute inset-0 flex flex-col items-center justify-center text-center leading-none ${ancha ? 'px-[10%]' : 'px-[18%]'}`}
                style={{ color: b.earned ? arte.texto : 'rgba(255,255,255,.3)' }}
            >
                {arte.arriba && <span className="text-[5cqw] uppercase tracking-wide mb-1">{arte.arriba}</span>}
                {arte.grande ? (
                    <>
                        <span className="font-accent text-[30cqw] pb-[0.12em]">{arte.grande}</span>
                        <span className="font-accent uppercase text-[9cqw] -mt-1 pb-[0.2em]">Days</span>
                    </>
                ) : (
                    <span className={`font-accent uppercase pb-[0.2em] ${ancha ? 'text-[9cqw]' : 'text-[12cqw]'}`}>{b.name}</span>
                )}
            </div>
            {children}
        </div>
    );
}
