import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FiImage, FiPlus, FiTrash2 } from 'react-icons/fi';
import { BACKEND_URL } from '@/lib/backend';
import { imagenRaffle, type TipoPremio } from '@/lib/raffles';
import { irA } from '@/lib/admin';
import {
    botonChico,
    botonGuardar,
    campo,
    Desplegable,
    etiqueta,
    fecha,
    fog,
    lista,
    opcion,
    panel,
    titulo,
    useQuien,
} from './comun';

type Estado = 'draft' | 'open' | 'drawn' | 'cancelled';
type Premio = { id?: string; label: string; kind: TipoPremio; amount: number | null; winners: number };
type GanadorAdmin = {
    slot: number;
    prizeId: string;
    prize: string;
    kind: TipoPremio | null;
    amount: number | null;
    wallet: string;
    entries: number;
    status: 'pending' | 'sent';
    note: string | null;
    sentAt: string | null;
};
type RaffleAdmin = {
    id: string;
    title: string;
    description: string;
    image: string | null;
    prizes: Premio[];
    holdersFree: boolean;
    publicPrice: number | null;
    ticketPrice: number;
    maxEntries: number | null;
    endsAt: string | null;
    status: Estado;
    closing: boolean;
    totalEntries: number;
    participants: number;
    fogCollected: number;
    refunded: number;
    createdAt: string;
    openedAt: string | null;
    drawnAt: string | null;
    cancelledAt: string | null;
    entries: { wallet: string; base: 'holder' | 'paid' | null; tickets: number; entries: number }[];
    winners: GanadorAdmin[];
    rerolled: { slot: number; wallet: string; at: string }[];
    disqualified: string[];
};
type Recompensa = { id: string; label: string; max: number; plural: boolean };
type Datos = { raffles: RaffleAdmin[]; defaults: { ticketPrice: number; maxEntries: number }; rewards: Recompensa[] };
type Pedir = (ruta: string, init?: RequestInit) => Promise<{ raffle?: RaffleAdmin }>;

type Borrador = {
    title: string;
    description: string;
    prizes: { id?: string; label: string; kind: TipoPremio; amount: string; winners: string }[];
    holdersFree: boolean;
    abierto: boolean;
    ticketPrice: string;
    maxEntries: string;
    conFecha: boolean;
    endsAt: string;
};

const A_MANO: Record<string, string> = { other: 'Other (sent by hand)', nft: 'NFT (sent by hand)', ape: 'APE (sent by hand)' };
const ESTADOS: Record<Estado, { nombre: string; clase: string }> = {
    draft: { nombre: 'Draft', clase: 'bg-lightblue/20 text-lightblue' },
    open: { nombre: 'Live', clase: 'bg-yellow text-darkblue' },
    drawn: { nombre: 'Drawn', clase: 'bg-red text-white' },
    cancelled: { nombre: 'Cancelled', clase: 'bg-lightblue/20 text-lightblue/70' },
};
const enlace =
    'text-sm text-lightblue/70 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300 disabled:opacity-40';
const subtitulo = 'font-accent uppercase text-yellow text-xl leading-none pb-1';

const aLocal = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const premioVacio = () => ({ label: '', kind: 'other' as TipoPremio, amount: '', winners: '1' });

function aBorrador(r: RaffleAdmin | null, defaults: Datos['defaults']): Borrador {
    if (!r) {
        return {
            title: '',
            description: '',
            prizes: [premioVacio()],
            holdersFree: true,
            abierto: true,
            ticketPrice: String(defaults.ticketPrice),
            maxEntries: String(defaults.maxEntries),
            conFecha: true,
            endsAt: aLocal(new Date(Date.now() + 7 * 86400000).toISOString()),
        };
    }
    return {
        title: r.title,
        description: r.description,
        prizes: r.prizes.map((p) => ({
            id: p.id,
            label: p.label,
            kind: p.kind,
            amount: p.amount === null ? '' : String(p.amount),
            winners: String(p.winners),
        })),
        holdersFree: r.holdersFree,
        abierto: r.publicPrice !== null,
        ticketPrice: String(r.ticketPrice),
        maxEntries: r.maxEntries === null ? '' : String(r.maxEntries),
        conFecha: r.endsAt !== null,
        endsAt: r.endsAt ? aLocal(r.endsAt) : aLocal(new Date(Date.now() + 7 * 86400000).toISOString()),
    };
}

function aCuerpo(b: Borrador) {
    return {
        title: b.title,
        description: b.description,
        prizes: b.prizes.map((p) => ({
            id: p.id,
            label: p.label,
            kind: p.kind,
            amount: p.amount.trim() === '' ? null : Number(p.amount),
            winners: Number(p.winners),
        })),
        holdersFree: b.holdersFree,
        publicPrice: b.abierto ? Number(b.ticketPrice) : null,
        ticketPrice: Number(b.ticketPrice),
        maxEntries: b.maxEntries.trim() === '' ? null : Number(b.maxEntries),
        endsAt: b.conFecha && b.endsAt ? new Date(b.endsAt).toISOString() : null,
    };
}

async function subirImagen(pedir: Pedir, id: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    await pedir(`/${id}/image`, { method: 'POST', body: form });
}

function EtiquetaEstado({ raffle: r }: { raffle: RaffleAdmin }) {
    const estado = r.closing ? { nombre: 'Drawing', clase: 'bg-lightblue text-darkblue' } : ESTADOS[r.status];
    return (
        <span className={`h-7 inline-flex items-center font-accent uppercase rounded-md px-2.5 pb-[0.38em] leading-none text-sm ${estado.clase}`}>
            {estado.nombre}
        </span>
    );
}

export default function RafflesAdmin({ token }: { token: string }) {
    const [datos, setDatos] = useState<Datos | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [creando, setCreando] = useState(false);
    const vacio = useMemo(() => datos && aBorrador(null, datos.defaults), [datos]);

    const pedir: Pedir = useCallback(
        async (ruta: string, init: RequestInit = {}) => {
            const r = await fetch(`${BACKEND_URL}/admin/raffles${ruta}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
                },
            }).catch(() => null);
            const d = await r?.json().catch(() => ({}));
            if (!r?.ok) throw new Error(d?.error || "Couldn't reach the server.");
            return d;
        },
        [token]
    );

    const cargar = useCallback(async () => {
        try {
            setDatos((await pedir('')) as unknown as Datos);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't load the raffles.");
        }
    }, [pedir]);

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    if (!datos) {
        return <p className="text-lightblue/70">{error ?? 'Loading...'}</p>;
    }

    const vivos = datos.raffles.filter((r) => r.status === 'open');
    const borradores = datos.raffles.filter((r) => r.status === 'draft');
    const pasados = datos.raffles.filter((r) => r.status === 'drawn' || r.status === 'cancelled');
    const tarjeta = (r: RaffleAdmin, plana = false) => (
        <Tarjeta key={r.id} raffle={r} defaults={datos.defaults} premios={datos.rewards} pedir={pedir} alCambiar={cargar} plana={plana} />
    );

    return (
        <div className="flex flex-col gap-6 sm:gap-8">
            <section className={panel}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <h2 className={titulo}>Raffles</h2>
                        <p className="text-lightblue/70 text-sm">
                            {vivos.length} live, {borradores.length} {borradores.length === 1 ? 'draft' : 'drafts'},{' '}
                            {pasados.length} past
                        </p>
                    </div>
                    {!creando && (
                        <button onClick={() => setCreando(true)} className={`${botonGuardar} inline-flex items-center gap-2`}>
                            <FiPlus aria-hidden="true" className="mt-1.5" /> New raffle
                        </button>
                    )}
                </div>
                {creando && (
                    <div className="pt-4 border-t border-lightblue/10">
                        <Formulario
                            inicial={vacio!}
                            premios={datos.rewards}
                            textoGuardar="Create draft"
                            alCancelar={() => setCreando(false)}
                            alGuardar={async (cuerpo, imagen) => {
                                const { raffle } = await pedir('', { method: 'POST', body: JSON.stringify(cuerpo) });
                                if (imagen && raffle) await subirImagen(pedir, raffle.id, imagen);
                                setCreando(false);
                                await cargar();
                            }}
                        />
                    </div>
                )}
            </section>

            <section className={panel}>
                <Desplegable nombre="How raffles work">
                    <ul className="flex flex-col gap-1.5 text-sm text-lightblue/80 list-disc pl-5">
                        <li>One entry per wallet: free for holders if you turn it on, or paid with FOG.</li>
                        <li>Raffle Tickets add extra entries, at the price you set.</li>
                        <li>Raffles with an end date are drawn on their own a few seconds after it passes.</li>
                        <li>At the draw, holders lose their free entry if they no longer hold a Primal.</li>
                        <li>Prizes from the list (FOG, rolls, keys) are given with one click in Deliveries. Anything else you send by hand and mark there.</li>
                        <li>Cancelling a raffle that wasn't drawn refunds all the FOG.</li>
                    </ul>
                </Desplegable>
            </section>

            <Grupo nombre="Live" vacio="No raffle is live. Publish a draft to open it.">
                {vivos.map((r) => tarjeta(r))}
            </Grupo>

            {borradores.length > 0 && <Grupo nombre="Drafts">{borradores.map((r) => tarjeta(r))}</Grupo>}

            {pasados.length > 0 && (
                <section className={panel}>
                    <Desplegable nombre="Past raffles" resumen={`${pasados.length}`} grande>
                        <div className="flex flex-col gap-4 pt-2">{pasados.map((r) => tarjeta(r, true))}</div>
                    </Desplegable>
                </section>
            )}
        </div>
    );
}

function Grupo({ nombre, vacio, children }: { nombre: string; vacio?: string; children: ReactNode[] }) {
    return (
        <div className="flex flex-col gap-4">
            <h2 className={`${titulo} px-1`}>
                {nombre} <span className="text-lightblue/60 text-lg">{children.length}</span>
            </h2>
            {children.length === 0 && vacio ? <p className="text-lightblue/70 px-1">{vacio}</p> : children}
        </div>
    );
}

function Paso({ nombre, ayuda, children }: { nombre: string; ayuda?: string; children: ReactNode }) {
    return (
        <fieldset className="flex flex-col gap-3 pt-5 border-t border-lightblue/10 first:pt-0 first:border-0 min-w-0">
            <legend className="contents">
                <span className={subtitulo}>{nombre}</span>
            </legend>
            {ayuda && <p className="text-lightblue/60 text-xs -mt-1">{ayuda}</p>}
            {children}
        </fieldset>
    );
}

function Formulario({
    inicial,
    premios,
    imagenActual = null,
    textoGuardar,
    bloqueado = false,
    alGuardar,
    alCancelar,
}: {
    inicial: Borrador;
    premios: Recompensa[];
    imagenActual?: string | null;
    textoGuardar: string;
    bloqueado?: boolean;
    alGuardar: (cuerpo: ReturnType<typeof aCuerpo>, imagen: File | null) => Promise<void>;
    alCancelar?: () => void;
}) {
    const [b, setB] = useState(inicial);
    const [imagen, setImagen] = useState<File | null>(null);
    const [vista, setVista] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [guardado, setGuardado] = useState(false);

    useEffect(() => setB(inicial), [inicial]);
    useEffect(() => {
        if (!imagen) return setVista(null);
        const url = URL.createObjectURL(imagen);
        setVista(url);
        return () => URL.revokeObjectURL(url);
    }, [imagen]);

    const cambiar = (cambios: Partial<Borrador>) => {
        setB((x) => ({ ...x, ...cambios }));
        setGuardado(false);
    };
    const cambiarPremio = (i: number, cambios: Partial<Borrador['prizes'][number]>) =>
        cambiar({ prizes: b.prizes.map((p, j) => (j === i ? { ...p, ...cambios } : p)) });

    const guardar = async () => {
        setOcupado(true);
        setError(null);
        try {
            await alGuardar(aCuerpo(b), imagen);
            setImagen(null);
            setGuardado(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
        setOcupado(false);
    };

    const ganadores = b.prizes.reduce((n, p) => n + (Number(p.winners) || 0), 0);
    const cantidadMax = (kind: string) => premios.find((x) => x.id === kind)?.max ?? (kind === 'ape' ? 1000000 : 1);
    const conCantidad = (kind: string) => cantidadMax(kind) > 1;
    const mostrada = vista ?? (imagenActual ? imagenRaffle(imagenActual) : null);

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                guardar();
            }}
            className="flex flex-col gap-5"
        >
            <Paso nombre="1. Basics">
                <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <label className="group relative size-32 rounded-xl bg-blue overflow-hidden grid place-items-center cursor-pointer">
                        {mostrada ? (
                            <img src={mostrada} alt="" className="size-full object-cover" />
                        ) : (
                            <span className="flex flex-col items-center gap-1 text-lightblue/60 text-xs">
                                <FiImage aria-hidden="true" className="size-7" />
                                Add image
                            </span>
                        )}
                        <span className="absolute inset-0 bg-darkblue/70 grid place-items-center text-xs uppercase font-accent text-yellow opacity-0 group-hover:opacity-100 transition-all duration-300">
                            {mostrada ? 'Change' : 'Upload'}
                        </span>
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/gif,image/webp"
                            className="sr-only"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setImagen(file);
                                    setGuardado(false);
                                }
                                e.target.value = '';
                            }}
                        />
                    </label>
                    <div className="flex flex-col gap-3 min-w-0">
                        <label className={etiqueta}>
                            Title
                            <input value={b.title} maxLength={80} onChange={(e) => cambiar({ title: e.target.value })} className={campo} />
                        </label>
                        <label className={etiqueta}>
                            Description
                            <textarea
                                value={b.description}
                                maxLength={500}
                                rows={2}
                                onChange={(e) => cambiar({ description: e.target.value })}
                                className={`${campo} resize-y`}
                            />
                        </label>
                    </div>
                </div>
            </Paso>

            <Paso
                nombre={`2. Prizes · ${ganadores} ${ganadores === 1 ? 'winner' : 'winners'}`}
                ayuda="Winners are drawn in this order: the first prize goes to the first winner drawn."
            >
                <div className="hidden sm:grid gap-2 grid-cols-[minmax(0,1fr)_13rem_7rem_6rem_2.25rem] text-sm text-lightblue/80">
                    <span>What they win</span>
                    <span>Kind</span>
                    <span>Amount</span>
                    <span>Winners</span>
                </div>
                {b.prizes.map((p, i) => (
                    <div key={p.id ?? i} className="grid gap-2 grid-cols-2 sm:grid-cols-[minmax(0,1fr)_13rem_7rem_6rem_2.25rem] items-center">
                        <input
                            value={p.label}
                            maxLength={60}
                            placeholder="Bored Ape #1234"
                            aria-label="What they win"
                            onChange={(e) => cambiarPremio(i, { label: e.target.value })}
                            className={`${campo} col-span-2 sm:col-span-1`}
                        />
                        <select
                            value={p.kind}
                            aria-label="Kind"
                            onChange={(e) => {
                                const elegido = premios.find((x) => x.id === e.target.value);
                                cambiarPremio(i, {
                                    kind: e.target.value,
                                    amount: elegido && elegido.max > 1 ? p.amount || '1' : '',
                                    label: p.label || (elegido ? elegido.label : ''),
                                });
                            }}
                            className={campo}
                        >
                            <optgroup label="Given with one click">
                                {premios.map((x) => (
                                    <option key={x.id} value={x.id}>
                                        {x.label}
                                    </option>
                                ))}
                            </optgroup>
                            <optgroup label="Sent by hand">
                                {Object.entries(A_MANO)
                                    .filter(([k]) => k === 'other' || p.kind === k)
                                    .map(([k, nombre]) => (
                                        <option key={k} value={k}>
                                            {nombre}
                                        </option>
                                    ))}
                            </optgroup>
                        </select>
                        <input
                            type="number"
                            min={1}
                            max={cantidadMax(p.kind)}
                            aria-label="Amount"
                            value={conCantidad(p.kind) ? p.amount : ''}
                            disabled={!conCantidad(p.kind)}
                            placeholder={conCantidad(p.kind) ? '' : '—'}
                            onChange={(e) => cambiarPremio(i, { amount: e.target.value })}
                            className={`${campo} disabled:opacity-40`}
                        />
                        <input
                            type="number"
                            min={1}
                            max={100}
                            aria-label="Winners"
                            value={p.winners}
                            onChange={(e) => cambiarPremio(i, { winners: e.target.value })}
                            className={campo}
                        />
                        <button
                            type="button"
                            aria-label="Remove prize"
                            disabled={b.prizes.length === 1}
                            onClick={() => cambiar({ prizes: b.prizes.filter((_, j) => j !== i) })}
                            className="h-9 grid place-items-center text-lightblue hover:text-red-300 cursor-pointer transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <FiTrash2 aria-hidden="true" />
                        </button>
                    </div>
                ))}
                <button type="button" onClick={() => cambiar({ prizes: [...b.prizes, premioVacio()] })} className={`${enlace} self-start`}>
                    + Add prize
                </button>
            </Paso>

            <Paso
                nombre="3. Entry"
                ayuda={
                    bloqueado
                        ? 'People already joined: who can enter and the price are locked.'
                        : b.holdersFree
                          ? 'Holders get their first entry free. Every other entry costs the price per entry.'
                          : 'Every entry costs the price per entry, also the first one.'
                }
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-3">
                        <span className="text-sm text-lightblue/80">Who can enter</span>
                        <label className="flex items-center gap-2 text-sm text-lightblue">
                            <input
                                type="checkbox"
                                checked={b.holdersFree}
                                disabled={bloqueado}
                                onChange={(e) => cambiar({ holdersFree: e.target.checked })}
                                className="size-4 accent-yellow"
                            />
                            Primal holders, first entry free
                        </label>
                        <label className="flex items-center gap-2 text-sm text-lightblue">
                            <input
                                type="checkbox"
                                checked={b.abierto}
                                disabled={bloqueado}
                                onChange={(e) => cambiar({ abierto: e.target.checked })}
                                className="size-4 accent-yellow"
                            />
                            Everyone else, paying per entry
                        </label>
                    </div>
                    <div className="grid gap-3 grid-cols-2">
                        <label className={etiqueta}>
                            FOG per entry
                            <input
                                type="number"
                                min={1}
                                value={b.ticketPrice}
                                disabled={bloqueado}
                                onChange={(e) => cambiar({ ticketPrice: e.target.value })}
                                className={`${campo} disabled:opacity-40`}
                            />
                        </label>
                        <label className={etiqueta}>
                            Entry limit
                            <input
                                type="number"
                                min={1}
                                value={b.maxEntries}
                                placeholder="No limit"
                                onChange={(e) => cambiar({ maxEntries: e.target.value })}
                                className={campo}
                            />
                        </label>
                    </div>
                </div>
            </Paso>

            <Paso
                nombre="4. Ends"
                ayuda={b.conFecha ? 'It is drawn on its own when the date passes.' : 'It stays open until you press Draw now.'}
            >
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-2">
                        <button type="button" onClick={() => cambiar({ conFecha: true })} className={opcion(b.conFecha)}>
                            On a date
                        </button>
                        <button type="button" onClick={() => cambiar({ conFecha: false })} className={opcion(!b.conFecha)}>
                            When I draw it
                        </button>
                    </div>
                    {b.conFecha && (
                        <input
                            type="datetime-local"
                            value={b.endsAt}
                            aria-label="End date and time, in your time zone"
                            onChange={(e) => cambiar({ endsAt: e.target.value })}
                            className={`${campo} w-auto`}
                        />
                    )}
                </div>
            </Paso>

            <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-lightblue/10">
                <button type="submit" disabled={ocupado} className={botonGuardar}>
                    {ocupado ? 'Saving...' : textoGuardar}
                </button>
                {alCancelar && (
                    <button type="button" onClick={alCancelar} className={enlace}>
                        Cancel
                    </button>
                )}
                {guardado && <span className="text-yellow text-sm">Saved.</span>}
                {error && <span className="text-red-300 text-sm">{error}</span>}
            </div>
        </form>
    );
}

function Tarjeta({
    raffle: r,
    defaults,
    premios,
    pedir,
    alCambiar,
    plana = false,
}: {
    raffle: RaffleAdmin;
    defaults: Datos['defaults'];
    premios: Recompensa[];
    pedir: Pedir;
    alCambiar: () => Promise<void>;
    plana?: boolean;
}) {
    const quien = useQuien();
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmar, setConfirmar] = useState<'draw' | 'cancel' | 'delete' | null>(null);
    const [elegidos, setElegidos] = useState<number[]>([]);
    const [inicial, setInicial] = useState(() => aBorrador(r, defaults));
    const editable = r.status === 'draft' || r.status === 'open';

    useEffect(() => setInicial(aBorrador(r, defaults)), [r, defaults]);

    const accion = async (ruta: string, init: RequestInit = { method: 'POST' }) => {
        setOcupado(true);
        setError(null);
        try {
            await pedir(ruta, init);
            setConfirmar(null);
            setElegidos([]);
            await alCambiar();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
        setOcupado(false);
    };

    const cuando =
        r.status === 'draft'
            ? `Created ${fecha(r.createdAt)}`
            : r.status === 'open'
              ? r.endsAt
                  ? `Ends ${fecha(r.endsAt)}`
                  : 'Ends when you draw it'
              : r.status === 'drawn'
                ? `Drawn ${r.drawnAt ? fecha(r.drawnAt) : ''}`
                : `Cancelled ${r.cancelledAt ? fecha(r.cancelledAt) : ''}`;

    const numeros: [string, string][] = [
        ['Entries', r.maxEntries === null ? fog(r.totalEntries) : `${fog(r.totalEntries)} / ${fog(r.maxEntries)}`],
        ['Players', fog(r.participants)],
        [r.status === 'cancelled' ? 'FOG refunded' : 'FOG collected', fog(r.status === 'cancelled' ? r.refunded : r.fogCollected)],
    ];

    const acciones = editable && (
        <div className="flex flex-wrap items-center gap-3">
            {confirmar ? (
                <>
                    <span className="text-sm text-lightblue">
                        {confirmar === 'draw' && 'Close entries and draw the winners now?'}
                        {confirmar === 'cancel' && `Cancel it and refund ${fog(r.fogCollected)} FOG?`}
                        {confirmar === 'delete' && 'Delete this draft?'}
                    </span>
                    <button
                        disabled={ocupado}
                        onClick={() => (confirmar === 'delete' ? accion(`/${r.id}`, { method: 'DELETE' }) : accion(`/${r.id}/${confirmar}`))}
                        className={botonChico}
                    >
                        {ocupado ? '...' : 'Yes'}
                    </button>
                    <button onClick={() => setConfirmar(null)} className={enlace}>
                        No
                    </button>
                </>
            ) : (
                <>
                    {r.status === 'draft' && (
                        <button disabled={ocupado} onClick={() => accion(`/${r.id}/open`)} className={botonGuardar}>
                            Publish
                        </button>
                    )}
                    {r.status === 'open' && (
                        <button disabled={ocupado} onClick={() => setConfirmar('draw')} className={botonGuardar}>
                            Draw now
                        </button>
                    )}
                    <button onClick={() => setConfirmar(r.status === 'draft' ? 'delete' : 'cancel')} className={enlace}>
                        {r.status === 'draft' ? 'Delete' : 'Cancel and refund'}
                    </button>
                </>
            )}
        </div>
    );

    const contenido = (
        <>
            <div className="flex flex-wrap items-start gap-4">
                <div className="size-20 sm:size-24 shrink-0 rounded-xl bg-blue overflow-hidden grid place-items-center">
                    {r.image ? (
                        <img src={imagenRaffle(r.image)} alt="" className="size-full object-cover" />
                    ) : (
                        <FiImage aria-hidden="true" className="size-7 text-lightblue/60" />
                    )}
                </div>
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <EtiquetaEstado raffle={r} />
                        <h3 className="font-accent uppercase text-yellow text-2xl leading-tight pb-1 wrap-break-word">{r.title}</h3>
                    </div>
                    <p className="text-lightblue/60 text-sm">
                        {cuando} · {r.prizes.map((p) => (p.winners > 1 ? `${p.label} ×${p.winners}` : p.label)).join(', ')}
                    </p>
                    {acciones}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
                {numeros.map(([nombre, valor]) => (
                    <div key={nombre} className="bg-blue/40 rounded-xl p-3">
                        <div className="text-lightblue/70 text-xs uppercase">{nombre}</div>
                        <div className="font-accent text-yellow text-2xl tabular-nums">{valor}</div>
                    </div>
                ))}
            </div>

            {r.status === 'drawn' && (
                <Ganadores
                    raffle={r}
                    quien={quien}
                    ocupado={ocupado}
                    elegidos={elegidos}
                    setElegidos={setElegidos}
                    rerollear={() => accion(`/${r.id}/reroll`, { method: 'POST', body: JSON.stringify({ slots: elegidos }) })}
                />
            )}

            {editable && (
                <Desplegable nombre="Edit">
                    <div className="pt-2">
                        <Formulario
                            inicial={inicial}
                            premios={premios}
                            imagenActual={r.image}
                            textoGuardar="Save changes"
                            bloqueado={r.participants > 0}
                            alGuardar={async (cuerpo, imagen) => {
                                await pedir(`/${r.id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) });
                                if (imagen) await subirImagen(pedir, r.id, imagen);
                                await alCambiar();
                            }}
                        />
                    </div>
                </Desplegable>
            )}

            {r.entries.length > 0 && (
                <Desplegable nombre="Entries" resumen={`${r.entries.length} wallets`}>
                    <ul data-scroll-propio className={`${lista} flex flex-col gap-1 text-sm`}>
                        {r.entries.map((e) => (
                            <li key={e.wallet} className="flex flex-wrap items-center justify-between gap-x-3 py-1 border-b border-lightblue/10">
                                <span className="text-lightblue">{quien(e.wallet)}</span>
                                <span className="text-lightblue/70">
                                    {e.base === 'holder' ? 'Holder' : e.base === 'paid' ? 'Paid' : 'Lost free entry'}
                                    {e.tickets > 0 && ` + ${e.tickets} tickets`} · <span className="text-white">{e.entries}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {r.disqualified.length > 0 && (
                        <p className="text-lightblue/60 text-xs mt-2">
                            {r.disqualified.length} lost their free entry at the draw (no Primals left).
                        </p>
                    )}
                </Desplegable>
            )}

            {error && <p className="text-red-300 text-sm">{error}</p>}
        </>
    );

    if (plana) return <div className="flex flex-col gap-4 bg-blue/40 rounded-2xl p-4">{contenido}</div>;
    return <section className={panel}>{contenido}</section>;
}

function Ganadores({
    raffle: r,
    quien,
    ocupado,
    elegidos,
    setElegidos,
    rerollear,
}: {
    raffle: RaffleAdmin;
    quien: (w: string) => ReactNode;
    ocupado: boolean;
    elegidos: number[];
    setElegidos: (s: number[]) => void;
    rerollear: () => void;
}) {
    const lugares = r.prizes.flatMap((p) => Array.from({ length: p.winners }, () => p));
    return (
        <div className="flex flex-col gap-2">
            <span className={subtitulo}>Winners</span>
            {lugares.length === 0 && <p className="text-lightblue/70 text-sm">No prizes.</p>}
            <ul className="flex flex-col gap-2">
                {lugares.map((p, slot) => {
                    const w = r.winners.find((x) => x.slot === slot);
                    return (
                        <li key={slot} className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-blue rounded-xl px-3 py-2 text-sm">
                            <input
                                type="checkbox"
                                aria-label="Select to reroll"
                                disabled={!w || w.status === 'sent'}
                                checked={elegidos.includes(slot)}
                                onChange={(e) =>
                                    setElegidos(e.target.checked ? [...elegidos, slot] : elegidos.filter((s) => s !== slot))
                                }
                                className="size-4 accent-yellow disabled:opacity-30"
                            />
                            <span className="font-accent uppercase text-yellow leading-none pb-1">{p.label}</span>
                            {w ? (
                                <>
                                    <span className="text-lightblue">{quien(w.wallet)}</span>
                                    <span className="text-lightblue/60">{w.entries} entries</span>
                                    <span className={`ml-auto ${w.status === 'sent' ? 'text-emerald-300' : 'text-yellow'}`}>
                                        {w.status === 'sent' ? (p.kind === 'fog' ? 'Credited' : 'Sent') : 'Pending delivery'}
                                        {w.note && ` · ${w.note}`}
                                    </span>
                                </>
                            ) : (
                                <span className="text-lightblue/60">No winner (not enough players)</span>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
                <button disabled={ocupado || elegidos.length === 0} onClick={rerollear} className={botonChico}>
                    Reroll selected ({elegidos.length})
                </button>
                <span className="text-lightblue/60 text-xs">
                    Draws a new winner for each selected prize among the players who haven't won yet.
                </span>
            </div>
            {r.rerolled.length > 0 && <p className="text-lightblue/60 text-xs">Rerolled out: {r.rerolled.length}.</p>}
            {r.winners.some((w) => w.status === 'pending') && (
                <button onClick={() => irA('deliveries')} className={`${botonChico} self-start`}>
                    Send the prizes in Deliveries
                </button>
            )}
        </div>
    );
}
