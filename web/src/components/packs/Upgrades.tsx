import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import {
    CARTAS,
    ORDEN_RAREZAS,
    RAREZAS,
    SIGUIENTE,
    cartaPorId,
    repetidasDe,
    type ConfigPacks,
    type Rareza,
    type ResultadoUpgrade,
    type TipoUpgrade,
} from '@/lib/packs';
import { Frente } from './Carta';
import { despertar, sonar } from './sonidos';

const RAREZAS_UPGRADE = [...ORDEN_RAREZAS]
    .reverse()
    .filter((r) => r !== 'chosen');
const botonPrincipal =
    'mw-boton-brillo mw-titulo uppercase text-black text-lg rounded-md px-9 py-3 tracking-wider cursor-pointer hover:scale-105 active:scale-97 transition-all duration-300 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:opacity-40';
const pestana =
    'mw-titulo uppercase rounded-md px-3 py-1.5 tracking-wider cursor-pointer transition-all duration-300';

function falta(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const dos = (n: number) => String(n).padStart(2, '0');
    const d = Math.floor(s / 86400);
    const h = `${dos(Math.floor((s % 86400) / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
    return d ? `${d}d ${h}` : h;
}

export default function Upgrades({
    upgrades,
    coleccion,
    activo,
    onUpgrade,
    onListo,
}: {
    upgrades: NonNullable<ConfigPacks['upgrades']>;
    coleccion: Record<string, number>;
    activo: boolean;
    onUpgrade: (tipo: TipoUpgrade, cartas: number[]) => Promise<ResultadoUpgrade>;
    onListo: (resultado: ResultadoUpgrade) => void;
}) {
    const desde = Date.parse(upgrades.from);
    const [ahora, setAhora] = useState(() => Date.now());
    const [rareza, setRareza] = useState<Rareza>(
        () =>
            RAREZAS_UPGRADE.find((r) => repetidasDe(coleccion, r) > 0) ??
            'common'
    );
    const [modo, setModo] = useState<TipoUpgrade>('up');
    const [elegidas, setElegidas] = useState<number[]>([]);
    const [fusionando, setFusionando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mesa = useRef<HTMLDivElement>(null);
    const brillo = useRef<HTMLDivElement>(null);
    const casilleros = useRef<(HTMLButtonElement | null)[]>([]);
    const bloqueado = desde > ahora;

    useEffect(() => {
        if (!bloqueado) return;
        const t = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(t);
    }, [bloqueado]);

    const sube = SIGUIENTE[rareza] ? (upgrades.tradeUp[rareza] ?? 0) : 0;
    const canje = upgrades.swap[rareza] ?? 0;
    const tipo: TipoUpgrade | null =
        modo === 'up' && sube ? 'up' : canje ? 'swap' : sube ? 'up' : null;
    const destino = tipo === 'up' ? SIGUIENTE[rareza]! : rareza;
    const necesita = tipo === 'up' ? sube : canje;
    const faltanDestino = CARTAS.filter(
        (c) => c.rareza === destino && !coleccion[c.id]
    ).length;
    const disponibles = CARTAS.filter(
        (c) => c.rareza === rareza && (coleccion[c.id] ?? 0) > 1
    );
    const usadas = (id: number) => elegidas.filter((x) => x === id).length;
    const libres = (id: number) =>
        Math.max(0, (coleccion[id] ?? 0) - 1 - usadas(id));
    const lleno = elegidas.length >= necesita;
    const sinFaltantes = tipo === 'swap' && faltanDestino === 0;

    const cambiarRareza = (r: Rareza) => {
        if (fusionando) return;
        setRareza(r);
        setElegidas([]);
        setError(null);
    };
    const cambiarModo = (m: TipoUpgrade) => {
        if (fusionando) return;
        setModo(m);
        setElegidas([]);
        setError(null);
    };
    const agregar = (id: number) => {
        if (fusionando || lleno || !libres(id)) return;
        despertar();
        sonar('elegir');
        setElegidas([...elegidas, id]);
    };
    const quitar = (i: number) => {
        if (fusionando) return;
        despertar();
        sonar('quitar');
        setElegidas(elegidas.filter((_, j) => j !== i));
    };
    const llenar = () => {
        if (fusionando) return;
        const quedan = Object.fromEntries(
            disponibles.map((c) => [c.id, libres(c.id)])
        );
        const nuevas = [...elegidas];
        while (nuevas.length < necesita) {
            const id = disponibles
                .map((c) => c.id)
                .filter((x) => quedan[x] > 0)
                .sort((a, b) => quedan[b] - quedan[a])[0];
            if (id === undefined) break;
            quedan[id]--;
            nuevas.push(id);
        }
        if (nuevas.length > elegidas.length) {
            despertar();
            sonar('elegir');
        }
        setElegidas(nuevas);
    };

    const confirmar = async () => {
        if (!tipo || !lleno || fusionando) return;
        despertar();
        setError(null);
        setFusionando(true);
        const fichas = casilleros.current
            .slice(0, elegidas.length)
            .filter(Boolean) as HTMLButtonElement[];
        const caja = mesa.current!.getBoundingClientRect();
        const cx = caja.left + caja.width / 2;
        const cy = caja.top + caja.height / 2;
        const suave = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const animacion = new Promise<void>((listo) => {
            const tl = gsap.timeline({ onComplete: listo });
            const paso = suave ? 0 : Math.min(0.16, 1.2 / fichas.length);
            fichas.forEach((ficha, i) => {
                const r = ficha.getBoundingClientRect();
                tl.to(
                    ficha,
                    {
                        x: cx - (r.left + r.width / 2),
                        y: cy - (r.top + r.height / 2),
                        rotation: gsap.utils.random(-14, 14),
                        scale: 0.9,
                        zIndex: i + 1,
                        duration: suave ? 0.01 : 0.38,
                        ease: 'power3.in',
                    },
                    i * paso
                );
                if (!suave)
                    sonar('apilar', i * paso + 0.38, 0.95 + (0.3 * i) / Math.max(1, fichas.length - 1));
            });
            sonar('fusionar', tl.duration() + 0.05);
            tl.to({}, { duration: 0.05 })
                .to(brillo.current, { opacity: 1, scale: 1.4, duration: 0.18 })
                .set(fichas, { opacity: 0 })
                .to(brillo.current, { opacity: 0, scale: 2, duration: 0.45 });
        });
        try {
            const [resultado] = await Promise.all([
                onUpgrade(tipo, elegidas),
                animacion,
            ]);
            setElegidas([]);
            onListo(resultado);
        } catch (e) {
            await animacion;
            setError((e as Error).message);
        } finally {
            gsap.set(fichas, { clearProps: 'all' });
            gsap.set(brillo.current, { opacity: 0, scale: 1 });
            setFusionando(false);
        }
    };

    const ayuda = bloqueado
        ? 'Keep your duplicates until then'
        : !activo
          ? 'Sign in to upgrade'
          : sinFaltantes
            ? `You already have every ${RAREZAS[destino].nombre}`
            : !lleno
              ? `Pick ${necesita - elegidas.length} more`
              : null;

    return (
        <section className="mw-marco rounded-xl bg-black/70 p-5 sm:p-6 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h2 className="mw-titulo uppercase text-mw-champagne text-xl sm:text-2xl">
                        Upgrade duplicates
                    </h2>
                    <p className="text-lg text-mw-mist/75 mt-1 max-w-2xl">
                        Pick duplicates of one rarity and trade them up for a
                        rarer card, or swap them for one you’re missing. You
                        get a card you don’t have yet whenever one is left,
                        and upgrades don’t add points.
                    </p>
                </div>
                {bloqueado && (
                    <p className="mw-etiqueta text-sm text-mw-champagne shrink-0">
                        Unlocks in{' '}
                        <span className="tabular-nums">
                            {falta(desde - ahora)}
                        </span>
                    </p>
                )}
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] gap-6">
                <div className="flex flex-col gap-4 min-w-0">
                    <div className="flex flex-wrap gap-2">
                        {RAREZAS_UPGRADE.map((r) => {
                            const n = repetidasDe(coleccion, r);
                            return (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => cambiarRareza(r)}
                                    className={`${pestana} ${r === rareza ? 'bg-mw-champagne text-black' : 'border border-mw-champagne/30 text-mw-fog hover:text-mw-champagne hover:border-mw-champagne'}`}
                                >
                                    {RAREZAS[r].nombre}{' '}
                                    <span className="tabular-nums">{n}</span>
                                </button>
                            );
                        })}
                    </div>
                    {disponibles.length === 0 ? (
                        <p className="text-lg text-mw-mist/70 py-6">
                            No duplicate {RAREZAS[rareza].nombre} cards yet.
                            Duplicates show up here as you rip packs.
                        </p>
                    ) : (
                        <div
                            data-lenis-prevent
                            className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6 gap-3 max-h-120 overflow-y-auto overscroll-contain -mx-5 sm:-mx-6 -mt-8 -mb-5 sm:-mb-6 px-5 sm:px-6 pt-12 pb-5 sm:pb-6 scrollbar-thin [scrollbar-color:var(--color-mw-champagne)_transparent]"
                        >
                            {disponibles.map((c) => {
                                const quedan = libres(c.id);
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => agregar(c.id)}
                                        disabled={!quedan || lleno || fusionando}
                                        aria-label={`Add ${c.nombre}`}
                                        className="relative aspect-1621/2250 cursor-pointer hover:-translate-y-1 hover:scale-103 active:scale-97 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:opacity-40 transition-all duration-300"
                                    >
                                        <Frente carta={c} chica />
                                        <span className="absolute -top-2 -right-2 mw-titulo text-xs bg-mw-champagne text-black rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center tabular-nums">
                                            ×{quedan}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="rounded-lg border border-mw-champagne/25 p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-2">
                        {(['up', 'swap'] as const).map((m) => {
                            const posible = m === 'up' ? sube > 0 : canje > 0;
                            return (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => cambiarModo(m)}
                                    disabled={!posible}
                                    className={`${pestana} disabled:opacity-30 disabled:cursor-not-allowed ${tipo === m ? 'bg-mw-champagne text-black' : 'border border-mw-champagne/30 text-mw-fog hover:text-mw-champagne hover:border-mw-champagne'}`}
                                >
                                    {m === 'up' ? 'Trade up' : 'Swap'}
                                </button>
                            );
                        })}
                    </div>
                    {tipo ? (
                        <p className="text-mw-mist text-center">
                            {necesita} {RAREZAS[rareza].nombre} →{' '}
                            <span className="text-mw-champagne">
                                1 {RAREZAS[destino].nombre}
                            </span>
                            {faltanDestino > 0
                                ? ' you’re missing'
                                : tipo === 'up'
                                  ? ' (you have them all: a random one)'
                                  : ''}
                        </p>
                    ) : (
                        <p className="text-mw-fog text-center">
                            {RAREZAS[rareza].nombre} cards can’t be upgraded.
                        </p>
                    )}
                    <div ref={mesa} className="relative">
                        <div
                            ref={brillo}
                            className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 bg-[radial-gradient(circle,rgb(255_246_200/0.95),rgb(174_163_93/0.4)_45%,transparent_70%)] z-10"
                        />
                        <div className="grid grid-cols-5 gap-2">
                            {Array.from({ length: necesita }, (_, i) => {
                                const id = elegidas[i];
                                return id === undefined ? (
                                    <div
                                        key={i}
                                        className="aspect-1621/2250 rounded-[5%/3.6%] border border-dashed border-mw-champagne/50 bg-mw-champagne/5"
                                    />
                                ) : (
                                    <button
                                        key={i}
                                        ref={(el) => {
                                            casilleros.current[i] = el;
                                        }}
                                        type="button"
                                        onClick={() => quitar(i)}
                                        aria-label={`Remove ${cartaPorId(id).nombre}`}
                                        className="relative aspect-1621/2250 cursor-pointer hover:opacity-70 active:scale-97 transition-all duration-300"
                                    >
                                        <Frente carta={cartaPorId(id)} chica />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm uppercase tracking-wider">
                        <span className="text-mw-fog tabular-nums">
                            {elegidas.length}/{necesita} selected
                        </span>
                        <span className="flex gap-4">
                            <button
                                type="button"
                                onClick={llenar}
                                disabled={lleno || fusionando || !disponibles.length}
                                className="text-mw-champagne cursor-pointer hover:text-mw-mist disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300"
                            >
                                Fill
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    despertar();
                                    sonar('quitar');
                                    setElegidas([]);
                                }}
                                disabled={!elegidas.length || fusionando}
                                className="text-mw-champagne cursor-pointer hover:text-mw-mist disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300"
                            >
                                Clear
                            </button>
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={confirmar}
                        disabled={
                            !tipo ||
                            !lleno ||
                            fusionando ||
                            bloqueado ||
                            !activo ||
                            sinFaltantes
                        }
                        className={`${botonPrincipal} self-center`}
                    >
                        <span className="mw-boton-reflejo" aria-hidden="true" />
                        <span className="relative">
                            {fusionando
                                ? 'Upgrading...'
                                : tipo === 'swap'
                                  ? 'Swap'
                                  : 'Trade up'}
                        </span>
                    </button>
                    {(error || ayuda) && (
                        <p
                            className={`text-center ${error ? 'text-mw-champagne text-lg' : 'text-mw-fog'}`}
                        >
                            {error ?? ayuda}
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
