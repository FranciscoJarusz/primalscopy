import { useCallback, useEffect, useState } from 'react';
import { FiX } from 'react-icons/fi';
import BoostAdmin, { type BoostGuardado } from './BoostAdmin';
import { BACKEND_URL } from '@/lib/backend';
import {
    botonChico,
    botonGuardar,
    campo,
    etiqueta,
    fecha,
    fog,
    lista,
    panel,
    titulo,
    useQuien,
} from './comun';

type Periodo = { days: number; bonus: number };
type Escalon = { min: number; bonus: number };
type Config = {
    enabled: boolean;
    dailyRate: number;
    periods: Periodo[];
    quantityTiers: Escalon[];
    oneOfOneBonus: { bonus: number; from: string }[];
    boosts?: BoostGuardado[];
};
type Resumen = {
    config: Config;
    oneOfOnes: { tokenId: string; training: boolean }[];
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
    oneOfOneBonus: string;
};

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
    oneOfOneBonus: String(c.oneOfOneBonus.at(-1)?.bonus ?? 0),
});

export default function StakingAdmin({ token }: { token: string }) {
    const quien = useQuien();

    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [borrador, setBorrador] = useState<Borrador | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [guardado, setGuardado] = useState(false);
    const [verificando, setVerificando] = useState(false);
    const [verificacion, setVerificacion] = useState<string | null>(null);

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
                oneOfOneBonus: Number(borrador.oneOfOneBonus),
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

            {resumen && (
                <div className={panel}>
                    <BoostAdmin
                        boosts={resumen.config.boosts ?? []}
                        enviar={async (cambios) => {
                            const config = await enviar(cambios);
                            setResumen((r) => (r ? { ...r, config } : r));
                        }}
                    />
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

                    {resumen && (
                        <div className="flex flex-col gap-2">
                            <div className="text-sm text-lightblue/80">
                                1/1 bonus
                            </div>
                            <p className="text-lightblue/70 text-sm -mt-1">
                                Extra % for the 1/1 pieces. It adds to the
                                region and quantity bonus, and it applies from
                                the moment you save to every 1/1, also the ones
                                already training. Days already earned don't
                                change.
                            </p>
                            <div className="flex flex-wrap items-end gap-4">
                                <label className={`${etiqueta} w-28`}>
                                    Bonus %
                                    <input
                                        type="number"
                                        min={0}
                                        max={1000}
                                        value={borrador.oneOfOneBonus}
                                        onChange={(e) =>
                                            setBorrador({
                                                ...borrador,
                                                oneOfOneBonus: e.target.value,
                                            })
                                        }
                                        className={campo}
                                    />
                                </label>
                                <div className="flex flex-wrap gap-1.5 pb-1">
                                    {resumen.oneOfOnes.map((u) => (
                                        <span
                                            key={u.tokenId}
                                            title={
                                                u.training
                                                    ? 'Training now'
                                                    : 'Not training'
                                            }
                                            className={`rounded-md px-2 py-0.5 text-sm ${
                                                u.training
                                                    ? 'bg-green-400/15 text-green-300'
                                                    : 'bg-blue text-lightblue/60'
                                            }`}
                                        >
                                            #{u.tokenId}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                        <button
                            type="submit"
                            disabled={guardando}
                            className={botonGuardar}
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
                <div className="grid gap-5 sm:gap-8 lg:grid-cols-2">
                    <div className={panel}>
                        <h2 className={titulo}>Wallets</h2>
                        {resumen.topWallets.length === 0 ? (
                            <p className="text-lightblue/70">
                                Nobody has trained yet.
                            </p>
                        ) : (
                            <div className={lista} data-scroll-propio>
                            <table className="w-full text-sm text-lightblue">
                                <thead className="sticky top-0 bg-darkblue text-lightblue/60 text-left">
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
                                            <td className="py-1.5 text-right text-yellow font-semibold">
                                                {fog(w.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-5 sm:gap-8">
                        <div className={panel}>
                            <h2 className={titulo}>Stopped early</h2>
                            {resumen.endings.length === 0 ? (
                                <p className="text-lightblue/70">
                                    No Primal was sold, listed or unstaked
                                    while training.
                                </p>
                            ) : (
                                <ul data-scroll-propio className={`${lista} text-sm text-lightblue flex flex-col gap-1.5`}>
                                    {resumen.endings.map((e, i) => (
                                        <li key={i} className="flex gap-3">
                                            <span className="text-lightblue/60 w-32 shrink-0 whitespace-nowrap">
                                                {fecha(e.at)}
                                            </span>
                                            <b className="text-white font-semibold">#{e.tokenId}</b>
                                            <span className="flex-1 text-right">
                                                {MOTIVOS[e.reason] ?? e.reason}{' '}
                                                · kept <span className="text-yellow">{fog(e.earned)} FOG</span>
                                                {e.bonusLost ? (
                                                    <>
                                                        , lost <span className="text-red-300">{fog(e.bonusLost)}</span> of bonus
                                                    </>
                                                ) : null}
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
