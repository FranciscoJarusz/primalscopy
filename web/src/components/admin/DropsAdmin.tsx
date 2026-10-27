import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { FiPlus } from 'react-icons/fi';
import { BACKEND_URL, BACKEND_BASE_URL } from '@/lib/backend';
import { miniaturaDeTrait } from '@/lib/miniaturas';
import { ICONO_FOG_CHICO } from '@/lib/staking';
import PaginasGrilla from '@/components/shared/PaginasGrilla';
import {
    botonChico,
    botonGuardar,
    campo,
    Desplegable,
    etiqueta,
    fecha,
    fog,
    lista,
    panel,
    titulo,
    useQuien,
} from './comun';

// Los drops de traits: un trait exclusivo que se vende con FOG en el
// Cultomizer por un tiempo (ver lib/traitShopStore.js en el backend).

type Estado = 'scheduled' | 'live' | 'ended' | 'sold-out';
type DropAdmin = {
    id: string;
    trait: string;
    price: number;
    startsAt: string;
    endsAt: string | null;
    supply: number | null;
    status: Estado;
    sold: number;
    fog: number;
};
type Desbloqueo = {
    id: string;
    wallet: string;
    trait: string;
    price: number;
    at: string;
};
type Datos = { drops: DropAdmin[]; unlocks: Desbloqueo[] };
type Trait = { file: string; name: string; url: string; updatedAt: string };
type Carpeta = { name: string; isGlobal: boolean; traits: Trait[] };
type Categoria = { name: string; directories: Carpeta[] };
type Pedir = (
    ruta: string,
    init?: RequestInit
) => Promise<Record<string, unknown>>;

type Borrador = {
    trait: string | null;
    price: string;
    supply: string;
    ahora: boolean;
    startsAt: string;
    conFin: boolean;
    dias: string;
};

const ESTADOS: Record<Estado, { nombre: string; clase: string }> = {
    live: { nombre: 'Live', clase: 'bg-yellow text-darkblue' },
    scheduled: { nombre: 'Scheduled', clase: 'bg-lightblue/20 text-lightblue' },
    'sold-out': { nombre: 'Sold out', clase: 'bg-red text-white' },
    ended: { nombre: 'Ended', clase: 'bg-lightblue/20 text-lightblue/70' },
};
const subtitulo = 'font-accent uppercase text-yellow text-xl leading-none pb-1';
const DIA = 86400000;
const DIAS_POR_DEFECTO = 5;
// Debajo de cada miniatura del selector, el nombre.
const ALTO_NOMBRE = 8 + 18;

const aLocal = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
};
const nombreDeUrl = (url: string) =>
    (url.split('/').pop() || url).replace(/\.[a-z0-9]+$/i, '');
const partes = (url: string) => {
    const [, , , categoria = '', carpeta = ''] = url.split('/');
    return { categoria, carpeta };
};
const miniatura = (url: string) =>
    `${BACKEND_BASE_URL}${miniaturaDeTrait(url, { tamano: 'grilla' })}`;

function alcance(url: string) {
    const { categoria, carpeta } = partes(url);
    return carpeta === '_GLOBAL'
        ? `${categoria} · every Primal can wear it`
        : `${categoria} · only Primals with ${carpeta}`;
}

function aBorrador(d: DropAdmin | null): Borrador {
    if (!d) {
        return {
            trait: null,
            price: '',
            supply: '',
            ahora: true,
            startsAt: aLocal(new Date(Date.now() + DIA).toISOString()),
            conFin: true,
            dias: String(DIAS_POR_DEFECTO),
        };
    }
    const dias = d.endsAt
        ? (Date.parse(d.endsAt) - Date.parse(d.startsAt)) / DIA
        : DIAS_POR_DEFECTO;
    return {
        trait: d.trait,
        price: String(d.price),
        supply: d.supply === null ? '' : String(d.supply),
        ahora: false,
        startsAt: aLocal(d.startsAt),
        conFin: d.endsAt !== null,
        dias: String(Math.round(dias * 10) / 10),
    };
}

// El inicio y el fin salen del borrador: "ahora" o una fecha, y una duracion
// en dias desde el inicio.
function fechas(b: Borrador) {
    const inicio = b.ahora ? new Date() : new Date(b.startsAt);
    const dias = Number(b.dias);
    const fin =
        b.conFin && dias > 0 ? new Date(inicio.getTime() + dias * DIA) : null;
    return { inicio, fin };
}

function aCuerpo(b: Borrador) {
    const { inicio, fin } = fechas(b);
    return {
        trait: b.trait,
        price: Number(b.price),
        supply: b.supply.trim() === '' ? null : Number(b.supply),
        startsAt: inicio.toISOString(),
        endsAt: fin ? fin.toISOString() : null,
    };
}

function EtiquetaEstado({ estado }: { estado: Estado }) {
    const e = ESTADOS[estado];
    return (
        <span
            className={`h-7 inline-flex items-center font-accent uppercase rounded-md px-2.5 pb-[0.38em] leading-none text-sm ${e.clase}`}
        >
            {e.nombre}
        </span>
    );
}

// Vive dentro de la pantalla de traits: `alCargar` le pasa que traits tienen
// drop, para marcarlos en la grilla.
export default function DropsAdmin({
    token,
    alCargar,
}: {
    token: string;
    alCargar?: (traits: Set<string>) => void;
}) {
    const [datos, setDatos] = useState<Datos | null>(null);
    const avisar = useRef(alCargar);
    avisar.current = alCargar;
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [creando, setCreando] = useState(false);
    const quien = useQuien();

    const pedir: Pedir = useCallback(
        async (ruta: string, init: RequestInit = {}) => {
            const r = await fetch(`${BACKEND_URL}/admin${ruta}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(init.body
                        ? { 'content-type': 'application/json' }
                        : {}),
                },
            }).catch(() => null);
            const d = await r?.json().catch(() => ({}));
            if (!r?.ok)
                throw new Error(d?.error || "Couldn't reach the server.");
            return d;
        },
        [token]
    );

    const cargar = useCallback(async () => {
        try {
            const [drops, traits] = await Promise.all([
                pedir('/trait-drops'),
                pedir('/traits'),
            ]);
            setDatos(drops as unknown as Datos);
            avisar.current?.(
                new Set((drops as unknown as Datos).drops.map((d) => d.trait))
            );
            setCategorias(
                (traits as unknown as { categories: Categoria[] }).categories
            );
            setError(null);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Couldn't load the drops."
            );
        }
    }, [pedir]);

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    if (!datos)
        return <p className="text-lightblue/70">{error ?? 'Loading...'}</p>;

    const vivos = datos.drops.filter((d) => d.status === 'live');
    const programados = datos.drops.filter((d) => d.status === 'scheduled');
    const terminados = datos.drops.filter(
        (d) => d.status === 'ended' || d.status === 'sold-out'
    );
    const ocupados = new Set(datos.drops.map((d) => d.trait));
    const tarjeta = (d: DropAdmin) => (
        <Tarjeta
            key={d.id}
            drop={d}
            categorias={categorias}
            ocupados={ocupados}
            pedir={pedir}
            alCambiar={cargar}
        />
    );

    return (
        <div className="flex flex-col gap-6 sm:gap-8">
            <section className={panel}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <h2 className={titulo}>Trait drops</h2>
                        <p className="text-lightblue/70 text-sm">
                            {vivos.length} live, {programados.length} scheduled,{' '}
                            {terminados.length} ended
                        </p>
                    </div>
                    {!creando && (
                        <button
                            onClick={() => setCreando(true)}
                            className={`${botonGuardar} inline-flex items-center gap-2`}
                        >
                            <FiPlus aria-hidden="true" className="mt-1.5" /> New
                            drop
                        </button>
                    )}
                </div>
                {creando && (
                    <div className="pt-4 border-t border-lightblue/10">
                        <Formulario
                            inicial={aBorrador(null)}
                            categorias={categorias}
                            ocupados={ocupados}
                            textoGuardar="Create drop"
                            alCancelar={() => setCreando(false)}
                            alGuardar={async (cuerpo) => {
                                await pedir('/trait-drops', {
                                    method: 'POST',
                                    body: JSON.stringify(cuerpo),
                                });
                                setCreando(false);
                                await cargar();
                            }}
                        />
                    </div>
                )}
            </section>

            <section className={panel}>
                <Desplegable nombre="How drops work">
                    <ul className="flex flex-col gap-1.5 text-sm text-lightblue/80 list-disc pl-5">
                        <li>
                            A drop sells one trait with FOG in the Cultomizer,
                            from its start until it ends or sells out.
                        </li>
                        <li>
                            It only shows up while it&apos;s live. Before it
                            starts and after it ends, nobody sees it unless they
                            bought it.
                        </li>
                        <li>
                            Bought once, it stays unlocked for the whole wallet:
                            a trait in a folder for the Primals with that trait,
                            one in _GLOBAL for all of them.
                        </li>
                        <li>
                            A trait with a drop is never free, not even after
                            the drop ends.
                        </li>
                        <li>
                            If someone already bought it you can end the drop,
                            but not delete it.
                        </li>
                    </ul>
                </Desplegable>
            </section>

            <Grupo nombre="Live" vacio="No drop is live right now.">
                {vivos.map(tarjeta)}
            </Grupo>
            {programados.length > 0 && (
                <Grupo nombre="Scheduled">{programados.map(tarjeta)}</Grupo>
            )}
            {terminados.length > 0 && (
                <section className={panel}>
                    <Desplegable
                        nombre="Ended drops"
                        resumen={`${terminados.length}`}
                        grande
                    >
                        <div className="flex flex-col gap-4 pt-2">
                            {terminados.map(tarjeta)}
                        </div>
                    </Desplegable>
                </section>
            )}

            {datos.unlocks.length > 0 && (
                <section className={panel}>
                    <Desplegable
                        nombre="Recent unlocks"
                        resumen={`${datos.unlocks.length} latest`}
                        grande
                    >
                        <ul
                            data-scroll-propio
                            className={`${lista} flex flex-col gap-1.5 text-sm text-lightblue pt-2`}
                        >
                            {datos.unlocks.map((u) => (
                                <li
                                    key={u.id}
                                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                                >
                                    <span>
                                        {quien(u.wallet)} unlocked{' '}
                                        <span className="text-yellow">
                                            {nombreDeUrl(u.trait)}
                                        </span>
                                    </span>
                                    <span className="text-lightblue/60 tabular-nums">
                                        {fog(u.price)} FOG · {fecha(u.at)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Desplegable>
                </section>
            )}
        </div>
    );
}

function Grupo({
    nombre,
    vacio,
    children,
}: {
    nombre: string;
    vacio?: string;
    children: ReactNode[];
}) {
    return (
        <div className="flex flex-col gap-4">
            <h2 className={`${titulo} px-1`}>
                {nombre}{' '}
                <span className="text-lightblue/60 text-lg">
                    {children.length}
                </span>
            </h2>
            {children.length === 0 && vacio ? (
                <p className="text-lightblue/70 px-1">{vacio}</p>
            ) : (
                children
            )}
        </div>
    );
}

function Paso({
    nombre,
    ayuda,
    children,
}: {
    nombre: string;
    ayuda?: string;
    children: ReactNode;
}) {
    return (
        <fieldset className="flex flex-col gap-3 pt-5 border-t border-lightblue/10 first:pt-0 first:border-0 min-w-0">
            <legend className="contents">
                <span className={subtitulo}>{nombre}</span>
            </legend>
            {ayuda && (
                <p className="text-lightblue/60 text-xs -mt-1">{ayuda}</p>
            )}
            {children}
        </fieldset>
    );
}

function Tarjeta({
    drop: d,
    categorias,
    ocupados,
    pedir,
    alCambiar,
}: {
    drop: DropAdmin;
    categorias: Categoria[];
    ocupados: Set<string>;
    pedir: Pedir;
    alCambiar: () => Promise<void>;
}) {
    const [editando, setEditando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const accion = async (
        ruta: string,
        init: RequestInit,
        confirmar: string
    ) => {
        if (!window.confirm(confirmar)) return;
        setOcupado(true);
        setError(null);
        try {
            await pedir(ruta, init);
            await alCambiar();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't do it.");
        }
        setOcupado(false);
    };

    const cuando =
        d.status === 'scheduled'
            ? `Starts ${fecha(d.startsAt)}`
            : d.status === 'live'
              ? d.endsAt
                  ? `Ends ${fecha(d.endsAt)}`
                  : 'No end date'
              : d.endsAt
                ? `Ended ${fecha(d.endsAt)}`
                : 'Sold out';

    return (
        <article className={`${panel} gap-5`}>
            <div className="flex flex-wrap items-center gap-4">
                <img
                    src={miniatura(d.trait)}
                    alt=""
                    className="size-20 shrink-0 rounded-xl bg-white/10 object-contain"
                />
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-accent uppercase text-yellow text-2xl leading-none pb-1 break-all">
                            {nombreDeUrl(d.trait)}
                        </h3>
                        <EtiquetaEstado estado={d.status} />
                    </div>
                    <p className="text-sm text-lightblue/70">
                        {alcance(d.trait)}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setEditando((e) => !e)}
                        disabled={ocupado}
                        className={botonChico}
                    >
                        {editando ? 'Close' : 'Edit'}
                    </button>
                    {(d.status === 'live' || d.status === 'scheduled') && (
                        <button
                            onClick={() =>
                                accion(
                                    `/trait-drops/${d.id}/end`,
                                    { method: 'POST' },
                                    `End the ${nombreDeUrl(d.trait)} drop now?`
                                )
                            }
                            disabled={ocupado}
                            className={botonChico}
                        >
                            End now
                        </button>
                    )}
                    {d.sold === 0 && (
                        <button
                            onClick={() =>
                                accion(
                                    `/trait-drops/${d.id}`,
                                    { method: 'DELETE' },
                                    `Delete the ${nombreDeUrl(d.trait)} drop? The trait goes back to being free for everyone.`
                                )
                            }
                            disabled={ocupado}
                            className="bg-red text-lightblue font-accent uppercase text-sm rounded-md px-3 pb-1 cursor-pointer hover:brightness-110 active:scale-97 transition-all duration-300 disabled:opacity-40"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 m-0 text-sm">
                <Dato nombre="Price">
                    <img src={ICONO_FOG_CHICO} alt="" className="size-4" />
                    {fog(d.price)}
                </Dato>
                <Dato nombre="Sold">
                    {d.supply === null
                        ? fog(d.sold)
                        : `${fog(d.sold)} of ${fog(d.supply)}`}
                </Dato>
                <Dato nombre="FOG in">{fog(d.fog)}</Dato>
                <Dato nombre="When">{cuando}</Dato>
            </dl>

            {error && <p className="text-red-300 text-sm">{error}</p>}

            {editando && (
                <div className="pt-4 border-t border-lightblue/10">
                    <Formulario
                        inicial={aBorrador(d)}
                        categorias={categorias}
                        ocupados={ocupados}
                        textoGuardar="Save changes"
                        alCancelar={() => setEditando(false)}
                        alGuardar={async (cuerpo) => {
                            await pedir(`/trait-drops/${d.id}`, {
                                method: 'PUT',
                                body: JSON.stringify(cuerpo),
                            });
                            setEditando(false);
                            await alCambiar();
                        }}
                    />
                </div>
            )}
        </article>
    );
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1 rounded-xl border border-lightblue/10 bg-lightblue/5 px-3 py-2 min-w-0">
            <dt className="text-xs font-bold uppercase text-lightblue/60">
                {nombre}
            </dt>
            <dd className="m-0 inline-flex items-center gap-1.5 text-white tabular-nums truncate">
                {children}
            </dd>
        </div>
    );
}

function Formulario({
    inicial,
    categorias,
    ocupados,
    textoGuardar,
    alGuardar,
    alCancelar,
}: {
    inicial: Borrador;
    categorias: Categoria[];
    ocupados: Set<string>;
    textoGuardar: string;
    alGuardar: (cuerpo: ReturnType<typeof aCuerpo>) => Promise<void>;
    alCancelar: () => void;
}) {
    const editando = inicial.trait !== null;
    const [b, setB] = useState(inicial);
    const [categoria, setCategoria] = useState(categorias[0]?.name ?? '');
    const [carpeta, setCarpeta] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cambiar = (cambios: Partial<Borrador>) =>
        setB((x) => ({ ...x, ...cambios }));
    const carpetas =
        categorias.find((c) => c.name === categoria)?.directories ?? [];
    const actual =
        carpetas.find((c) => c.name === carpeta) ??
        carpetas.find((c) => c.isGlobal) ??
        carpetas[0];
    const libres = useMemo(
        () => (actual?.traits ?? []).filter((t) => !ocupados.has(t.url)),
        [actual, ocupados]
    );
    const { inicio, fin } = fechas(b);
    const opcion = (activo: boolean) =>
        `rounded-md px-3 pb-1 font-accent uppercase text-sm cursor-pointer transition-all duration-300 ${
            activo
                ? 'bg-yellow text-darkblue'
                : 'bg-blue text-lightblue hover:text-yellow'
        }`;

    const guardar = async () => {
        if (!b.trait) return setError('Pick a trait first.');
        setOcupado(true);
        setError(null);
        try {
            await alGuardar(aCuerpo(b));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
        setOcupado(false);
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                guardar();
            }}
            className="flex flex-col gap-5"
        >
            <Paso
                nombre="1. Trait"
                ayuda={
                    editando
                        ? undefined
                        : 'A trait in a folder is only for the Primals with that trait. One in _GLOBAL is for every Primal.'
                }
            >
                {editando ? (
                    <div className="flex items-center gap-3">
                        <img
                            src={miniatura(b.trait!)}
                            alt=""
                            className="size-14 rounded-lg bg-white/10 object-contain"
                        />
                        <div className="flex flex-col gap-1">
                            <span className="font-accent uppercase text-yellow leading-none pb-0.5">
                                {nombreDeUrl(b.trait!)}
                            </span>
                            <span className="text-xs text-lightblue/60">
                                {alcance(b.trait!)}
                            </span>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-2">
                            {categorias.map((c) => (
                                <button
                                    key={c.name}
                                    type="button"
                                    onClick={() => {
                                        setCategoria(c.name);
                                        setCarpeta(null);
                                    }}
                                    className={opcion(c.name === categoria)}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                        <label className={`${etiqueta} max-w-xs`}>
                            Folder
                            <select
                                value={actual?.name ?? ''}
                                onChange={(e) => setCarpeta(e.target.value)}
                                className={`${campo} cursor-pointer`}
                            >
                                {carpetas.map((c) => (
                                    <option key={c.name} value={c.name}>
                                        {c.isGlobal
                                            ? `${c.name} (every Primal)`
                                            : c.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {libres.length === 0 ? (
                            <p className="text-sm text-lightblue/70">
                                No traits left in this folder without a drop.
                            </p>
                        ) : (
                            <PaginasGrilla
                                key={`${categoria}/${actual?.name}`}
                                items={libres}
                                clave={(t) => t.url}
                                altoExtra={ALTO_NOMBRE}
                                render={(t, lado) => (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            cambiar({ trait: t.url })
                                        }
                                        className="group w-full min-w-0 flex flex-col gap-2 cursor-pointer outline-none"
                                    >
                                        <span
                                            style={{ height: lado }}
                                            className={`block rounded-xl overflow-hidden bg-white/10 transition-all duration-300 ${
                                                b.trait === t.url
                                                    ? 'ring-2 ring-yellow'
                                                    : 'group-hover:ring-2 group-hover:ring-lightblue'
                                            }`}
                                        >
                                            <img
                                                src={`${BACKEND_BASE_URL}${miniaturaDeTrait(t.url, { version: t.updatedAt, tamano: 'grilla' })}`}
                                                alt=""
                                                loading="lazy"
                                                className="w-full h-full object-contain"
                                            />
                                        </span>
                                        <span className="h-[18px] font-accent uppercase text-yellow text-xs sm:text-sm leading-none truncate text-center">
                                            {t.name}
                                        </span>
                                    </button>
                                )}
                            />
                        )}
                        {b.trait && (
                            <p className="text-sm text-lightblue">
                                Picked{' '}
                                <span className="text-yellow">
                                    {nombreDeUrl(b.trait)}
                                </span>{' '}
                                · {alcance(b.trait)}
                            </p>
                        )}
                    </>
                )}
            </Paso>

            <Paso
                nombre="2. Price"
                ayuda="Leave copies empty to sell as many as people want."
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className={etiqueta}>
                        FOG to unlock it
                        <input
                            type="number"
                            min={1}
                            step={1}
                            required
                            value={b.price}
                            onChange={(e) => cambiar({ price: e.target.value })}
                            className={campo}
                        />
                    </label>
                    <label className={etiqueta}>
                        Copies
                        <input
                            type="number"
                            min={1}
                            step={1}
                            value={b.supply}
                            placeholder="Unlimited"
                            onChange={(e) =>
                                cambiar({ supply: e.target.value })
                            }
                            className={campo}
                        />
                    </label>
                </div>
            </Paso>

            <Paso nombre="3. When">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => cambiar({ ahora: true })}
                        className={opcion(b.ahora)}
                    >
                        Start now
                    </button>
                    <button
                        type="button"
                        onClick={() => cambiar({ ahora: false })}
                        className={opcion(!b.ahora)}
                    >
                        Pick a start
                    </button>
                </div>
                {!b.ahora && (
                    <label className={`${etiqueta} max-w-xs`}>
                        Starts
                        <input
                            type="datetime-local"
                            value={b.startsAt}
                            onChange={(e) =>
                                cambiar({ startsAt: e.target.value })
                            }
                            className={campo}
                        />
                    </label>
                )}
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => cambiar({ conFin: true })}
                        className={opcion(b.conFin)}
                    >
                        Lasts some days
                    </button>
                    <button
                        type="button"
                        onClick={() => cambiar({ conFin: false })}
                        className={opcion(!b.conFin)}
                    >
                        No end date
                    </button>
                </div>
                {b.conFin && (
                    <label className={`${etiqueta} max-w-xs`}>
                        Days
                        <input
                            type="number"
                            min={0.1}
                            step="any"
                            value={b.dias}
                            onChange={(e) => cambiar({ dias: e.target.value })}
                            className={campo}
                        />
                    </label>
                )}
                <p className="text-sm text-lightblue">
                    {b.ahora
                        ? 'Starts as soon as you save'
                        : `Starts ${fecha(inicio.toISOString())}`}
                    {fin
                        ? `, ends ${fecha(fin.toISOString())}.`
                        : ', with no end date.'}
                </p>
            </Paso>

            {error && <p className="text-red-300 text-sm">{error}</p>}
            <div className="flex flex-wrap gap-3">
                <button
                    type="submit"
                    disabled={ocupado}
                    className={botonGuardar}
                >
                    {ocupado ? 'Saving...' : textoGuardar}
                </button>
                <button
                    type="button"
                    onClick={alCancelar}
                    className={botonChico}
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
