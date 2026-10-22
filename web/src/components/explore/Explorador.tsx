import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { FiChevronDown, FiSearch, FiSliders, FiX } from 'react-icons/fi';
import {
    leerColeccion,
    leerDe,
    urlFicha,
    UNICO,
    type Coleccion,
} from '@/lib/explore';
import { leerMapa } from '@/lib/staking';
import { ZONAS } from '@/lib/zonas';
import Carta from './Carta';
import { scrollToTop } from '@/lib/lenis';
import { nombreWallet, useApodos } from '@/lib/nicknames';
import { tierDe } from '@/components/forge/rareza';
import { input } from '@/components/forge/estilos';

const POR_PAGINA = 50;
const card =
    'rounded-2xl sm:rounded-[30px] bg-darkblue shadow-lg shadow-darkblue/50';

type Orden = 'id' | 'rarity';
type Filtros = {
    q: string;
    orden: Orden;
    owner: string | null;
    unicos: boolean;
    region: number | null;
    traits: Record<string, string[]>;
};

const VACIOS: Filtros = {
    q: '',
    orden: 'id',
    owner: null,
    unicos: false,
    region: null,
    traits: {},
};

function desdeUrl(): Filtros {
    const p = new URLSearchParams(location.search);
    const traits: Record<string, string[]> = {};
    for (const [k, v] of p)
        if (k.startsWith('t.') && v) traits[k.slice(2)] = v.split('|');
    const region = Number(p.get('region'));
    return {
        q: p.get('q') ?? '',
        orden: p.get('sort') === 'rarity' ? 'rarity' : 'id',
        owner: /^0x[0-9a-fA-F]{40}$/.test(p.get('owner') ?? '')
            ? p.get('owner')!.toLowerCase()
            : null,
        unicos: p.get('only') === '1of1',
        region: ZONAS.some((z) => z.days === region) ? region : null,
        traits,
    };
}

function aUrl(f: Filtros, pagina = 1) {
    const p = new URLSearchParams();
    if (pagina > 1) p.set('page', String(pagina));
    if (f.q) p.set('q', f.q);
    if (f.orden !== 'id') p.set('sort', f.orden);
    if (f.owner) p.set('owner', f.owner);
    if (f.unicos) p.set('only', '1of1');
    if (f.region) p.set('region', String(f.region));
    for (const [k, v] of Object.entries(f.traits))
        if (v.length) p.set(`t.${k}`, v.join('|'));
    const texto = p.toString();
    history.replaceState(null, '', texto ? `?${texto}` : location.pathname);
}

function Chip({
    activo,
    onClick,
    children,
    color,
}: {
    activo: boolean;
    onClick: () => void;
    children: React.ReactNode;
    color?: string;
}) {
    return (
        <button
            onClick={onClick}
            style={
                activo && color
                    ? { backgroundColor: color, borderColor: color }
                    : undefined
            }
            className={`h-8 inline-flex items-center gap-1.5 leading-none rounded-md border px-3 pb-[0.38em] font-accent uppercase text-sm cursor-pointer transition-all duration-300 ${
                activo
                    ? 'bg-yellow border-yellow text-darkblue'
                    : 'border-lightblue/20 text-lightblue hover:border-yellow hover:text-yellow'
            } ${activo && color ? 'text-white!' : ''}`}
        >
            {children}
        </button>
    );
}

function Grupo({
    titulo,
    children,
}: {
    titulo: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase text-lightblue/60">
                {titulo}
            </span>
            <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
    );
}

function Categoria({
    nombre,
    valores,
    total,
    elegidos,
    alternar,
}: {
    nombre: string;
    valores: { value: string; count: number }[];
    total: number;
    elegidos: string[];
    alternar: (valor: string) => void;
}) {
    const [abierta, setAbierta] = useState(elegidos.length > 0);
    return (
        <div className="border-b border-lightblue/10 last:border-0">
            <button
                onClick={() => setAbierta(!abierta)}
                className="w-full flex items-center justify-between gap-2 py-2.5 text-left cursor-pointer text-lightblue hover:text-yellow transition-all duration-300"
            >
                <span className="font-accent uppercase pb-1">
                    {nombre}
                    {elegidos.length > 0 && (
                        <span className="ml-2 text-yellow">
                            {elegidos.length}
                        </span>
                    )}
                </span>
                <FiChevronDown
                    className={`w-4 h-4 shrink-0 transition-all duration-300 ${abierta ? 'rotate-180' : ''}`}
                />
            </button>
            {abierta && (
                <ul
                    data-scroll-propio
                    className="flex flex-col gap-0.5 pb-3 max-h-64 overflow-y-auto overscroll-contain pr-1"
                >
                    {valores.map((v) => {
                        const marcado = elegidos.includes(v.value);
                        return (
                            <li key={v.value}>
                                <label className="flex items-center gap-2 rounded-md px-2 py-1 cursor-pointer hover:bg-lightblue/5 transition-all duration-300">
                                    <input
                                        type="checkbox"
                                        checked={marcado}
                                        onChange={() => alternar(v.value)}
                                        className="accent-yellow"
                                    />
                                    <span
                                        className={`flex-1 text-sm truncate ${tierDe(v.count / total).color}`}
                                    >
                                        {v.value}
                                    </span>
                                    <span className="text-xs text-lightblue/50">
                                        {v.count}
                                    </span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export default function Explorador() {
    const { address } = useAccount();
    const apodos = useApodos();
    const [coleccion, setColeccion] = useState<Coleccion | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filtros, setFiltros] = useState<Filtros>(VACIOS);
    const [entrenando, setEntrenando] = useState<Map<number, number>>(
        new Map()
    );
    const [deWallet, setDeWallet] = useState<Set<number> | null>(null);
    const [pagina, setPagina] = useState(1);
    const [panelAbierto, setPanelAbierto] = useState(false);

    useEffect(() => {
        setFiltros(desdeUrl());
        setPagina(Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1));
        leerColeccion()
            .then(setColeccion)
            .catch((e) => setError(e.message));
        leerMapa()
            .then((periodos) => {
                const mapa = new Map<number, number>();
                for (const [dias, ids] of Object.entries(periodos)) {
                    for (const id of ids) mapa.set(Number(id), Number(dias));
                }
                setEntrenando(mapa);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!filtros.owner) return setDeWallet(null);
        setDeWallet(null);
        leerDe(filtros.owner)
            .then((ids) => setDeWallet(new Set(ids.map(Number))))
            .catch(() => setDeWallet(new Set()));
    }, [filtros.owner]);

    const cambiar = (cambio: Partial<Filtros>) => {
        const nuevos = { ...filtros, ...cambio };
        setFiltros(nuevos);
        setPagina(1);
        aUrl(nuevos);
    };

    const alternarTrait = (categoria: string, valor: string) => {
        const actuales = filtros.traits[categoria] ?? [];
        cambiar({
            traits: {
                ...filtros.traits,
                [categoria]: actuales.includes(valor)
                    ? actuales.filter((v) => v !== valor)
                    : [...actuales, valor],
            },
        });
    };

    const visibles = useMemo(() => {
        if (!coleccion) return [];
        const indices = coleccion.categories
            .map((c, i) => {
                const elegidos = filtros.traits[c.name];
                if (!elegidos?.length) return null;
                return {
                    i,
                    valores: new Set(
                        elegidos.map((v) =>
                            c.values.findIndex((x) => x.value === v)
                        )
                    ),
                };
            })
            .filter((x) => x !== null);
        const unico = coleccion.categories.findIndex((c) => c.name === UNICO);
        const busqueda = filtros.q.replace(/\D/g, '');

        const lista = coleccion.tokens.filter(([id, , valores]) => {
            if (busqueda && !String(id).startsWith(busqueda)) return false;
            if (filtros.owner && !deWallet?.has(id)) return false;
            if (filtros.unicos && (unico < 0 || valores[unico] < 0))
                return false;
            if (filtros.region && entrenando.get(id) !== filtros.region)
                return false;
            return indices.every(({ i, valores: v }) => v.has(valores[i]));
        });
        if (filtros.orden === 'rarity') lista.sort((a, b) => a[1] - b[1]);
        return lista;
    }, [coleccion, filtros, deWallet, entrenando]);

    const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
    const actual = Math.min(pagina, paginas);
    const irA = (n: number) => {
        setPagina(n);
        aUrl(filtros, n);
        scrollToTop();
    };

    const filtrosTraits = Object.entries(filtros.traits).flatMap(([c, vs]) =>
        vs.map((v) => [c, v])
    );
    const hayFiltros =
        filtros.q ||
        filtros.owner ||
        filtros.unicos ||
        filtros.region ||
        filtrosTraits.length > 0;
    const mia = address?.toLowerCase();

    const panel = coleccion && (
        <div className="flex flex-col">
            {coleccion.categories.map((c) => (
                <Categoria
                    key={c.name}
                    nombre={c.name}
                    valores={c.values}
                    total={coleccion.total}
                    elegidos={filtros.traits[c.name] ?? []}
                    alternar={(v) => alternarTrait(c.name, v)}
                />
            ))}
        </div>
    );

    return (
        <div className="flex flex-col gap-5 sm:gap-8">
            <div data-anim="reveal">
                <h1 className="font-accent uppercase text-yellow text-5xl sm:text-7xl lg:text-8xl">
                    Explore
                </h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    Every Primal in the cult: traits, rarity, who holds it and
                    where it is training.
                </p>
            </div>

            <div className={`${card} p-4 sm:p-5 flex flex-col gap-4`}>
                <div className="flex items-center gap-2">
                    <label className="relative flex-1 lg:max-w-xs">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-darkblue/60" />
                        <input
                            inputMode="numeric"
                            placeholder="Search by #"
                            value={filtros.q}
                            onChange={(e) => cambiar({ q: e.target.value })}
                            className={`${input} w-full pl-9`}
                        />
                    </label>
                    <div className="lg:hidden">
                        <Chip
                            activo={panelAbierto}
                            onClick={() => setPanelAbierto(!panelAbierto)}
                        >
                            <FiSliders className="w-4 h-4 relative top-[0.19em]" />
                            Traits
                            {filtrosTraits.length > 0 &&
                                ` (${filtrosTraits.length})`}
                        </Chip>
                    </div>
                </div>
                <div className="flex flex-col lg:flex-row lg:flex-wrap gap-4 lg:gap-x-10">
                    <Grupo titulo="Sort">
                        <Chip
                            activo={filtros.orden === 'id'}
                            onClick={() => cambiar({ orden: 'id' })}
                        >
                            By number
                        </Chip>
                        <Chip
                            activo={filtros.orden === 'rarity'}
                            onClick={() => cambiar({ orden: 'rarity' })}
                        >
                            By rarity
                        </Chip>
                    </Grupo>
                    <Grupo titulo="Show">
                        {mia && (
                            <Chip
                                activo={filtros.owner === mia}
                                onClick={() =>
                                    cambiar({
                                        owner:
                                            filtros.owner === mia ? null : mia,
                                    })
                                }
                            >
                                My Primals
                            </Chip>
                        )}
                        {filtros.owner && filtros.owner !== mia && (
                            <Chip
                                activo
                                onClick={() => cambiar({ owner: null })}
                            >
                                {nombreWallet(filtros.owner, apodos)}
                                <FiX className="w-4 h-4 relative top-[0.19em]" />
                            </Chip>
                        )}
                        <Chip
                            activo={filtros.unicos}
                            onClick={() => cambiar({ unicos: !filtros.unicos })}
                        >
                            1/1s
                        </Chip>
                    </Grupo>
                    <Grupo titulo="Training in">
                        {ZONAS.map((z) => (
                            <Chip
                                key={z.id}
                                color={z.color}
                                activo={filtros.region === z.days}
                                onClick={() =>
                                    cambiar({
                                        region:
                                            filtros.region === z.days
                                                ? null
                                                : z.days,
                                    })
                                }
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-full relative top-[0.19em]"
                                    style={{
                                        backgroundColor:
                                            filtros.region === z.days
                                                ? 'white'
                                                : z.color,
                                    }}
                                />
                                {z.nombre}
                            </Chip>
                        ))}
                    </Grupo>
                </div>
                {filtrosTraits.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        {filtrosTraits.map(([c, v]) => (
                            <button
                                key={`${c}:${v}`}
                                onClick={() => alternarTrait(c, v)}
                                className="flex items-center gap-1 rounded-md bg-lightblue/10 px-2 py-0.5 text-sm text-lightblue cursor-pointer hover:bg-red-400/20 transition-all duration-300"
                            >
                                <span className="text-lightblue/60">{c}:</span>{' '}
                                {v}
                                <FiX className="w-3.5 h-3.5" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex gap-5 sm:gap-8 items-start">
                <aside
                    className={`${card} hidden lg:block w-72 shrink-0 px-5 py-3 sticky top-32`}
                >
                    {panel}
                </aside>

                <div className="flex-1 min-w-0 flex flex-col gap-4">
                    {panelAbierto && (
                        <div className={`${card} lg:hidden px-5 py-3`}>
                            {panel}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3 text-lightblue">
                        <span>
                            {coleccion
                                ? filtros.owner && !deWallet
                                    ? 'Loading...'
                                    : `${visibles.length.toLocaleString('en-US')} Primals`
                                : ''}
                        </span>
                        {hayFiltros && (
                            <button
                                onClick={() => cambiar(VACIOS)}
                                className="text-sm text-lightblue/70 hover:text-yellow cursor-pointer transition-all duration-300"
                            >
                                Clear all
                            </button>
                        )}
                    </div>

                    {error && <p className="text-red-300">{error}</p>}
                    {!coleccion && !error && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                            {Array.from({ length: 15 }, (_, i) => (
                                <div
                                    key={i}
                                    className={`${card} aspect-4/5 animate-pulse`}
                                />
                            ))}
                        </div>
                    )}
                    {coleccion && coleccion.total === 0 && (
                        <p className="text-lightblue">
                            The collection is still being indexed. Come back in
                            a few minutes.
                        </p>
                    )}

                    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                        {visibles.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA).map(([id, rank]) => (
                            <li key={id}>
                                <Carta
                                    id={id}
                                    rank={rank}
                                    zona={ZONAS.find(
                                        (z) => z.days === entrenando.get(id)
                                    )}
                                />
                            </li>
                        ))}
                    </ul>
                    {paginas > 1 && (
                        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 font-accent uppercase text-sm text-lightblue mt-2">
                            <button
                                onClick={() => irA(actual - 1)}
                                disabled={actual === 1}
                                className="bg-lightblue text-darkblue rounded-md px-3 pb-1.5 cursor-pointer hover:bg-yellow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue transition-all duration-300"
                            >
                                Previous
                            </button>
                            <span>
                                Page {actual} of {paginas}
                            </span>
                            <button
                                onClick={() => irA(actual + 1)}
                                disabled={actual === paginas}
                                className="bg-lightblue text-darkblue rounded-md px-3 pb-1.5 cursor-pointer hover:bg-yellow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue transition-all duration-300"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
