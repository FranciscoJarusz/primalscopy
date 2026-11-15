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
const boton =
    'mw-boton-brillo mw-titulo uppercase text-black rounded-md tracking-wider cursor-pointer hover:scale-105 active:scale-97 transition-all duration-300 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:opacity-40';
const pestana =
    'mw-titulo uppercase rounded-md px-3 py-1.5 tracking-wider cursor-pointer transition-all duration-300';
const enlace =
    'text-mw-champagne cursor-pointer hover:text-mw-mist disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300';

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
    const mesaPanel = useRef<HTMLDivElement>(null);
    const mesaBarra = useRef<HTMLDivElement>(null);
    const zona = useRef<HTMLDivElement>(null);
    const [enVista, setEnVista] = useState(false);
    const bloqueado = desde > ahora;

    useEffect(() => {
        if (!bloqueado) return;
        const t = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(t);
    }, [bloqueado]);

    useEffect(() => {
        const el = zona.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) =>
            setEnVista(e.isIntersecting)
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

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
    const nada = !tipo || sinFaltantes;
    const aviso = !tipo
        ? `${RAREZAS[rareza].nombre} cards can’t be upgraded.`
        : sinFaltantes
          ? `You already have every ${RAREZAS[destino].nombre}.`
          : null;

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
        if (fusionando || nada || lleno || !libres(id)) return;
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
        if (fusionando || nada) return;
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
        if (nada || !lleno || fusionando) return;
        despertar();
        setError(null);
        setFusionando(true);
        const mesa = mesaPanel.current?.offsetParent
            ? mesaPanel.current
            : mesaBarra.current!;
        const brillo = mesa.querySelector<HTMLElement>('[data-brillo]');
        const fichas = [
            ...mesa.querySelectorAll<HTMLElement>('[data-casillero]'),
        ];
        const caja = mesa.getBoundingClientRect();
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
                .to(brillo, { opacity: 1, scale: 1.4, duration: 0.18 })
                .set(fichas, { opacity: 0 })
                .to(brillo, { opacity: 0, scale: 2, duration: 0.45 });
        });
        try {
            const [resultado] = await Promise.all([
                onUpgrade(tipo!, elegidas),
                animacion,
            ]);
            setElegidas([]);
            onListo(resultado);
        } catch (e) {
            await animacion;
            setError((e as Error).message);
        } finally {
            gsap.set(fichas, { clearProps: 'transform,opacity,zIndex' });
            gsap.set(brillo, { opacity: 0, scale: 1 });
            setFusionando(false);
        }
    };

    const ayuda = bloqueado
        ? 'Keep your duplicates until then'
        : nada
          ? null
          : !activo
            ? 'Sign in to upgrade'
            : !lleno
              ? `Pick ${necesita - elegidas.length} more`
              : null;
    const sePuede = !nada && lleno && !fusionando && !bloqueado && activo;
    const textoBoton = fusionando
        ? 'Upgrading...'
        : tipo === 'swap'
          ? 'Swap'
          : 'Trade up';

    const modos = (
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
    );

    const receta = tipo && (
        <div className="flex flex-col items-center gap-0.5 text-center">
            <p className="mw-titulo uppercase tracking-wider text-base sm:text-lg text-mw-mist">
                <span className="tabular-nums">{necesita}</span> ×{' '}
                {RAREZAS[rareza].nombre}
                <span className="text-mw-fog mx-2">→</span>
                <span className="text-mw-champagne whitespace-nowrap">
                    1 {RAREZAS[destino].nombre}
                </span>
            </p>
            <p className="text-mw-fog">
                {faltanDestino > 0
                    ? 'You get one you’re missing'
                    : tipo === 'up'
                      ? 'Random, you already have them all'
                      : ''}
            </p>
        </div>
    );

    const mazo = (chico: boolean) => {
        const ancho = chico ? '2.4rem' : '4.75rem';
        const pasos = Math.max(1, necesita - 1);
        return (
            <div
                className="relative flex items-center justify-center"
                style={{ height: `calc(${ancho} * 1.388 + ${chico ? 8 : 20}px)` }}
            >
                {elegidas.length === 0 ? (
                    <div
                        className="aspect-1621/2250 rounded-[5%/3.6%] border border-dashed border-mw-champagne/50 bg-mw-champagne/5 flex items-center justify-center"
                        style={{ width: ancho }}
                    >
                        {!chico && (
                            <span className="mw-titulo text-2xl text-mw-champagne/60 tabular-nums">
                                {necesita}
                            </span>
                        )}
                    </div>
                ) : (
                    elegidas.map((id, i) => {
                        const centro = (elegidas.length - 1) / 2;
                        return (
                            <div
                                key={i}
                                className="shrink-0 transition-all duration-300"
                                style={{
                                    width: ancho,
                                    marginLeft: i
                                        ? `calc(min(${ancho} * 0.72, (100% - ${ancho} * 1.35) / ${pasos}) - ${ancho})`
                                        : 0,
                                    transform: `rotate(${(i - centro) * (chico ? 3 : 4)}deg) translateY(${Math.abs(i - centro) * (chico ? 0.6 : 1.5)}px)`,
                                    zIndex: i,
                                }}
                            >
                                <button
                                    data-casillero
                                    type="button"
                                    onClick={() => quitar(i)}
                                    aria-label={`Remove ${cartaPorId(id).nombre}`}
                                    className="relative block w-full aspect-1621/2250 cursor-pointer hover:-translate-y-2 active:scale-97 transition-all duration-300"
                                >
                                    <Frente carta={cartaPorId(id)} chica />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        );
    };

    const brillo = (
        <div
            data-brillo
            className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 bg-[radial-gradient(circle,rgb(255_246_200/0.95),rgb(174_163_93/0.4)_45%,transparent_70%)] z-30"
        />
    );

    const progreso = (
        <div className="h-1 rounded-full bg-mw-champagne/15 overflow-hidden">
            <div
                className="h-full bg-mw-champagne transition-all duration-300"
                style={{
                    width: `${necesita ? (elegidas.length / necesita) * 100 : 0}%`,
                }}
            />
        </div>
    );

    const contador = (
        <span className="text-mw-mist tabular-nums">
            {elegidas.length}
            <span className="text-mw-fog">/{necesita}</span>
        </span>
    );

    const llenarBoton = (
        <button
            type="button"
            onClick={llenar}
            disabled={nada || lleno || fusionando || !disponibles.length}
            className={enlace}
        >
            Fill
        </button>
    );

    const limpiarBoton = (
        <button
            type="button"
            onClick={() => {
                despertar();
                sonar('quitar');
                setElegidas([]);
            }}
            disabled={!elegidas.length || fusionando}
            className={enlace}
        >
            Clear
        </button>
    );

    const mensaje = (error || ayuda) && (
        <p
            className={`text-center ${error ? 'text-mw-champagne' : 'text-mw-fog'}`}
        >
            {error ?? ayuda}
        </p>
    );

    const barraVisible = enVista && disponibles.length > 0;

    return (
        <section className="mw-marco rounded-xl bg-black/70 p-5 sm:p-8 flex flex-col gap-6 sm:gap-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h2 className="mw-titulo uppercase text-mw-champagne text-2xl sm:text-3xl">
                        Upgrade duplicates
                    </h2>
                    <p className="text-lg text-mw-mist/75 mt-2 max-w-2xl">
                        Trade duplicates for a rarer card, or swap them for one
                        you’re missing. Upgrades don’t add points.
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

            <div className="grid lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_25rem] gap-6 lg:gap-10">
                <div ref={zona} className="flex flex-col gap-5 min-w-0">
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                        {RAREZAS_UPGRADE.map((r) => {
                            const n = repetidasDe(coleccion, r);
                            const elegida = r === rareza;
                            return (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => cambiarRareza(r)}
                                    className={`flex flex-col items-center justify-center gap-1 rounded-md py-2 sm:py-3 cursor-pointer transition-all duration-300 ${elegida ? 'bg-mw-champagne text-black' : `border border-mw-champagne/30 hover:border-mw-champagne ${n ? 'text-mw-mist hover:text-mw-champagne' : 'text-mw-fog/60'}`}`}
                                >
                                    <span className="sm:hidden uppercase text-xs leading-none">
                                        {RAREZAS[r].nombre}
                                    </span>
                                    <span className="hidden sm:inline mw-etiqueta text-[11px] leading-none">
                                        {RAREZAS[r].nombre}
                                    </span>
                                    <span className="mw-titulo text-lg sm:text-2xl leading-none tabular-nums">
                                        {n}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="lg:hidden flex flex-col gap-3">
                        {modos}
                        {receta}
                    </div>
                    {aviso && disponibles.length > 0 && (
                        <p className="text-lg text-mw-champagne text-center lg:text-left">
                            {aviso}
                        </p>
                    )}
                    {disponibles.length === 0 ? (
                        <p className="text-lg text-mw-mist/70 py-10 text-center">
                            No duplicate {RAREZAS[rareza].nombre} cards yet.
                            Duplicates show up here as you rip packs.
                        </p>
                    ) : (
                        <div
                            data-lenis-prevent
                            className="grid grid-cols-3 min-[480px]:grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-5 sm:gap-x-5 sm:gap-y-6 pt-2 max-lg:pb-28 lg:max-h-140 lg:overflow-y-auto lg:overscroll-contain lg:-mx-3 lg:px-3 lg:pt-3 lg:pb-3 scrollbar-thin [scrollbar-color:var(--color-mw-champagne)_transparent]"
                        >
                            {disponibles.map((c) => {
                                const quedan = libres(c.id);
                                const usada = usadas(c.id) > 0;
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => agregar(c.id)}
                                        disabled={
                                            nada || !quedan || lleno || fusionando
                                        }
                                        aria-label={`Add ${c.nombre}`}
                                        className={`relative aspect-1621/2250 rounded-[5%/3.6%] cursor-pointer hover:-translate-y-1 hover:scale-103 active:scale-97 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100 transition-all duration-300 ${quedan || usada ? '' : 'opacity-35'} ${usada ? 'ring-2 ring-mw-champagne ring-offset-2 ring-offset-black' : ''}`}
                                    >
                                        <Frente carta={c} chica />
                                        <span className="absolute -top-2 -right-2 mw-titulo text-xs bg-mw-champagne text-black rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center tabular-nums shadow-[0_0_0_3px_rgb(0_0_0/0.85)]">
                                            ×{quedan}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="hidden lg:block">
                    <div className="sticky top-24 rounded-lg border border-mw-champagne/25 bg-black/40 p-6 flex flex-col gap-6">
                        {modos}
                        {receta}
                        <div ref={mesaPanel} className="relative py-2">
                            {brillo}
                            {mazo(false)}
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-sm uppercase tracking-wider">
                                {contador}
                                <span className="flex gap-4">
                                    {llenarBoton}
                                    {limpiarBoton}
                                </span>
                            </div>
                            {progreso}
                        </div>
                        <button
                            type="button"
                            onClick={confirmar}
                            disabled={!sePuede}
                            className={`${boton} text-lg py-3 w-full`}
                        >
                            <span className="mw-boton-reflejo" aria-hidden="true" />
                            <span className="relative">{textoBoton}</span>
                        </button>
                        {mensaje}
                    </div>
                </div>
            </div>

            {disponibles.length > 0 && (
                <div
                    aria-hidden={!barraVisible}
                    className={`lg:hidden mw-texto fixed inset-x-0 bottom-0 z-50 border-t border-mw-champagne/30 bg-black/95 backdrop-blur-sm px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2.5 transition-all duration-300 ${barraVisible ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
                >
                    <div className="flex items-center gap-3">
                        <div ref={mesaBarra} className="relative flex-1 min-w-0">
                            {brillo}
                            {mazo(true)}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 text-sm uppercase tracking-wider shrink-0">
                            {contador}
                            <span className="flex gap-3">
                                {llenarBoton}
                                {limpiarBoton}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={confirmar}
                            disabled={!sePuede}
                            className={`${boton} text-base px-5 py-2.5 shrink-0`}
                        >
                            <span className="mw-boton-reflejo" aria-hidden="true" />
                            <span className="relative">{textoBoton}</span>
                        </button>
                    </div>
                    {progreso}
                    {mensaje && <div className="text-sm">{mensaje}</div>}
                </div>
            )}
        </section>
    );
}
