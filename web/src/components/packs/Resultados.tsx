import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { walletCorta } from '@/lib/nicknames';
import { crearTic, prepararAudio, sonarPremio } from '@/components/shared/sonidosRuleta';
import { sonidoActivo } from './sonidos';
import { MARCA, type MiPacks, type PremioGanado, type Ranking, type SorteoPacks, type TipoSorteo } from '@/lib/packs';

const EXPLORADOR = 'https://apechain.calderaexplorer.xyz';
const ANCHO = 150;
const PASO = ANCHO + 10;
const CARTAS = 44;
const GANADORA = 36;
const DURACION = 5500;
const INICIO = 3 * PASO + ANCHO / 2;
export const TIPOS: TipoSorteo[] = ['chosen', 'collection'];

const NOMBRES: Record<TipoSorteo, string> = {
    get chosen() {
        return `${MARCA.especial ?? 'The Chosen'} raffle`;
    },
    collection: 'Full collection raffle',
};
const QUIENES: Record<TipoSorteo, string> = {
    get chosen() {
        return `Everyone who pulled ${MARCA.especial ?? 'The Chosen'}`;
    },
    collection: 'Everyone who completed the collection',
};

const puesto = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const nombre = (p: { wallet: string; nickname: string | null }) => p.nickname ?? walletCorta(p.wallet);
const entradas = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
const ganadorDe = (s: SorteoPacks) => s.entrants.find((e) => e.wallet === s.winner);

export const vaPorSolana = (p: PremioGanado) => MARCA.solana && (p.kind !== 'rank' || /mudwater/i.test(p.prize));

function destino(p: PremioGanado) {
    const solana = vaPorSolana(p);
    const primals = /primal/i.test(p.prize);
    if (solana && primals) return 'Mudwater prize on Solana, Primals on ApeChain';
    return solana ? 'Sent on Solana' : 'Sent to this ApeChain wallet';
}

function textoPremio(p: PremioGanado) {
    if (p.kind === 'rank') return `${puesto(p.place)} place · ${p.prize}`;
    return `${NOMBRES[p.kind]} · ${p.prize}`;
}

const ETIQUETAS = '#CultNeverDies #PrimalCult @primal_cult';
const enlace = 'text-mw-champagne underline underline-offset-4 hover:text-mw-mist transition-all duration-300';
const botonX =
    'flex items-center justify-center mw-titulo uppercase text-base text-center rounded-md px-4 py-2.5 tracking-wider border border-mw-champagne text-mw-champagne cursor-pointer hover:bg-mw-champagne hover:text-black active:scale-97 transition-all duration-300';
const botonCerrar =
    'flex items-center justify-center mw-boton-brillo mw-titulo uppercase text-black text-base rounded-md border border-transparent px-4 py-2.5 tracking-wider cursor-pointer hover:scale-105 active:scale-97 transition-all duration-300';

function enlaceX(texto: string) {
    const tweet = new URL('https://x.com/intent/tweet');
    tweet.searchParams.set('text', `${texto}

${window.location.origin}${MARCA.ruta}

${ETIQUETAS}`);
    return tweet.href;
}

function Marco({
    titulo,
    etiqueta = MARCA.nombre,
    compartir,
    sinBotones = false,
    tituloAnimado = false,
    demoraBotones,
    onCerrar,
    children,
}: {
    titulo: string;
    etiqueta?: string;
    compartir?: string | null;
    sinBotones?: boolean;
    tituloAnimado?: boolean;
    demoraBotones?: string;
    onCerrar: () => void;
    children: ReactNode;
}) {
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [onCerrar]);

    return createPortal(
        <div
            onClick={onCerrar}
            className="mw-texto fixed inset-0 z-70 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-aparece"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="packs-resultados"
                onClick={(e) => e.stopPropagation()}
                className="mw-marco relative w-full max-w-xl max-h-[96dvh] flex flex-col rounded-xl bg-black py-3 text-mw-mist"
            >
                <div
                    data-lenis-prevent
                    className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3 sm:px-8 sm:py-5 flex flex-col gap-4.5 sm:gap-6 scrollbar-thin [scrollbar-color:var(--color-mw-champagne)_transparent]"
                >
                    <div className="text-center">
                        <p className={`mw-etiqueta text-xs sm:text-sm text-mw-fog ${tituloAnimado ? 'res-baja' : ''}`}>{etiqueta}</p>
                        <h2 key={titulo} id="packs-resultados" className={`mw-titulo uppercase text-3xl sm:text-4xl leading-none mw-brass-texto mt-2 ${tituloAnimado ? 'res-brilla-texto' : ''}`} style={tituloAnimado ? { animationDelay: '.12s, .9s' } : undefined}>
                            {titulo}
                        </h2>
                    </div>
                    {children}
                    <div
                        className={`grid gap-3 w-full self-center ${sinBotones ? 'hidden' : ''} ${demoraBotones ? 'res-sube' : ''} ${compartir ? 'grid-cols-2 max-w-sm' : 'max-w-44'}`}
                        style={demoraBotones ? { animationDelay: demoraBotones } : undefined}
                    >
                        {compartir && (
                            <a href={compartir} target="_blank" rel="noopener" className={botonX}>
                                Share on X
                            </a>
                        )}
                        <button type="button" onClick={onCerrar} className={botonCerrar}>
                            <span className="mw-boton-reflejo" aria-hidden="true" />
                            <span className="relative">Close</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function Premios({
    premios,
    formulario,
    titulo = 'You won',
    demora,
}: {
    premios: PremioGanado[];
    formulario?: ReactNode;
    titulo?: string | false;
    demora?: number;
}) {
    const paso = (i: number) => (demora === undefined ? undefined : { animationDelay: `${demora + 0.25 + i * 0.18}s` });
    return (
        <section className="rounded-lg border border-mw-especial/50 bg-mw-especial/8 px-4 py-4 sm:px-5 flex flex-col gap-4">
            <div>
                {titulo && <h3 className="mw-titulo uppercase text-xl text-mw-especial mb-2.5">{titulo}</h3>}
                <ul className="flex flex-col gap-2.5">
                    {premios.map((p, i) => (
                        <li key={i} className={`flex gap-2.5 items-baseline text-lg ${demora !== undefined ? 'res-sube' : ''}`} style={paso(i)}>
                            <span
                                className={`size-2 shrink-0 rotate-45 bg-mw-especial relative -top-0.5 ${demora !== undefined ? 'res-rombo' : ''}`}
                                style={paso(i)}
                                aria-hidden="true"
                            />
                            <span>
                                {textoPremio(p)}
                                <span className="block text-base text-mw-mist/60">{destino(p)}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
            {premios.some(vaPorSolana) && (
                <div className={demora !== undefined ? 'res-sube' : ''} style={paso(premios.length)}>
                    {formulario}
                </div>
            )}
        </section>
    );
}

export function FinEvento({
    ranking,
    mio,
    formulario,
    sinRevelar = [],
    onCerrar,
}: {
    ranking: Ranking;
    mio: MiPacks;
    formulario?: ReactNode;
    sinRevelar?: TipoSorteo[];
    onCerrar: () => void;
}) {
    const premios = (mio.prizes ?? []).filter((p) => p.kind === 'rank' || !sinRevelar.includes(p.kind));
    const sorteos = TIPOS.filter(
        (k) => mio.raffles?.[k] && ranking.raffles?.[k] && (mio.raffles[k] !== 'won' || sinRevelar.includes(k))
    );

    const puestoPremiado = premios.find((p) => p.kind === 'rank');
    const medalla = useRef<HTMLDivElement>(null);
    const [origen, setOrigen] = useState<{ x: number; y: number } | null>(null);
    useEffect(() => {
        if (!puestoPremiado) return;
        if (sonidoActivo() && navigator.userActivation?.hasBeenActive) prepararAudio();
        const t = setTimeout(() => {
            const r = medalla.current?.getBoundingClientRect();
            if (r) setOrigen({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            if (sonidoActivo() && navigator.userActivation?.hasBeenActive) sonarPremio(0.01);
        }, 590);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const texto = premios.length
        ? `I won in the ${MARCA.nombreX} pack competition 🏆
${premios.map((p) => `• ${textoPremio(p)}`).join('\n')}`
        : `Finished #${mio.rank} of ${ranking.players} in the ${MARCA.nombreX} pack competition with ${mio.points.toLocaleString('en-US')} points 🃏`;

    return (
        <Marco
            titulo={puestoPremiado ? `You finished #${mio.rank}!` : 'Competition over'}
            etiqueta={puestoPremiado ? 'Competition over' : undefined}
            tituloAnimado={!!puestoPremiado}
            demoraBotones={puestoPremiado ? '2.2s' : undefined}
            compartir={mio.rank ? enlaceX(texto) : null}
            onCerrar={onCerrar}
        >
            <style>{CSS_SORTEO}</style>
            {origen && <Confeti x={origen.x} y={origen.y} />}
            {puestoPremiado ? (
                <div className="flex flex-col items-center gap-2.5">
                    <div className="relative grid place-items-center [perspective:600px]">
                        <div
                            className="res-rayos pointer-events-none absolute size-36 rounded-full mw-rayos"
                            style={{ animationDelay: '0s, .5s', maskImage: 'radial-gradient(circle, black 30%, transparent 70%)' }}
                        />
                        <div ref={medalla} className="res-moneda relative" style={{ animationDelay: '.1s' }}>
                            <div className="res-aura size-22 rounded-full p-[3px] bg-[linear-gradient(135deg,#efe7bd,#aea35d_55%,#d2c688)]">
                                <div className="size-full rounded-full bg-black grid place-items-center">
                                    <span className="mw-titulo text-4xl mw-brass-texto tabular-nums">#{mio.rank}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {mio.rank === 1 && MARCA.mudwater && (
                        <img
                            src="/packs/mudlogo.webp"
                            alt="Mudwater"
                            className="res-sube h-7 w-auto drop-shadow-[0_0_12px_rgb(174_163_93/0.35)]"
                            style={{ animationDelay: '.75s' }}
                        />
                    )}
                    <p className="res-sube text-mw-mist/70 tabular-nums" style={{ animationDelay: '.85s' }}>
                        <Contador hasta={mio.points} demora={900} /> points · {ranking.players} players
                    </p>
                </div>
            ) : (
            <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                    <p className="mw-etiqueta text-[10px] text-mw-fog">Final rank</p>
                    <p className="mw-titulo text-3xl text-mw-mist mt-1 tabular-nums">
                        {mio.rank ? `#${mio.rank}` : '—'}
                        <span className="text-mw-fog text-xl"> / {ranking.players}</span>
                    </p>
                </div>
                <div>
                    <p className="mw-etiqueta text-[10px] text-mw-fog">Points</p>
                    <p className="mw-titulo text-3xl text-mw-mist mt-1 tabular-nums">{mio.points.toLocaleString('en-US')}</p>
                </div>
            </div>
            )}

            {premios.length > 0 && (
                <div className={puestoPremiado ? 'res-sube' : ''} style={{ animationDelay: '1.2s' }}>
                    <Premios
                        premios={premios}
                        formulario={formulario}
                        demora={puestoPremiado ? 1.2 : undefined}
                        titulo={puestoPremiado ? (premios.length > 1 ? 'Your prizes' : 'Your prize') : 'You won'}
                    />
                </div>
            )}

            {sorteos.length > 0 && (
                <section className={`flex flex-col gap-2.5 ${puestoPremiado ? 'res-sube' : ''}`} style={{ animationDelay: '1.9s' }}>
                    <h3 className="mw-titulo uppercase text-mw-champagne text-lg">Your raffles</h3>
                    <ul className="flex flex-col gap-2.5">
                        {sorteos.map((k) => {
                            const s = ranking.raffles![k];
                            const ganador = ganadorDe(s);
                            return (
                                <li key={k} className="rounded-lg border border-mw-champagne/25 px-4 py-2.5">
                                    <p className="mw-titulo uppercase text-mw-champagne">{NOMBRES[k]}</p>
                                    <p className="mt-1 text-mw-mist/75 leading-snug">
                                        {sinRevelar.includes(k)
                                            ? `It's been drawn among ${entradas(s.entrants.length)}. Close this to see who won the ${s.prize}.`
                                            : s.status === 'drawn'
                                            ? mio.raffles?.[k] === 'won'
                                                ? `You won it: ${s.prize}.`
                                                : `${ganador ? nombre(ganador) : 'Someone else'} won the ${s.prize}. You were one of ${entradas(s.entrants.length)}.`
                                            : `You're in for the ${s.prize} · ${entradas(s.entrants.length)} · drawn soon`}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <p className={`text-center ${puestoPremiado ? 'res-sube' : ''}`} style={{ animationDelay: '2.05s' }}>
                <a href="#raffles" onClick={onCerrar} className={enlace}>
                    See the leaderboard and raffles
                </a>
            </p>
        </Marco>
    );
}

function Contador({ hasta, demora }: { hasta: number; demora: number }) {
    const [valor, setValor] = useState(0);
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setValor(hasta);
            return;
        }
        let raf = 0;
        const inicio = performance.now() + demora;
        const correr = (ahora: number) => {
            const p = Math.min(1, Math.max(0, (ahora - inicio) / 1100));
            setValor(Math.round(hasta * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf = requestAnimationFrame(correr);
        };
        raf = requestAnimationFrame(correr);
        return () => cancelAnimationFrame(raf);
    }, [hasta, demora]);
    return <>{valor.toLocaleString('en-US')}</>;
}

const CSS_SORTEO = `
@keyframes res-confeti { 0% { translate: 0 0; rotate: 0deg; opacity: 1 } 100% { translate: var(--dx) var(--dy); rotate: var(--giro); opacity: 0 } }
@keyframes res-pop { 0% { scale: .3; opacity: 0 } 60% { scale: 1.15; opacity: 1 } 100% { scale: 1 } }
@keyframes res-latido { 0%, 100% { scale: 1.05 } 50% { scale: 1.13 } }
@keyframes res-sube { 0% { translate: 0 14px; opacity: 0 } 100% { translate: 0 0; opacity: 1 } }
@keyframes res-baja { 0% { translate: 0 -10px; opacity: 0 } 100% { translate: 0 0; opacity: 1 } }
@keyframes res-moneda { 0% { transform: translateY(-46px) rotateY(720deg) scale(.4); opacity: 0 } 70% { transform: translateY(5px) rotateY(0deg) scale(1.08); opacity: 1 } 100% { transform: none; opacity: 1 } }
@keyframes res-aura { 0%, 100% { box-shadow: 0 0 16px rgb(255 226 122 / .35) } 50% { box-shadow: 0 0 34px rgb(255 226 122 / .75) } }
@keyframes res-rayos { to { rotate: 360deg } }
@keyframes res-aparece { 0% { opacity: 0; scale: .6 } 100% { opacity: 1; scale: 1 } }
@keyframes res-rombo { 0% { rotate: 45deg; scale: 0 } 70% { rotate: 225deg; scale: 1.4 } 100% { rotate: 225deg; scale: 1 } }
@keyframes res-brilla-texto { 0%, 100% { filter: drop-shadow(0 0 0 rgb(255 226 122 / 0)) } 50% { filter: drop-shadow(0 0 14px rgb(255 226 122 / .6)) } }
.res-confeti { animation: res-confeti 1.7s cubic-bezier(.15,.7,.35,1) both }
.res-pop { animation: res-pop .6s cubic-bezier(.2,.9,.3,1.3) both }
.res-latido { animation: res-latido .5s ease-in-out 3 }
.res-sube { animation: res-sube .5s ease-out both }
.res-baja { animation: res-baja .45s ease-out both }
.res-moneda { animation: res-moneda .7s cubic-bezier(.2,.8,.3,1) both }
.res-aura { animation: res-aura 2.2s ease-in-out infinite }
.res-rayos { animation: res-rayos 14s linear infinite, res-aparece .8s ease-out both }
.res-rombo { animation: res-rombo .6s cubic-bezier(.2,.9,.3,1.3) both }
.res-brilla-texto { animation: res-pop .6s cubic-bezier(.2,.9,.3,1.3) both, res-brilla-texto 2.4s ease-in-out .8s infinite }
@media (prefers-reduced-motion: reduce) {
  .res-latido, .res-aura, .res-rayos, .res-brilla-texto { animation: none }
  .res-moneda, .res-baja, .res-rombo { animation-duration: .01s }
  .res-confeti { display: none }
}
`;

export function SorteoHecho({
    sorteo,
    yo,
    formulario,
    onCerrar,
}: {
    sorteo: SorteoPacks;
    yo?: string;
    formulario?: ReactNode;
    onCerrar: () => void;
}) {
    const n = sorteo.entrants.length;
    const [girando, setGirando] = useState(false);
    const [listo, setListo] = useState(false);
    const [info, setInfo] = useState(false);
    const [origen, setOrigen] = useState<{ x: number; y: number } | null>(null);
    const caja = useRef<HTMLDivElement>(null);
    const gane = sorteo.winner === yo;
    const ganador = ganadorDe(sorteo);
    const texto = `I won the ${NOMBRES[sorteo.kind]} (${sorteo.prize}) of ${MARCA.nombreX} 🎲
Picked among ${entradas(n)} by ApeChain block #${sorteo.block?.toLocaleString('en-US')}, anyone can check it.`;

    const terminar = () => {
        setListo(true);
        if (gane) {
            if (sonidoActivo()) sonarPremio(0.01);
            const r = caja.current?.getBoundingClientRect();
            if (r) setOrigen({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }
        setTimeout(() => setInfo(true), gane ? 1200 : 500);
    };
    const revelar = () => {
        if (sonidoActivo()) prepararAudio();
        setGirando(true);
        if (n < 2) setTimeout(terminar, 50);
    };

    return (
        <Marco
            titulo={gane && info ? 'You won!' : NOMBRES[sorteo.kind]}
            etiqueta={gane && info ? NOMBRES[sorteo.kind] : 'Raffle drawn'}
            tituloAnimado={gane && info}
            compartir={gane && info ? enlaceX(texto) : null}
            sinBotones={!info}
            onCerrar={onCerrar}
        >
            <style>{CSS_SORTEO}</style>
            <p className="-mt-3 text-center text-mw-mist/70">
                Prize: <span className="text-mw-mist">{sorteo.prize}</span> · {entradas(n)}
            </p>
            <div ref={caja}>
                <Cinta sorteo={sorteo} girar={girando} festejar={gane && listo} alTerminar={terminar} />
            </div>
            {origen && <Confeti x={origen.x} y={origen.y} />}
            {!girando ? (
                <div className="flex flex-col items-center gap-4 -mt-2">
                    <p className="text-mw-mist/70">You're one of {entradas(n)}. Ready?</p>
                    <button type="button" onClick={revelar} className={`${botonCerrar} px-8`}>
                        <span className="mw-boton-reflejo" aria-hidden="true" />
                        <span className="relative">Reveal the winner</span>
                    </button>
                </div>
            ) : (
                info && (
                    <div className="flex flex-col gap-5">
                        {gane ? (
                            <div className="res-sube">
                                <Premios premios={[{ kind: sorteo.kind, prize: sorteo.prize ?? '' }]} formulario={formulario} titulo={false} />
                            </div>
                        ) : (
                            <p className="res-sube text-center">
                                <span className="mw-etiqueta block mb-1 text-[10px] text-mw-fog">Winner</span>
                                <span className="mw-titulo text-3xl text-mw-especial">{ganador ? nombre(ganador) : '—'}</span>
                                <span className="block mt-2 text-mw-mist/70">You were one of {entradas(n)}. Not this time.</span>
                            </p>
                        )}
                        <p className="res-sube text-center" style={{ animationDelay: '.15s' }}>
                            <a href="#raffles" onClick={onCerrar} className={enlace}>
                                How the winner was picked
                            </a>
                        </p>
                    </div>
                )
            )}
        </Marco>
    );
}

function Confeti({ x, y }: { x: number; y: number }) {
    const piezas = useMemo(
        () =>
            Array.from({ length: 80 }, (_, i) => {
                const angulo = (i / 80) * Math.PI * 2 + Math.random() * 0.3;
                const lejos = 120 + Math.random() * 220;
                return {
                    dx: `${Math.cos(angulo) * lejos}px`,
                    dy: `${Math.sin(angulo) * lejos + 120}px`,
                    giro: `${Math.random() * 720 - 360}deg`,
                    color: (MARCA.mudwater ? ['#ffe27a', '#efe7bd', '#aea35d', '#ffffff'] : ['#fdf468', '#dfe8ff', '#ffffff', '#002e93'])[i % 4],
                    demora: `${Math.random() * 0.15}s`,
                    ancho: 7 + Math.random() * 7,
                };
            }),
        []
    );
    return createPortal(
        <div className="pointer-events-none fixed z-80" style={{ left: x, top: y }}>
            {piezas.map((c, i) => (
                <span
                    key={i}
                    className="res-confeti absolute block rounded-[1px]"
                    style={
                        {
                            width: c.ancho,
                            height: c.ancho * 0.45,
                            background: c.color,
                            animationDelay: c.demora,
                            '--dx': c.dx,
                            '--dy': c.dy,
                            '--giro': c.giro,
                        } as React.CSSProperties
                    }
                />
            ))}
        </div>,
        document.body
    );
}

export function PanelRaffles({ raffles, yo }: { raffles: Record<TipoSorteo, SorteoPacks>; yo?: string }) {
    return (
        <div id="raffles" className="flex flex-col gap-6 scroll-mt-24">
            {TIPOS.filter((k) => raffles[k].prize).map((k) => {
                const s = raffles[k];
                const n = s.entrants.length;
                const ganador = ganadorDe(s);
                return (
                    <div key={k} className="flex flex-col gap-3">
                        <div>
                            <p className="mw-etiqueta text-[10px] text-mw-fog">{NOMBRES[k]}</p>
                            <p className="mt-1.5 text-mw-mist/70">
                                {QUIENES[k]} · Prize: <span className="text-mw-mist">{s.prize}</span>
                            </p>
                        </div>
                        {s.status === 'none' || n === 0 ? (
                            <p className="text-mw-mist/70">Nobody qualified.</p>
                        ) : s.status === 'pending' ? (
                            <p className="text-mw-mist/70">
                                <span className="mw-titulo uppercase text-mw-champagne">Pending</span> · {entradas(n)} · drawn soon
                            </p>
                        ) : s.status === 'drawing' ? (
                            <p className="text-mw-mist/70">
                                <span className="mw-titulo uppercase text-mw-champagne">Drawing</span> · waiting for{' '}
                                <a href={`${EXPLORADOR}/block/${s.block}`} target="_blank" rel="noopener" className={enlace}>
                                    block #{s.block?.toLocaleString('en-US')}
                                </a>
                            </p>
                        ) : (
                            <>
                                <p className="flex items-center gap-3">
                                    <span className="flex-1 truncate mw-titulo text-2xl text-mw-especial">
                                        {ganador ? nombre(ganador) : '—'}
                                        {s.winner === yo && <span className="text-mw-fog text-lg"> (you)</span>}
                                    </span>
                                    <span className="mw-etiqueta text-[10px] text-black bg-mw-especial rounded-full px-2.5 py-0.5">Winner</span>
                                </p>
                                <Prueba sorteo={s} yo={yo} />
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function Prueba({ sorteo, yo }: { sorteo: SorteoPacks; yo?: string }) {
    if (sorteo.hash == null || sorteo.index == null) return null;
    const n = sorteo.entrants.length;
    return (
        <details className="group rounded-lg border border-mw-champagne/25 px-4 py-3.5">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-mw-champagne hover:text-mw-mist transition-all duration-300">
                <span className="mw-etiqueta text-xs">How the winner was picked</span>
                <span className="text-xl leading-none transition-all duration-300 group-open:rotate-45">+</span>
            </summary>
            <div className="mt-4 flex flex-col gap-4 text-mw-mist/80">
                <p>
                    When the draw started, the list of {entradas(n)} below was locked and a future ApeChain block was picked. Nobody
                    knows a block's hash before it's mined, so nobody could choose the winner.
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                    <dt className="text-mw-fog">Block</dt>
                    <dd>
                        <a href={`${EXPLORADOR}/block/${sorteo.block}`} target="_blank" rel="noopener" className={enlace}>
                            #{sorteo.block?.toLocaleString('en-US')}
                        </a>
                    </dd>
                    <dt className="text-mw-fog">Hash</dt>
                    <dd className="break-all font-mono text-sm">{sorteo.hash}</dd>
                    <dt className="text-mw-fog">Math</dt>
                    <dd>
                        hash mod {n} = {sorteo.index} → entry #{sorteo.index}
                    </dd>
                </dl>
                <ol className="max-h-48 overflow-y-auto overscroll-contain flex flex-col gap-1 border-t border-mw-champagne/15 pt-3 scrollbar-thin [scrollbar-color:var(--color-mw-champagne)_transparent]" data-lenis-prevent>
                    {sorteo.entrants.map((e, i) => (
                        <li
                            key={e.wallet}
                            className={`flex gap-3 ${i === sorteo.index ? 'text-mw-especial' : e.wallet === yo ? 'text-mw-champagne' : ''}`}
                        >
                            <span className="w-8 shrink-0 tabular-nums text-mw-fog">#{i}</span>
                            <span className="truncate">{nombre(e)}</span>
                        </li>
                    ))}
                </ol>
            </div>
        </details>
    );
}

function Cinta({
    sorteo,
    girar,
    festejar,
    alTerminar,
}: {
    sorteo: SorteoPacks;
    girar: boolean;
    festejar: boolean;
    alTerminar: () => void;
}) {
    const tira = useRef<HTMLDivElement>(null);
    const terminar = useRef(alTerminar);
    terminar.current = alTerminar;
    const [frenado, setFrenado] = useState(false);
    const fijo = sorteo.entrants.length < 2;

    const cartas = useMemo(() => {
        const todos = sorteo.entrants;
        const ganador = todos[sorteo.index ?? 0];
        return Array.from({ length: CARTAS }, (_, i) => (i === GANADORA ? ganador : todos[Math.floor(Math.random() * todos.length)]));
    }, [sorteo]);

    useLayoutEffect(() => {
        const el = tira.current;
        if (!el || !girar || fijo) return;
        const calma = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const destino = GANADORA * PASO + ANCHO / 2;
        const pasada = calma ? 0 : 16 + Math.random() * 30;
        const duracion = calma ? 800 : DURACION;
        const anim = el.animate(
            [
                { transform: `translateX(${-INICIO}px)`, easing: 'cubic-bezier(0.12, 0.6, 0.08, 1)' },
                { transform: `translateX(${-(destino + pasada)}px)`, offset: 0.9, easing: 'ease-in-out' },
                { transform: `translateX(${-destino}px)` },
            ],
            { duration: duracion, fill: 'forwards' }
        );
        const tic = crearTic();
        const sonido = sonidoActivo();
        let anterior = -1;
        let raf = 0;
        const mirar = () => {
            const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
            const carta = Math.floor((-m.m41 + ANCHO / 2) / PASO);
            if (carta !== anterior) {
                anterior = carta;
                if (sonido) tic();
            }
            raf = requestAnimationFrame(mirar);
        };
        raf = requestAnimationFrame(mirar);
        anim.finished
            .then(() => {
                cancelAnimationFrame(raf);
                if (sonido) tic(true);
                setFrenado(true);
                terminar.current();
            })
            .catch(() => {});
        return () => {
            anim.cancel();
            cancelAnimationFrame(raf);
        };
    }, [cartas, girar, fijo]);

    return (
        <div
            className="relative w-full overflow-hidden py-5"
            style={{ maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)' }}
        >
            <div
                ref={tira}
                className="relative ml-[50%] flex gap-2.5 will-change-transform"
                style={{ transform: `translateX(${-(fijo ? GANADORA * PASO + ANCHO / 2 : INICIO)}px)` }}
            >
                {cartas.map((e, i) => {
                    const gana = (frenado || (fijo && girar)) && i === GANADORA;
                    return (
                        <div
                            key={i}
                            style={{ width: ANCHO }}
                            className={`shrink-0 h-14 rounded-md border flex items-center justify-center px-3 transition-all duration-300 ${
                                gana
                                    ? `border-mw-especial bg-mw-especial/15 text-mw-especial scale-105 ${festejar ? 'res-latido shadow-[0_0_24px_rgb(255_226_122/0.6)]' : 'shadow-[0_0_16px_rgb(255_226_122/0.35)]'}`
                                    : frenado
                                      ? 'border-mw-champagne/15 text-mw-fog opacity-50'
                                      : girar
                                        ? 'border-mw-champagne/35 bg-mw-champagne/5 text-mw-mist'
                                        : 'border-mw-champagne/20 text-mw-mist/40 blur-[2px]'
                            }`}
                        >
                            <span className="truncate text-lg">{nombre(e)}</span>
                        </div>
                    );
                })}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col justify-between items-center">
                <span className="size-0 border-x-8 border-x-transparent border-t-10 border-t-mw-especial" />
                <span className="size-0 border-x-8 border-x-transparent border-b-10 border-b-mw-especial" />
            </div>
        </div>
    );
}

const FALSAS = [
    ['0x7a1c000000000000000000000000000000004b21', 'brownbear29'],
    ['0x19fe00000000000000000000000000000000a903', 'FTS'],
    ['0xc04400000000000000000000000000000000e1d7', 'fransz'],
    ['0x5be200000000000000000000000000000000077c', 'PixlPalsVault'],
    ['0x88d10000000000000000000000000000000052aa', 'CryptoBulliez'],
    ['0x2f6b00000000000000000000000000000000c3e0', 'swampking'],
    ['0x93a700000000000000000000000000000000118f', null],
    ['0x0e5500000000000000000000000000000000d6b4', 'mudlord'],
] as const;

export const PERSPECTIVAS = {
    top1: '1st place',
    segundo: '2nd place (Primals only)',
    podio: '3rd place + wins The Chosen',
    carta: '8th place (Mudwater card)',
    raffle: 'No rank prize, wins the collection raffle',
    pierde: 'In both raffles, wins nothing',
    nada: 'Played, no raffles, no prize',
} as const;
export type Perspectiva = keyof typeof PERSPECTIVAS;

function hashCon(base: string, n: number, index: number) {
    const b = BigInt(base);
    return '0x' + (b - (b % BigInt(n)) + BigInt(index)).toString(16).padStart(64, '0');
}

const PREMIOS_PRUEBA = [
    'Mudwater pack + 5 Primals',
    '4 Primals',
    '3 Primals',
    '2 Primals',
    '1 Primal',
    ...Array(15).fill('1 Random Mudwater Card'),
];

export function resultadosDePrueba(perspectiva: Perspectiva, sorteados: boolean, yo: string) {
    const premios = PREMIOS_PRUEBA;
    const gente = FALSAS.map(([w, n]) => ({ wallet: w as string, nickname: n as string | null }));
    const puestoMio = { top1: 1, segundo: 2, podio: 3, carta: 8, raffle: 23, pierde: 41, nada: 57 }[perspectiva];
    const yoFila = { wallet: yo, nickname: 'fransz' };
    const otros = gente.filter((g) => g.nickname !== 'fransz');
    const top = Array.from({ length: 5 }, (_, i) => (i + 1 === puestoMio ? yoFila : otros[i])).map((g, i) => ({
        ...g,
        rank: i + 1,
        points: 8105 - i * 380,
        packs: 60 - i * 3,
        streak: 13,
    }));
    const enChosen = perspectiva !== 'nada' && perspectiva !== 'raffle';
    const enColeccion = perspectiva === 'raffle' || perspectiva === 'pierde';
    const chosen = [otros[1], ...(enChosen ? [yoFila] : []), otros[4], otros[5]];
    const coleccion = [otros[0], otros[2], ...(enColeccion ? [yoFila] : []), otros[6], otros[3], otros[5]];
    const ganaChosen = perspectiva === 'podio';
    const ganaColeccion = perspectiva === 'raffle';
    const sorteo = (kind: TipoSorteo, prize: string, entrants: typeof gente, gana: boolean, base: string, block: number): SorteoPacks => {
        const n = entrants.length;
        if (!sorteados) return { kind, prize, entrants, status: kind === 'chosen' ? 'pending' : 'drawing', block };
        const index = gana ? entrants.findIndex((e) => e.wallet === yo) : entrants.findIndex((e) => e.wallet !== yo && e.nickname !== null);
        const hash = hashCon(base, n, index);
        return { kind, prize, entrants, status: 'drawn', block, hash, index, winner: entrants[index].wallet };
    };
    const raffles = {
        chosen: sorteo('chosen', 'Mudwater pack', chosen, ganaChosen, '0x9c3e5b0a7f12d4e8b61a0c93f5d27e4a8b1c06f39d2e75a4c8b0f1e3d6a92b55', 31_402_118),
        collection: sorteo('collection', '#77 Half-Mutated Foil', coleccion, ganaColeccion, '0x4f81a2c9e07d3b65f1a8c4e20b97d6f3a5e1c08b72d94f6e3a1b5c7d09e2f4a8', 31_402_907),
    };
    const ganados: PremioGanado[] = puestoMio <= premios.length ? [{ kind: 'rank', place: puestoMio, prize: premios[puestoMio - 1] }] : [];
    const estados: MiPacks['raffles'] = {};
    for (const r of Object.values(raffles)) {
        if (!r.entrants.some((e) => e.wallet === yo)) continue;
        if (r.status !== 'drawn') estados[r.kind] = 'entered';
        else if (r.winner === yo) {
            estados[r.kind] = 'won';
            ganados.push({ kind: r.kind, prize: r.prize! });
        } else estados[r.kind] = 'lost';
    }
    const ranking: Ranking = { players: 84, top, chosen: [], raffles };
    const cola: ('fin' | TipoSorteo)[] = ['fin'];
    if (sorteados) for (const k of TIPOS) if (estados[k]) cola.push(k);
    return {
        ranking,
        mio: { rank: puestoMio, points: puestoMio <= 5 ? 8105 - (puestoMio - 1) * 380 : 3420 - puestoMio * 20, packs: 40, prizes: ganados, raffles: estados },
        cola,
    };
}
