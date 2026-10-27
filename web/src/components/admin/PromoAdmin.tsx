import { useCallback, useEffect, useState } from 'react';
import { FiArrowUpRight, FiCheck, FiChevronDown, FiCopy } from 'react-icons/fi';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import { useApodos } from '@/lib/nicknames';
import { BACKEND_URL } from '@/lib/backend';
import { alRegalar, tomarRegalo } from '@/lib/admin';
import { sufijoPlural } from '@/lib/promo';

type Estado = 'active' | 'expired' | 'exhausted' | 'disabled';
type Codigo = {
    code: string;
    reward: string;
    amount: number;
    maxUses: number;
    uses: number;
    expiresAt: string | null;
    note: string;
    active: boolean;
    archived: boolean;
    status: Estado;
    createdAt: string;
    redemptions: { wallet: string; at: string }[];
};
// `max`: cuanto puede dar un canje (las keys, 1). `plural`: si el nombre lleva
// "s" ("2 Forge rolls"; el FOG no).
type Premio = { id: string; label: string; max: number; plural: boolean };

const ESTADOS: Record<Estado, { texto: string; clase: string }> = {
    active: { texto: 'Active', clase: 'bg-green-400/15 text-green-300' },
    expired: { texto: 'Expired', clase: 'bg-lightblue/10 text-lightblue/60' },
    exhausted: { texto: 'Used up', clase: 'bg-yellow/15 text-yellow' },
    disabled: { texto: 'Disabled', clase: 'bg-red-400/15 text-red-300' },
};

const campo =
    'w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-medium text-base leading-normal! rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow';
const etiqueta = 'flex flex-col gap-1 text-sm text-lightblue/80';
const botonChico =
    'bg-lightblue text-darkblue font-accent uppercase text-sm rounded-md px-3 pb-1 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-40';

const fecha = (iso: string, conHora = false) =>
    new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
    });

function enUnaSemana() {
    const d = new Date(Date.now() + 7 * 86400000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

const vacio = () => ({
    code: '',
    reward: 'forge-roll',
    amount: '1',
    maxUses: '50',
    vence: true,
    expiresAt: enUnaSemana(),
    note: '',
});

export default function PromoAdmin({ token }: { token: string }) {
    const apodos = useApodos();

    const [codigos, setCodigos] = useState<Codigo[] | null>(null);
    const [premios, setPremios] = useState<Premio[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState(vacio);
    const [creando, setCreando] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [nuevo, setNuevo] = useState<string | null>(null);
    const [abierto, setAbierto] = useState<string | null>(null);
    const [copiado, setCopiado] = useState<string | null>(null);
    const [cambiando, setCambiando] = useState<string | null>(null);
    const [verArchivados, setVerArchivados] = useState(false);

    const auth = useCallback(
        (extra: HeadersInit = {}) => ({
            Authorization: `Bearer ${token}`,
            ...extra,
        }),
        [token]
    );

    const cargar = useCallback(async () => {
        setError(null);
        try {
            const respuesta = await fetch(`${BACKEND_URL}/admin/promo`, {
                headers: auth(),
            });
            if (!respuesta.ok) throw new Error();
            const datos = await respuesta.json();
            setCodigos(datos.codes);
            setPremios(datos.rewards);
        } catch {
            setError("Couldn't load the codes.");
        }
    }, [auth]);

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    useEffect(() => {
        const tomar = () => {
            const premio = tomarRegalo();
            if (!premio) return;
            cargar();
            setForm((f) => ({ ...f, reward: premio, amount: '1' }));
            setNuevo(null);
        };
        tomar();
        return alRegalar(tomar);
    }, [cargar]);

    const crear = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreando(true);
        setFormError(null);
        try {
            const respuesta = await fetch(`${BACKEND_URL}/admin/promo`, {
                method: 'POST',
                headers: auth({ 'content-type': 'application/json' }),
                body: JSON.stringify({
                    code: form.code.trim() || undefined,
                    reward: form.reward,
                    amount: Number(form.amount),
                    maxUses: Number(form.maxUses),
                    expiresAt: form.vence
                        ? new Date(form.expiresAt).toISOString()
                        : null,
                    note: form.note,
                }),
            });
            const datos = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok)
                throw new Error(datos.error || "Couldn't create the code.");
            setCodigos((l) => [datos, ...(l ?? [])]);
            setNuevo(datos.code);
            setForm(vacio());
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : "Couldn't create the code."
            );
        } finally {
            setCreando(false);
        }
    };

    // Activar/desactivar o archivar. Archivar no borra: el codigo sale de la
    // lista pero quedan sus canjes. Solo se archiva uno que ya no sirve.
    const actualizar = async (
        c: Codigo,
        cambio: { active: boolean } | { archived: boolean }
    ) => {
        setCambiando(c.code);
        setError(null);
        try {
            const respuesta = await fetch(
                `${BACKEND_URL}/admin/promo/${c.code}`,
                {
                    method: 'PATCH',
                    headers: auth({ 'content-type': 'application/json' }),
                    body: JSON.stringify(cambio),
                }
            );
            const datos = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok) throw new Error(datos.error);
            setCodigos(
                (l) => l?.map((x) => (x.code === c.code ? datos : x)) ?? null
            );
        } catch (err) {
            setError(
                (err instanceof Error && err.message) ||
                    `Couldn't update ${c.code}.`
            );
        } finally {
            setCambiando(null);
        }
    };

    const archivados = codigos?.filter((c) => c.archived).length ?? 0;
    const visibles =
        codigos?.filter((c) => c.archived === verArchivados) ?? null;

    const copiar = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiado(code);
            setTimeout(() => setCopiado((c) => (c === code ? null : c)), 1500);
        } catch {}
    };

    const nombrePremio = (c: Pick<Codigo, 'reward' | 'amount'>) => {
        const premio = premios.find((p) => p.id === c.reward);
        const label = premio?.label ?? c.reward;
        const plural = (premio?.plural ?? true) && c.amount !== 1;
        return `${c.amount.toLocaleString('en-US')} ${label}${plural ? sufijoPlural(label) : ''}`;
    };

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                    Promo Codes
                </h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    Create codes to share on Discord or X. Any connected wallet
                    can redeem them, Primal or not, once per code.
                </p>
            </div>

            <form
                onSubmit={crear}
                className="flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50"
            >
                <h2 className="font-accent uppercase text-yellow text-2xl">
                    New code
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={etiqueta}>
                        Code
                        <input
                            value={form.code}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    code: e.target.value.toUpperCase(),
                                })
                            }
                            maxLength={32}
                            placeholder="Empty = random"
                            autoComplete="off"
                            spellCheck={false}
                            className={`${campo} tracking-wider`}
                        />
                    </label>
                    <label className={etiqueta}>
                        Reward
                        <select
                            value={form.reward}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    reward: e.target.value,
                                    // Las keys dan 1: no se puede elegir otra cantidad.
                                    amount:
                                        premios.find((p) => p.id === e.target.value)?.max === 1
                                            ? '1'
                                            : form.amount,
                                })
                            }
                            className={campo}
                        >
                            {premios.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className={etiqueta}>
                        {/* Dice de que es la cantidad: "FOG per redemption",
                            "Forge rolls per redemption", o 1 si es una key. */}
                        {(() => {
                            const premio = premios.find((p) => p.id === form.reward);
                            if (!premio) return 'Amount per redemption';
                            if (premio.max === 1) return `${premio.label} per redemption (always 1)`;
                            return `${premio.label}${premio.plural ? sufijoPlural(premio.label) : ''} per redemption`;
                        })()}
                        <input
                            type="number"
                            min={1}
                            max={premios.find((p) => p.id === form.reward)?.max ?? 20}
                            disabled={premios.find((p) => p.id === form.reward)?.max === 1}
                            value={form.amount}
                            onChange={(e) =>
                                setForm({ ...form, amount: e.target.value })
                            }
                            className={campo}
                        />
                    </label>
                    <label className={etiqueta}>
                        Use limit (wallets)
                        <input
                            type="number"
                            min={1}
                            value={form.maxUses}
                            onChange={(e) =>
                                setForm({ ...form, maxUses: e.target.value })
                            }
                            className={campo}
                        />
                    </label>
                    <div className={etiqueta}>
                        <span className="flex items-center justify-between gap-2">
                            Expires
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!form.vence}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            vence: !e.target.checked,
                                        })
                                    }
                                    className="accent-yellow"
                                />
                                Never
                            </label>
                        </span>
                        <input
                            type="datetime-local"
                            value={form.expiresAt}
                            disabled={!form.vence}
                            onChange={(e) =>
                                setForm({ ...form, expiresAt: e.target.value })
                            }
                            className={`${campo} disabled:opacity-40`}
                        />
                    </div>
                    <label className={etiqueta}>
                        Note (only you see it)
                        <input
                            value={form.note}
                            onChange={(e) =>
                                setForm({ ...form, note: e.target.value })
                            }
                            maxLength={200}
                            placeholder="e.g. Discord giveaway"
                            className={campo}
                        />
                    </label>
                </div>
                {formError && (
                    <p className="text-sm text-red-300">{formError}</p>
                )}
                <button
                    type="submit"
                    disabled={
                        creando ||
                        !form.maxUses ||
                        (form.vence && !form.expiresAt)
                    }
                    className="self-start bg-yellow text-darkblue font-accent uppercase rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    {creando ? 'Creating...' : 'Create code'}
                </button>
            </form>

            <section className="flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-accent uppercase text-yellow text-2xl">
                        {verArchivados ? 'Archived codes' : 'Codes'}
                    </h2>
                    {visibles && (
                        <span className="flex items-center gap-4 text-sm text-lightblue/70">
                            {visibles.length} code
                            {visibles.length === 1 ? '' : 's'}
                            {(archivados > 0 || verArchivados) && (
                                <button
                                    onClick={() => setVerArchivados((v) => !v)}
                                    className="text-lightblue hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                                >
                                    {verArchivados
                                        ? 'Back to codes'
                                        : `Show archived (${archivados})`}
                                </button>
                            )}
                        </span>
                    )}
                </div>

                {error && <p className="text-sm text-red-300">{error}</p>}

                {!visibles ? (
                    <p className="text-lightblue/70">Loading...</p>
                ) : visibles.length === 0 ? (
                    <p className="text-lightblue/70">
                        {verArchivados ? 'No archived codes.' : 'No codes yet.'}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {visibles.map((c) => (
                            <li
                                key={c.code}
                                className={`rounded-xl border bg-lightblue/5 ${
                                    nuevo === c.code
                                        ? 'border-yellow/60'
                                        : 'border-lightblue/10'
                                }`}
                            >
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                                    <div className="flex-1 min-w-48 flex flex-col gap-1">
                                        <span className="flex items-center gap-2">
                                            <span className="font-accent text-xl text-lightblue tracking-wider leading-none pb-1 break-all">
                                                {c.code}
                                            </span>
                                            <button
                                                onClick={() => copiar(c.code)}
                                                aria-label={`Copy ${c.code}`}
                                                title="Copy"
                                                className="shrink-0 rounded-md p-1.5 text-lightblue/70 hover:text-yellow cursor-pointer transition-all duration-300"
                                            >
                                                {copiado === c.code ? (
                                                    <FiCheck className="w-4 h-4" />
                                                ) : (
                                                    <FiCopy className="w-4 h-4" />
                                                )}
                                            </button>
                                            <span
                                                className={`shrink-0 rounded-full px-2 text-xs ${ESTADOS[c.status].clase}`}
                                            >
                                                {ESTADOS[c.status].texto}
                                            </span>
                                        </span>
                                        <span className="text-sm text-lightblue/70">
                                            {nombrePremio(c)} ·{' '}
                                            {c.expiresAt
                                                ? `${c.status === 'expired' ? 'expired' : 'expires'} ${fecha(c.expiresAt, true)}`
                                                : 'no expiration'}{' '}
                                            · created {fecha(c.createdAt)}
                                        </span>
                                        {c.note && (
                                            <span className="text-xs text-lightblue/50">
                                                {c.note}
                                            </span>
                                        )}
                                    </div>

                                    <button
                                        onClick={() =>
                                            setAbierto((a) =>
                                                a === c.code ? null : c.code
                                            )
                                        }
                                        aria-expanded={abierto === c.code}
                                        className="flex items-center gap-1.5 font-accent text-lightblue hover:text-yellow tabular-nums cursor-pointer transition-all duration-300"
                                    >
                                        <span className="pb-1">
                                            {c.uses} / {c.maxUses} used
                                        </span>
                                        <FiChevronDown
                                            className={`w-4 h-4 transition-all duration-300 ${
                                                abierto === c.code
                                                    ? 'rotate-180'
                                                    : ''
                                            }`}
                                        />
                                    </button>

                                    <div className="flex items-center gap-2">
                                        {!c.archived && (
                                            <button
                                                onClick={() =>
                                                    actualizar(c, {
                                                        active: !c.active,
                                                    })
                                                }
                                                disabled={cambiando === c.code}
                                                className={botonChico}
                                            >
                                                {c.active ? 'Disable' : 'Enable'}
                                            </button>
                                        )}
                                        {(c.archived ||
                                            c.status !== 'active') && (
                                            <button
                                                onClick={() =>
                                                    actualizar(c, {
                                                        archived: !c.archived,
                                                    })
                                                }
                                                disabled={cambiando === c.code}
                                                className={botonChico}
                                            >
                                                {c.archived
                                                    ? 'Unarchive'
                                                    : 'Archive'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {abierto === c.code && (
                                    <div className="border-t border-lightblue/10 px-4 py-3">
                                        {c.redemptions.length === 0 ? (
                                            <p className="text-sm text-lightblue/60">
                                                Nobody has redeemed it yet.
                                            </p>
                                        ) : (
                                            <ul className="flex flex-col gap-1.5">
                                                {[...c.redemptions]
                                                    .reverse()
                                                    .map((r) => (
                                                        <li
                                                            key={r.wallet}
                                                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 text-xs"
                                                        >
                                                            <a
                                                                href={`${APECHAIN.explorador}/address/${r.wallet}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1 min-w-0 font-mono text-lightblue/80 hover:text-yellow transition-all duration-300"
                                                            >
                                                                {apodos[r.wallet.toLowerCase()] && (
                                                                    <span className="shrink-0 font-sans font-semibold text-yellow">
                                                                        {apodos[r.wallet.toLowerCase()]}
                                                                    </span>
                                                                )}
                                                                <span className="truncate">
                                                                    {r.wallet}
                                                                </span>
                                                                <FiArrowUpRight className="shrink-0 w-3 h-3" />
                                                            </a>
                                                            <span className="text-lightblue/50">
                                                                {fecha(
                                                                    r.at,
                                                                    true
                                                                )}
                                                            </span>
                                                        </li>
                                                    ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
