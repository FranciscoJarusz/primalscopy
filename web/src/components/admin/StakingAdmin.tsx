import { useCallback, useEffect, useState } from 'react';
import {
    FiChevronDown,
    FiChevronUp,
    FiImage,
    FiTrash2,
    FiX,
} from 'react-icons/fi';
import { iconoPremio } from '@/lib/staking';
import StakingWheelsAdmin from './StakingWheelsAdmin';
import { useApodos, walletCorta } from '@/lib/nicknames';
import { BACKEND_URL } from '@/lib/backend';

type Periodo = { days: number; bonus: number };
type Escalon = { min: number; bonus: number };
type Premio = {
    id: string;
    label: string;
    description: string;
    price: number;
    enabled: boolean;
    icon?: string;
    // Cuantos quedan para vender; null, sin limite.
    stock?: number | null;
};
type Config = {
    enabled: boolean;
    dailyRate: number;
    periods: Periodo[];
    quantityTiers: Escalon[];
    catalog: Premio[];
};
type Resumen = {
    config: Config;
    training: number;
    wallets: number;
    totals: { earned: number; spent: number };
    topWallets: {
        wallet: string;
        balance: number;
        earned: number;
        spent: number;
        training: number;
    }[];
    redemptions: {
        id: string;
        wallet: string;
        item: string;
        label: string;
        price: number;
        at: string;
    }[];
    endings: {
        tokenId: string;
        wallet: string;
        reason: string;
        earned: number;
        bonusLost?: number;
        at: string;
    }[];
};
// Lo que se edita en el formulario: numeros como texto para poder borrarlos
// mientras se escribe.
type Borrador = {
    dailyRate: string;
    periods: { days: string; bonus: string }[];
    quantityTiers: { min: string; bonus: string }[];
    catalog: (Omit<Premio, 'price' | 'stock'> & { price: string; stock: string })[];
};

const campo =
    'w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-medium text-base leading-normal! rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow';
const etiqueta = 'flex flex-col gap-1 text-sm text-lightblue/80';
const botonChico =
    'bg-lightblue text-darkblue font-accent uppercase text-sm rounded-md px-3 pb-1 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-40';
const panel =
    'flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50';
const titulo = 'font-accent uppercase text-yellow text-2xl';

const fog = (n: number) => n.toLocaleString('en-US');
const fecha = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
const MOTIVOS: Record<string, string> = {
    transferred: 'Sold or transferred',
    listed: 'Listed for sale',
    unstaked: 'Unstaked early',
};

const aBorrador = (c: Config): Borrador => ({
    dailyRate: String(c.dailyRate),
    periods: c.periods.map((p) => ({
        days: String(p.days),
        bonus: String(p.bonus),
    })),
    quantityTiers: c.quantityTiers.map((t) => ({
        min: String(t.min),
        bonus: String(t.bonus),
    })),
    catalog: c.catalog.map((i) => ({
        ...i,
        price: String(i.price),
        stock: i.stock === null || i.stock === undefined ? '' : String(i.stock),
    })),
});

export default function StakingAdmin({ token }: { token: string }) {
    const apodos = useApodos();
    // El apodo (si tiene) y la wallet corta al lado.
    const quien = (w: string) =>
        apodos[w.toLowerCase()] ? `${apodos[w.toLowerCase()]} · ${walletCorta(w)}` : walletCorta(w);

    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [borrador, setBorrador] = useState<Borrador | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [guardado, setGuardado] = useState(false);
    const [verificando, setVerificando] = useState(false);
    const [verificacion, setVerificacion] = useState<string | null>(null);
    const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(
        null
    );
    const [subiendoIcono, setSubiendoIcono] = useState<string | null>(null);

    const auth = useCallback(
        (extra: HeadersInit = {}) => ({
            Authorization: `Bearer ${token}`,
            ...extra,
        }),
        [token]
    );

    const cargar = useCallback(
        async (pisarBorrador = true) => {
            setError(null);
            try {
                const respuesta = await fetch(`${BACKEND_URL}/admin/staking`, {
                    headers: auth(),
                });
                if (!respuesta.ok) throw new Error();
                const datos: Resumen = await respuesta.json();
                setResumen(datos);
                if (pisarBorrador) setBorrador(aBorrador(datos.config));
            } catch {
                setError("Couldn't load staking.");
            }
        },
        [auth]
    );

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    const enviar = async (cambios: object) => {
        const respuesta = await fetch(`${BACKEND_URL}/admin/staking/config`, {
            method: 'PATCH',
            headers: auth({ 'content-type': 'application/json' }),
            body: JSON.stringify(cambios),
        });
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw new Error(datos.error || "Couldn't save.");
        return datos as Config;
    };

    // Abrir o cerrar se aplica al toque, sin tocar el resto del formulario.
    const alternarAbierto = async () => {
        if (!resumen) return;
        setError(null);
        try {
            const config = await enviar({ enabled: !resumen.config.enabled });
            setResumen({ ...resumen, config });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
    };

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!borrador) return;
        setGuardando(true);
        setGuardado(false);
        setError(null);
        try {
            await enviar({
                dailyRate: Number(borrador.dailyRate),
                periods: borrador.periods.map((p) => ({
                    days: Number(p.days),
                    bonus: Number(p.bonus),
                })),
                quantityTiers: borrador.quantityTiers.map((t) => ({
                    min: Number(t.min),
                    bonus: Number(t.bonus),
                })),
                catalog: borrador.catalog.map((i) => ({
                    id: i.id,
                    label: i.label,
                    description: i.description,
                    price: Number(i.price),
                    stock: i.stock.trim() === '' ? null : Number(i.stock),
                    enabled: i.enabled,
                })),
                order: borrador.catalog.map((i) => i.id),
            });
            await cargar();
            setGuardado(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
        setGuardando(false);
    };

    const verificar = async () => {
        setVerificando(true);
        setVerificacion(null);
        try {
            const respuesta = await fetch(
                `${BACKEND_URL}/admin/staking/verify`,
                {
                    method: 'POST',
                    headers: auth(),
                }
            );
            const d = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok) throw new Error(d.error);
            setVerificacion(
                d.checked === 0
                    ? 'Nothing is training.'
                    : `${d.checked} checked. Finished ${d.ended.completed}, sold ${d.ended.transferred}, listed ${d.ended.listed}.${
                          d.listingsChecked
                              ? ''
                              : " OpenSea didn't answer, so no days were credited."
                      }`
            );
            await cargar(false);
        } catch (err) {
            setVerificacion(
                (err instanceof Error && err.message) ||
                    "Couldn't check right now."
            );
        }
        setVerificando(false);
    };

    const editarEscalon = (
        i: number,
        cambio: Partial<{ min: string; bonus: string }>
    ) =>
        borrador &&
        setBorrador({
            ...borrador,
            quantityTiers: borrador.quantityTiers.map((t, j) =>
                j === i ? { ...t, ...cambio } : t
            ),
        });

    const editarPeriodo = (
        i: number,
        cambio: Partial<{ days: string; bonus: string }>
    ) =>
        borrador &&
        setBorrador({
            ...borrador,
            periods: borrador.periods.map((p, j) =>
                j === i ? { ...p, ...cambio } : p
            ),
        });

    // Borrar va directo al server, sin esperar a "Save changes": pide un
    // segundo clic para confirmar. Lo demas que se este editando no se pierde.
    const borrarPremio = async (id: string) => {
        if (confirmarBorrado !== id) {
            setConfirmarBorrado(id);
            return;
        }
        setConfirmarBorrado(null);
        setError(null);
        try {
            const config = await enviar({ removeCatalog: id });
            setResumen((r) => (r ? { ...r, config } : r));
            setBorrador((b) =>
                b ? { ...b, catalog: b.catalog.filter((p) => p.id !== id) } : b
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't delete it.");
        }
    };

    // El icono va directo al server, como borrar: no espera a "Save changes" y
    // no pisa lo demas que se este editando. Sin archivo, vuelve al de siempre.
    const cambiarIcono = async (id: string, archivo: File | null) => {
        setSubiendoIcono(id);
        setError(null);
        try {
            let respuesta: Response;
            if (archivo) {
                const datos = new FormData();
                datos.append('file', archivo);
                respuesta = await fetch(
                    `${BACKEND_URL}/admin/staking/icon/${id}`,
                    { method: 'POST', headers: auth(), body: datos }
                );
            } else {
                respuesta = await fetch(
                    `${BACKEND_URL}/admin/staking/icon/${id}`,
                    { method: 'DELETE', headers: auth() }
                );
            }
            const datos = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok) {
                throw new Error(datos.error || "Couldn't change the icon.");
            }
            const config = datos as Config;
            const icon = config.catalog.find((p) => p.id === id)?.icon;
            setResumen((r) => (r ? { ...r, config } : r));
            setBorrador((b) =>
                b
                    ? {
                          ...b,
                          catalog: b.catalog.map((p) =>
                              p.id === id ? { ...p, icon } : p
                          ),
                      }
                    : b
            );
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Couldn't change the icon."
            );
        }
        setSubiendoIcono(null);
    };

    // Sube o baja un premio en la lista. Se guarda con "Save changes", y la
    // pagina de staking los muestra en este mismo orden.
    const moverPremio = (i: number, paso: -1 | 1) =>
        borrador &&
        setBorrador({
            ...borrador,
            catalog: borrador.catalog.map((p, j) =>
                j === i
                    ? borrador.catalog[i + paso]
                    : j === i + paso
                      ? borrador.catalog[i]
                      : p
            ),
        });

    const editarPremio = (
        id: string,
        cambio: Partial<Borrador['catalog'][number]>
    ) =>
        borrador &&
        setBorrador({
            ...borrador,
            catalog: borrador.catalog.map((p) =>
                p.id === id ? { ...p, ...cambio } : p
            ),
        });

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                    Staking
                </h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    Holders train their Primals to earn FOG. Changes to the rate
                    and bonuses apply to new trainings; the ones already running
                    keep the rate they started with.
                </p>
            </div>

            {error && <p className="text-red-300">{error}</p>}

            {resumen && (
                <div className={panel}>
                    <div className="flex flex-wrap items-center gap-3">
                        <span
                            className={`rounded-md px-2.5 uppercase ${
                                resumen.config.enabled
                                    ? 'bg-green-400/15 text-green-300'
                                    : 'bg-red-400/15 text-red-300'
                            }`}
                        >
                            {resumen.config.enabled ? 'Open' : 'Closed'}
                        </span>
                        <span className="text-lightblue/80 text-sm flex-1">
                            {resumen.config.enabled
                                ? 'Holders can start new trainings.'
                                : 'Nobody can start a new training. Running ones keep going.'}
                        </span>
                        <button
                            onClick={alternarAbierto}
                            className={botonChico}
                        >
                            {resumen.config.enabled ? 'Close' : 'Open'}
                        </button>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            ['Primals training', fog(resumen.training)],
                            ['Wallets training', fog(resumen.wallets)],
                            ['FOG earned', fog(resumen.totals.earned)],
                            ['FOG spent', fog(resumen.totals.spent)],
                        ].map(([nombre, valor]) => (
                            <div
                                key={nombre}
                                className="bg-blue rounded-xl px-4 py-3"
                            >
                                <div className="text-lightblue/70 text-xs uppercase tracking-wide">
                                    {nombre}
                                </div>
                                <div className="font-accent text-yellow text-3xl">
                                    {valor}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={verificar}
                            disabled={verificando}
                            className={botonChico}
                        >
                            {verificando
                                ? 'Checking...'
                                : 'Check owners and listings now'}
                        </button>
                        <span className="text-lightblue/70 text-sm">
                            {verificacion ??
                                'It runs on its own every 10 minutes.'}
                        </span>
                    </div>
                </div>
            )}

            {borrador && (
                <form onSubmit={guardar} className={panel}>
                    <h2 className={titulo}>Rates</h2>
                    <label className={`${etiqueta} max-w-48`}>
                        FOG per day, per Primal
                        <input
                            type="number"
                            min={0}
                            value={borrador.dailyRate}
                            onChange={(e) =>
                                setBorrador({
                                    ...borrador,
                                    dailyRate: e.target.value,
                                })
                            }
                            className={campo}
                        />
                    </label>
                    <div className="flex flex-col gap-2">
                        <div className="text-sm text-lightblue/80">Periods</div>
                        <div className="flex flex-wrap items-stretch gap-3">
                            {borrador.periods.map((p, i) => {
                                const porDia = Math.floor(
                                    (Number(borrador.dailyRate) *
                                        (100 + Number(p.bonus))) /
                                        100
                                );
                                return (
                                    <div
                                        key={i}
                                        className="relative flex flex-col gap-2 bg-blue rounded-xl p-3 pr-9"
                                    >
                                        <div className="flex gap-2">
                                            <label className={`${etiqueta} w-20`}>
                                                Days
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={365}
                                                    value={p.days}
                                                    onChange={(e) =>
                                                        editarPeriodo(i, {
                                                            days: e.target.value,
                                                        })
                                                    }
                                                    className={campo}
                                                />
                                            </label>
                                            <label className={`${etiqueta} w-20`}>
                                                Bonus %
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={p.bonus}
                                                    onChange={(e) =>
                                                        editarPeriodo(i, {
                                                            bonus: e.target.value,
                                                        })
                                                    }
                                                    className={campo}
                                                />
                                            </label>
                                        </div>
                                        <span className="text-lightblue/70 text-sm">
                                            ={' '}
                                            {Number.isFinite(porDia)
                                                ? fog(porDia)
                                                : '?'}{' '}
                                            FOG/day
                                        </span>
                                        <button
                                            type="button"
                                            aria-label="Remove period"
                                            disabled={borrador.periods.length === 1}
                                            onClick={() =>
                                                setBorrador({
                                                    ...borrador,
                                                    periods:
                                                        borrador.periods.filter(
                                                            (_, j) => j !== i
                                                        ),
                                                })
                                            }
                                            className="absolute top-2 right-2 text-lightblue/60 hover:text-red-300 cursor-pointer transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <FiX className="w-5 h-5" />
                                        </button>
                                    </div>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() =>
                                    setBorrador({
                                        ...borrador,
                                        periods: [
                                            ...borrador.periods,
                                            { days: '', bonus: '0' },
                                        ],
                                    })
                                }
                                className={`self-center ${botonChico}`}
                            >
                                Add period
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="text-sm text-lightblue/80">
                            Quantity bonus
                        </div>
                        <p className="text-lightblue/70 text-sm -mt-1">
                            From how many Primals staking at once each one gets
                            the extra %. It adds to the region bonus, and it is
                            recalculated every day with what the wallet has
                            staking. New trainings take the tiers saved here;
                            the ones already running keep theirs.
                        </p>
                        <div className="flex flex-wrap items-stretch gap-3">
                            {borrador.quantityTiers.map((t, i) => (
                                <div
                                    key={i}
                                    className="relative flex gap-2 bg-blue rounded-xl p-3 pr-9"
                                >
                                    <label className={`${etiqueta} w-20`}>
                                        From
                                        <input
                                            type="number"
                                            min={1}
                                            value={t.min}
                                            onChange={(e) =>
                                                editarEscalon(i, {
                                                    min: e.target.value,
                                                })
                                            }
                                            className={campo}
                                        />
                                    </label>
                                    <label className={`${etiqueta} w-20`}>
                                        Bonus %
                                        <input
                                            type="number"
                                            min={0}
                                            value={t.bonus}
                                            onChange={(e) =>
                                                editarEscalon(i, {
                                                    bonus: e.target.value,
                                                })
                                            }
                                            className={campo}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        aria-label="Remove tier"
                                        onClick={() =>
                                            setBorrador({
                                                ...borrador,
                                                quantityTiers:
                                                    borrador.quantityTiers.filter(
                                                        (_, j) => j !== i
                                                    ),
                                            })
                                        }
                                        className="absolute top-2 right-2 text-lightblue/60 hover:text-red-300 cursor-pointer transition-all duration-300"
                                    >
                                        <FiX className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() =>
                                    setBorrador({
                                        ...borrador,
                                        quantityTiers: [
                                            ...borrador.quantityTiers,
                                            { min: '', bonus: '0' },
                                        ],
                                    })
                                }
                                className={`self-center ${botonChico}`}
                            >
                                Add tier
                            </button>
                        </div>
                    </div>

                    <h2 className={`${titulo} mt-4`}>Rewards</h2>
                    <p className="text-lightblue/70 text-sm -mt-2">
                        The Reroll ticket is delivered automatically, every key
                        opens a prize wheel, and APE is
                        sent by hand (it shows up under Deliveries). Stock is
                        how many are left to sell: empty is unlimited, 0 shows
                        &quot;Sold out&quot;. APE starts at 0 so it isn&apos;t
                        sold by accident. The rest show a &quot;Soon&quot;
                        label. Hide a reward to take it off the
                        page for a while, or delete it to remove it for good.
                        Click an icon to upload a new one (PNG, JPG, GIF or
                        WebP); it changes right away.
                    </p>
                    <div className="flex flex-col gap-3">
                        {borrador.catalog.map((item, i) => (
                            <div
                                key={item.id}
                                className={`grid gap-3 sm:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,2fr)_8rem_6rem_auto_auto] items-end ${
                                    item.enabled ? '' : 'opacity-50'
                                }`}
                            >
                                <div className="h-9 flex sm:flex-col items-center sm:justify-center gap-1 sm:gap-0">
                                    <button
                                        type="button"
                                        aria-label={`Move ${item.label} up`}
                                        disabled={i === 0}
                                        onClick={() => moverPremio(i, -1)}
                                        className="text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-lightblue/60"
                                    >
                                        <FiChevronUp className="w-4.5 h-4.5" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Move ${item.label} down`}
                                        disabled={i === borrador.catalog.length - 1}
                                        onClick={() => moverPremio(i, 1)}
                                        className="text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-lightblue/60"
                                    >
                                        <FiChevronDown className="w-4.5 h-4.5" />
                                    </button>
                                </div>
                                <div className="flex items-end gap-2">
                                    <label
                                        title="Upload a new icon"
                                        className={`relative size-16 shrink-0 grid place-items-center rounded-xl bg-blue cursor-pointer hover:ring-2 hover:ring-yellow transition-all duration-300 ${
                                            subiendoIcono === item.id
                                                ? 'opacity-50 pointer-events-none'
                                                : ''
                                        }`}
                                    >
                                        {iconoPremio(item) ? (
                                            <img
                                                src={iconoPremio(item)!}
                                                alt=""
                                                className="size-14 object-contain"
                                            />
                                        ) : (
                                            <FiImage className="w-6 h-6 text-lightblue/60" />
                                        )}
                                        <input
                                            type="file"
                                            accept=".png,.jpg,.jpeg,.gif,.webp"
                                            className="sr-only"
                                            onChange={(e) => {
                                                const archivo =
                                                    e.target.files?.[0];
                                                e.target.value = '';
                                                if (archivo)
                                                    cambiarIcono(item.id, archivo);
                                            }}
                                        />
                                    </label>
                                    {item.icon && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                cambiarIcono(item.id, null)
                                            }
                                            disabled={subiendoIcono === item.id}
                                            title="Go back to the default icon"
                                            className="text-xs text-lightblue/60 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                                        >
                                            Default
                                        </button>
                                    )}
                                </div>
                                <label className={etiqueta}>
                                    Name
                                    <input
                                        value={item.label}
                                        maxLength={40}
                                        onChange={(e) =>
                                            editarPremio(item.id, {
                                                label: e.target.value,
                                            })
                                        }
                                        className={campo}
                                    />
                                </label>
                                <label className={etiqueta}>
                                    Description
                                    <input
                                        value={item.description}
                                        maxLength={120}
                                        onChange={(e) =>
                                            editarPremio(item.id, {
                                                description: e.target.value,
                                            })
                                        }
                                        className={campo}
                                    />
                                </label>
                                <label className={etiqueta}>
                                    Price (FOG)
                                    <input
                                        type="number"
                                        min={1}
                                        value={item.price}
                                        onChange={(e) =>
                                            editarPremio(item.id, {
                                                price: e.target.value,
                                            })
                                        }
                                        className={campo}
                                    />
                                </label>
                                <label className={etiqueta} title="How many are left to sell. Empty means unlimited.">
                                    Stock
                                    <input
                                        type="number"
                                        min={0}
                                        value={item.stock}
                                        placeholder="∞"
                                        onChange={(e) =>
                                            editarPremio(item.id, {
                                                stock: e.target.value,
                                            })
                                        }
                                        className={campo}
                                    />
                                </label>
                                <label className="h-9 flex items-center gap-2 text-sm text-lightblue cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={item.enabled}
                                        onChange={(e) =>
                                            editarPremio(item.id, {
                                                enabled: e.target.checked,
                                            })
                                        }
                                        className="w-4 h-4 accent-yellow"
                                    />
                                    Shown
                                </label>
                                <button
                                    type="button"
                                    onClick={() => borrarPremio(item.id)}
                                    onBlur={() =>
                                        setConfirmarBorrado((c) =>
                                            c === item.id ? null : c
                                        )
                                    }
                                    aria-label={`Delete ${item.label}`}
                                    className={`justify-self-start h-9 inline-flex items-center gap-1.5 rounded-md px-2 text-sm cursor-pointer transition-all duration-300 ${
                                        confirmarBorrado === item.id
                                            ? 'bg-red-400/20 text-red-300'
                                            : 'text-lightblue/60 hover:text-red-300'
                                    }`}
                                >
                                    <FiTrash2 className="w-4 h-4" />
                                    {confirmarBorrado === item.id && 'Delete?'}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                        <button
                            type="submit"
                            disabled={guardando}
                            className="bg-yellow text-darkblue font-accent uppercase rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40"
                        >
                            {guardando ? 'Saving...' : 'Save changes'}
                        </button>
                        {guardado && (
                            <span className="text-green-300 text-sm">
                                Saved.
                            </span>
                        )}
                    </div>
                </form>
            )}

            {resumen && (
                <StakingWheelsAdmin
                    token={token}
                    nombres={Object.fromEntries(
                        resumen.config.catalog.map((i) => [i.id, i.label])
                    )}
                />
            )}

            {resumen && (
                <div className="grid gap-5 sm:gap-8 lg:grid-cols-2">
                    <div className={panel}>
                        <h2 className={titulo}>Wallets</h2>
                        {resumen.topWallets.length === 0 ? (
                            <p className="text-lightblue/70">
                                Nobody has trained yet.
                            </p>
                        ) : (
                            <table className="w-full text-sm text-lightblue">
                                <thead className="text-lightblue/60 text-left">
                                    <tr>
                                        <th className="font-normal pb-2">
                                            Wallet
                                        </th>
                                        <th className="font-normal pb-2 text-right">
                                            Training
                                        </th>
                                        <th className="font-normal pb-2 text-right">
                                            Spent
                                        </th>
                                        <th className="font-normal pb-2 text-right">
                                            Balance
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resumen.topWallets.map((w) => (
                                        <tr
                                            key={w.wallet}
                                            className="border-t border-lightblue/10"
                                        >
                                            <td className="py-1.5 font-mono">
                                                {quien(w.wallet)}
                                            </td>
                                            <td className="py-1.5 text-right">
                                                {w.training}
                                            </td>
                                            <td className="py-1.5 text-right">
                                                {fog(w.spent)}
                                            </td>
                                            <td className="py-1.5 text-right text-yellow">
                                                {fog(w.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <div className="flex flex-col gap-5 sm:gap-8">
                        <div className={panel}>
                            <h2 className={titulo}>Redemptions</h2>
                            {resumen.redemptions.length === 0 ? (
                                <p className="text-lightblue/70">
                                    No redemptions yet.
                                </p>
                            ) : (
                                <ul className="text-sm text-lightblue flex flex-col gap-1.5">
                                    {resumen.redemptions.map((r) => (
                                        <li key={r.id} className="flex gap-3">
                                            <span className="text-lightblue/60 w-28 shrink-0">
                                                {fecha(r.at)}
                                            </span>
                                            <span className="font-mono">
                                                {quien(r.wallet)}
                                            </span>
                                            <span className="flex-1 text-right">
                                                {/* El nombre de hoy: si el premio se renombro, el viejo confunde. */}
                                                {resumen.config.catalog.find((i) => i.id === r.item)?.label ?? r.label} · {fog(r.price)} FOG
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className={panel}>
                            <h2 className={titulo}>Stopped early</h2>
                            {resumen.endings.length === 0 ? (
                                <p className="text-lightblue/70">
                                    No Primal was sold, listed or unstaked
                                    while training.
                                </p>
                            ) : (
                                <ul className="text-sm text-lightblue flex flex-col gap-1.5">
                                    {resumen.endings.map((e, i) => (
                                        <li key={i} className="flex gap-3">
                                            <span className="text-lightblue/60 w-28 shrink-0">
                                                {fecha(e.at)}
                                            </span>
                                            <span>#{e.tokenId}</span>
                                            <span className="flex-1 text-right">
                                                {MOTIVOS[e.reason] ?? e.reason}{' '}
                                                · kept {fog(e.earned)} FOG
                                                {e.bonusLost
                                                    ? `, lost ${fog(e.bonusLost)} of bonus`
                                                    : ''}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
