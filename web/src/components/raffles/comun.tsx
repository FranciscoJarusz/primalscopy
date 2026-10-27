import { useCallback, useEffect, useRef, useState } from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';
import { useWalletSession } from '@/hooks/cultomizer/useWalletSession';
import { EVENTO_CANJE } from '@/lib/promo';
import { fog, iconoPremio, ICONO_FOG_CHICO } from '@/lib/staking';
import { comprarTickets, imagenRaffle, leerMisRaffles, type MiRaffles, type Raffle } from '@/lib/raffles';
import { leerAvatares } from '@/lib/explore';
import Confirmacion from '@/components/forge/Confirmacion';
import Mensaje, { type Aviso } from '@/components/staking/Mensaje';

export type Session = ReturnType<typeof useWalletSession>;

export const ICONO_TICKET = iconoPremio({ id: 'raffle-ticket' });
export const URGENTE = 3600000;
export const pastilla = 'bg-darkblue rounded-3xl shadow-lg shadow-darkblue/50 min-w-0';
export const deshabilitable =
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100';

const dos = (n: number) => String(n).padStart(2, '0');
export function reloj(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${dos(h)}h ${dos(m)}m` : `${dos(h)}:${dos(m)}:${dos(s % 60)}`;
}
export const fechaCorta = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const jugadoresTexto = (n: number) => `${fog(n)} ${n === 1 ? 'player' : 'players'}`;
export const entradasTexto = (n: number) => `${fog(n)} ${n === 1 ? 'entry' : 'entries'}`;
export const odds = (mias: number, total: number) => `${Number((total ? (mias / total) * 100 : 0).toFixed(2))}%`;
export const puesto = (i: number) => {
    const n = i + 1;
    const sufijo = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
    return `${n}${sufijo}`;
};
export const ganadoresTexto = (r: Raffle) => {
    const n = r.prizes.reduce((t, p) => t + p.winners, 0);
    return `${n} ${n === 1 ? 'winner' : 'winners'}`;
};
const normal = (t: string) => t.toLowerCase().replace(/\s*[x×]\s*\d+$/, '').trim();
export const premiosTexto = (r: Raffle) =>
    r.prizes.length === 1 && normal(r.prizes[0].label) === normal(r.title)
        ? null
        : r.prizes.map((p) => (p.winners > 1 ? `${p.label} ×${p.winners}` : p.label)).join(', ');
export function textoEntrada(r: Raffle) {
    const porEntrada = `${fog(r.ticketPrice)} FOG per entry`;
    if (r.publicPrice === null) return `Holders only: first entry free, then ${porEntrada}`;
    if (r.publicPrice !== r.ticketPrice) {
        const primera = r.publicPrice ? `${fog(r.publicPrice)} FOG` : 'free';
        return `${r.holdersFree ? `Free for holders, ${primera} for everyone else` : `First entry ${primera}`}. Extra entries ${fog(r.ticketPrice)} FOG`;
    }
    return r.holdersFree ? `First entry free for holders, then ${porEntrada}` : porEntrada;
}
export const quienEntra = (r: Raffle) =>
    r.publicPrice === null ? 'Primal holders only' : r.holdersFree ? 'Everyone, free first entry for holders' : 'Everyone';
export function filasPremios(r: Raffle): [string, string][] {
    let lugar = 0;
    return r.prizes.map((p) => {
        const desde = lugar;
        lugar += p.winners;
        const puestos = p.winners === 1 ? puesto(desde) : `${puesto(desde)}–${puesto(lugar - 1)}`;
        return [r.prizes.length === 1 && p.winners === 1 ? 'Prize' : `${puestos} prize`, p.label];
    });
}
export const cierra = (r: Raffle) => (r.endsAt ? Date.parse(r.endsAt) : Infinity);
export const lleno = (r: Raffle) => r.maxEntries !== null && r.totalEntries >= r.maxEntries;

export function useAhora() {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    return ahora;
}

let avataresPedidos: Promise<Record<string, string>> | null = null;
export function useAvatares() {
    const [avatares, setAvatares] = useState<Record<string, string>>({});
    useEffect(() => {
        avataresPedidos ??= leerAvatares().catch(() => ({}));
        avataresPedidos.then(setAvatares);
    }, []);
    return avatares;
}

export function useEsperandoSorteo(raffles: Raffle[], alTerminar: () => void) {
    const ahora = useAhora();
    const esperando = raffles.some((r) => r.status === 'drawing' || (r.status === 'open' && cierra(r) <= ahora));
    const antes = useRef(esperando);
    const terminar = useRef(alTerminar);
    terminar.current = alTerminar;
    useEffect(() => {
        if (antes.current && !esperando) terminar.current();
        antes.current = esperando;
    }, [esperando]);
    return esperando;
}

export function useMio() {
    const session = useWalletSession();
    const [mio, setMio] = useState<MiRaffles | null>(null);

    const recargar = useCallback(async () => {
        if (!session.token) return setMio(null);
        try {
            setMio(await leerMisRaffles(session.token));
        } catch {
            setMio(null);
        }
    }, [session.token]);

    useEffect(() => {
        recargar();
        const t = setInterval(recargar, 30_000);
        return () => clearInterval(t);
    }, [recargar]);

    useEffect(() => {
        window.addEventListener(EVENTO_CANJE, recargar);
        return () => window.removeEventListener(EVENTO_CANJE, recargar);
    }, [recargar]);

    return { session, mio, recargar };
}

export function Imagen({ raffle, className }: { raffle: Raffle; className: string }) {
    return (
        <span
            className={`${className} ${className.includes('absolute') ? '' : 'relative'} block overflow-hidden bg-[radial-gradient(circle_at_50%_42%,#1b1596,#090050_75%)]`}
        >
            {raffle.image ? (
                <img src={imagenRaffle(raffle.image)} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
                ICONO_TICKET && (
                    <img src={ICONO_TICKET} alt="" className="absolute inset-[22%] size-[56%] object-contain opacity-80" />
                )
            )}
        </span>
    );
}

export function Estado({ raffle }: { raffle: Raffle }) {
    const ahora = useAhora();
    const vivo = raffle.status === 'open' && cierra(raffle) > ahora;
    const texto = raffle.status === 'drawn' ? 'Drawn' : vivo ? 'Live' : 'Drawing';
    return (
        <span
            className={`h-7 inline-flex items-center gap-2 font-accent uppercase rounded-md px-2.5 pb-[0.38em] leading-none ${
                vivo ? 'bg-yellow text-darkblue' : raffle.status === 'drawn' ? 'bg-red text-white' : 'bg-blue text-lightblue'
            }`}
        >
            {vivo && <i className="size-2 rounded-full bg-darkblue animate-pulse translate-y-[0.19em]" />}
            {texto}
        </span>
    );
}

export function BarraEntradas({ raffle, alto = 'h-1.5' }: { raffle: Raffle; alto?: string }) {
    const lugares = raffle.maxEntries ?? Math.max(raffle.totalEntries, 1);
    const pct = Math.min(100, (raffle.totalEntries / lugares) * 100);
    return (
        <div className={`${alto} rounded-full bg-lightblue/12 overflow-hidden`} aria-hidden="true">
            <span
                className="block h-full rounded-full bg-yellow transition-all duration-300"
                style={{ width: `${raffle.totalEntries ? Math.max(1.5, pct) : 0}%` }}
            />
        </div>
    );
}

export function HojaTickets({
    raffle,
    mio,
    token,
    alCambiar,
    alCerrar,
}: {
    raffle: Raffle;
    mio: MiRaffles;
    token: string;
    alCambiar: (r: Raffle) => void;
    alCerrar: () => void;
}) {
    const [cantidad, setCantidad] = useState(1);
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState<Aviso | null>(null);

    const libres = raffle.maxEntries === null ? Infinity : raffle.maxEntries - raffle.totalEntries;
    const tope = Math.max(1, Math.min(1000, libres));
    const n = Math.min(cantidad, tope);
    const costo = n * raffle.ticketPrice;
    const alcanza = costo <= mio.balance;
    const actuales = mio.entries[raffle.id]?.entries ?? 0;

    const comprar = async () => {
        setOcupado(true);
        setAviso(null);
        try {
            const r = await comprarTickets(token, raffle.id, n);
            alCambiar(r.raffle);
            setAviso({ ok: true, texto: `Added ${entradasTexto(n)}.` });
            setCantidad(1);
        } catch (err) {
            setAviso({ ok: false, texto: err instanceof Error ? err.message : 'Something went wrong.' });
        }
        setOcupado(false);
    };

    const paso =
        'size-9 grid place-items-center rounded-md bg-lightblue text-darkblue cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue';

    return (
        <Confirmacion
            titulo="Raffle Tickets"
            textoConfirmar={ocupado ? 'Adding...' : `Add ${n} ${n === 1 ? 'ticket' : 'tickets'}`}
            textoCancelar="Close"
            deshabilitado={ocupado || !alcanza || libres <= 0}
            onConfirmar={comprar}
            onCancelar={alCerrar}
        >
            <div className="flex flex-col gap-4">
                <p>
                    Each ticket is one more entry in {raffle.title}, at {fog(raffle.ticketPrice)} FOG.
                </p>
                {libres <= 0 ? (
                    <p>This raffle is full.</p>
                ) : (
                    <>
                        <div className="inline-flex items-center gap-2">
                            <button onClick={() => setCantidad(Math.max(1, n - 1))} disabled={n <= 1} aria-label="One less" className={paso}>
                                <FiMinus aria-hidden="true" />
                            </button>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={tope}
                                value={n}
                                onChange={(e) => {
                                    const v = Math.floor(Number(e.target.value));
                                    setCantidad(Number.isFinite(v) ? Math.min(tope, Math.max(1, v)) : 1);
                                }}
                                aria-label="Tickets to buy"
                                className="h-9 w-20 bg-lightblue text-darkblue font-accent text-lg text-center leading-none rounded-md pb-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-yellow transition-all duration-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button onClick={() => setCantidad(Math.min(tope, n + 1))} disabled={n >= tope} aria-label="One more" className={paso}>
                                <FiPlus aria-hidden="true" />
                            </button>
                        </div>
                        <dl className="flex flex-col m-0">
                            <div className="flex justify-between gap-3 py-2 border-b border-lightblue/12">
                                <dt>Cost</dt>
                                <dd className="m-0 inline-flex items-center gap-1.5 text-white tabular-nums">
                                    <img src={ICONO_FOG_CHICO} alt="" className="size-4" />
                                    {fog(costo)}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3 py-2 border-b border-lightblue/12">
                                <dt>Your entries after</dt>
                                <dd className="m-0 text-white tabular-nums">{fog(actuales + n)}</dd>
                            </div>
                            <div className="flex justify-between gap-3 py-2">
                                <dt>Your odds after</dt>
                                <dd className="m-0 text-yellow tabular-nums">{odds(actuales + n, raffle.totalEntries + n)}</dd>
                            </div>
                        </dl>
                        {!alcanza && (
                            <p className="text-red-300">
                                You need {fog(costo - mio.balance)} more FOG.{' '}
                                <a href="/shop" className="text-yellow underline underline-offset-4 hover:text-white transition-all duration-300">
                                    Buy FOG
                                </a>
                            </p>
                        )}
                    </>
                )}
                {aviso && <Mensaje ok={aviso.ok} texto={aviso.texto} />}
            </div>
        </Confirmacion>
    );
}
