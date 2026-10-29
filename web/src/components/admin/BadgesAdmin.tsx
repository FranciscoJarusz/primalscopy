import { useCallback, useEffect, useState } from 'react';
import { FiArrowDown, FiArrowUp, FiChevronDown } from 'react-icons/fi';
import { BACKEND_URL } from '@/lib/backend';
import { imagenInsignia, type Metrica, type InsigniaAdmin } from '@/lib/insignias';
import { botonChico, botonGuardar, campo, etiqueta, panel, titulo } from './comun';

type Datos = { badges: InsigniaAdmin[]; metrics: Metrica[]; ops: string[] };

export default function BadgesAdmin({ token }: { token: string }) {
    const [datos, setDatos] = useState<Datos | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [abierta, setAbierta] = useState<string | null>(null);
    const [wallet, setWallet] = useState('');

    const pedir = useCallback(
        async (ruta: string, init: RequestInit = {}) => {
            const r = await fetch(`${BACKEND_URL}/admin/badges${ruta}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
                },
            });
            const json = await r.json().catch(() => ({}));
            if (!r.ok) {
                setError(json.error || "Couldn't save.");
                return null;
            }
            setError(null);
            setDatos(json);
            return json as Datos;
        },
        [token]
    );

    useEffect(() => {
        if (token) pedir('');
    }, [token, pedir]);

    if (!datos) return <p className="text-lightblue/70">{error ?? 'Loading...'}</p>;

    const mover = (i: number, paso: number) => {
        const ids = datos.badges.map((b) => b.id);
        [ids[i], ids[i + paso]] = [ids[i + paso], ids[i]];
        pedir('/order', { method: 'PUT', body: JSON.stringify({ order: ids }) });
    };

    const nueva = async () => {
        const r = await pedir('', { method: 'POST', body: JSON.stringify({ name: 'New badge' }) });
        if (r) setAbierta(r.badges[r.badges.length - 1].id);
    };

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">Badges</h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    Beta. Each badge is automatic (a number of the wallet against a value) or given by hand. They show
                    up on the beta profile ({'/holder/<wallet>/beta'}) in the order of this list. Without an image, the site draws a placeholder.
                </p>
            </div>

            <section className={panel}>
                <h2 className={titulo}>Preview a board</h2>
                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (wallet.trim()) window.open(`/holder/${encodeURIComponent(wallet.trim())}/beta`, '_blank');
                    }}
                >
                    <input
                        value={wallet}
                        onChange={(e) => setWallet(e.target.value)}
                        placeholder="Wallet or nickname"
                        className={`${campo} max-w-md`}
                    />
                    <button className={botonChico}>Open</button>
                </form>
            </section>

            {error && <p className="text-red-300">{error}</p>}

            <section className={panel}>
                <div className="flex items-center justify-between gap-3">
                    <h2 className={titulo}>{datos.badges.length} badges</h2>
                    <button onClick={nueva} className={botonChico}>
                        Add badge
                    </button>
                </div>
                <ul className="flex flex-col gap-2">
                    {datos.badges.map((b, i) => (
                        <li key={b.id} className="rounded-xl bg-lightblue/5 border border-lightblue/10">
                            <div className="flex items-center gap-3 p-2">
                                <div className="flex flex-col">
                                    <button
                                        aria-label="Move up"
                                        disabled={i === 0}
                                        onClick={() => mover(i, -1)}
                                        className="text-lightblue hover:text-yellow disabled:opacity-20 cursor-pointer transition-all duration-300"
                                    >
                                        <FiArrowUp />
                                    </button>
                                    <button
                                        aria-label="Move down"
                                        disabled={i === datos.badges.length - 1}
                                        onClick={() => mover(i, 1)}
                                        className="text-lightblue hover:text-yellow disabled:opacity-20 cursor-pointer transition-all duration-300"
                                    >
                                        <FiArrowDown />
                                    </button>
                                </div>
                                {b.image ? (
                                    <img src={imagenInsignia(b.image)} alt="" className="size-10 object-contain" />
                                ) : (
                                    <span className="size-10 rounded-lg border-2 border-dashed border-lightblue/30" />
                                )}
                                <button
                                    onClick={() => setAbierta(abierta === b.id ? null : b.id)}
                                    className="group flex-1 flex items-center justify-between gap-3 text-left cursor-pointer"
                                >
                                    <span className="flex flex-col">
                                        <span className={`font-semibold ${b.enabled ? 'text-white' : 'text-lightblue/50 line-through'}`}>
                                            {b.name}
                                        </span>
                                        <span className="text-xs text-lightblue/60">{resumen(b, datos.metrics)}</span>
                                    </span>
                                    <FiChevronDown
                                        className={`size-5 shrink-0 text-lightblue group-hover:text-yellow transition-all duration-300 ${abierta === b.id ? 'rotate-180' : ''}`}
                                    />
                                </button>
                            </div>
                            {abierta === b.id && <Editor b={b} datos={datos} pedir={pedir} />}
                        </li>
                    ))}
                </ul>
            </section>
        </main>
    );
}

function resumen(b: InsigniaAdmin, metricas: Metrica[]) {
    if (b.kind === 'manual') return `Given by hand · ${b.wallets.length} wallets`;
    const m = metricas.find((x) => x.id === b.metric);
    return `${m?.label ?? b.metric}${b.param ? ` (${b.param})` : ''} ${b.op} ${b.value}${b.hidden ? ' · hidden until earned' : ''}`;
}

function Editor({
    b,
    datos,
    pedir,
}: {
    b: InsigniaAdmin;
    datos: Datos;
    pedir: (ruta: string, init?: RequestInit) => Promise<Datos | null>;
}) {
    const [f, setF] = useState({ ...b, wallets: b.wallets.join('\n') });
    const [guardando, setGuardando] = useState(false);
    const metrica = datos.metrics.find((m) => m.id === f.metric);
    const set = (cambio: Partial<typeof f>) => setF((x) => ({ ...x, ...cambio }));

    const guardar = async () => {
        setGuardando(true);
        await pedir(`/${b.id}`, { method: 'PATCH', body: JSON.stringify({ ...f, wallets: f.wallets }) });
        setGuardando(false);
    };

    const subir = async (archivo: File | undefined) => {
        if (!archivo) return;
        const form = new FormData();
        form.append('file', archivo);
        await pedir(`/${b.id}/image`, { method: 'POST', body: form });
    };

    return (
        <div className="flex flex-col gap-4 border-t border-lightblue/10 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className={etiqueta}>
                    Name
                    <input value={f.name} onChange={(e) => set({ name: e.target.value })} className={campo} />
                </label>
                <label className={etiqueta}>
                    Description
                    <input value={f.description} onChange={(e) => set({ description: e.target.value })} className={campo} />
                </label>
                <label className={etiqueta}>
                    Type
                    <select value={f.kind} onChange={(e) => set({ kind: e.target.value as 'auto' | 'manual' })} className={campo}>
                        <option value="auto">Automatic</option>
                        <option value="manual">Given by hand</option>
                    </select>
                </label>
                {f.kind === 'auto' && (
                    <label className={etiqueta}>
                        Metric
                        <select value={f.metric} onChange={(e) => set({ metric: e.target.value, param: '' })} className={campo}>
                            {datos.metrics.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {f.kind === 'auto' && metrica?.param && (
                    <label className={etiqueta}>
                        {metrica.param}
                        <input value={f.param} onChange={(e) => set({ param: e.target.value })} className={campo} />
                    </label>
                )}
                {f.kind === 'auto' && (
                    <div className="flex gap-2">
                        <label className={`${etiqueta} w-24`}>
                            Compare
                            <select value={f.op} onChange={(e) => set({ op: e.target.value })} className={campo}>
                                {datos.ops.map((o) => (
                                    <option key={o}>{o}</option>
                                ))}
                            </select>
                        </label>
                        <label className={`${etiqueta} flex-1`}>
                            Value
                            <input
                                type="number"
                                value={f.value}
                                onChange={(e) => set({ value: Number(e.target.value) })}
                                className={campo}
                            />
                        </label>
                    </div>
                )}
            </div>

            {f.kind === 'manual' && (
                <label className={etiqueta}>
                    Wallets that have it (one per line)
                    <textarea
                        rows={4}
                        value={f.wallets}
                        onChange={(e) => set({ wallets: e.target.value })}
                        className={`${campo} font-mono text-sm`}
                    />
                </label>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-lightblue">
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                    Shown
                </label>
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={f.hidden} onChange={(e) => set({ hidden: e.target.checked })} />
                    Hidden until earned
                </label>
                {f.kind === 'auto' && (
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={f.holdersOnly}
                            onChange={(e) => set({ holdersOnly: e.target.checked })}
                        />
                        Only for wallets holding a Primal
                    </label>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <label className={`${botonChico} inline-flex items-center`}>
                    {b.image ? 'Change image' : 'Upload image'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
                </label>
                {b.image && (
                    <button onClick={() => pedir(`/${b.id}/image`, { method: 'DELETE' })} className={botonChico}>
                        Remove image
                    </button>
                )}
                <button
                    onClick={() => confirm(`Delete "${b.name}"?`) && pedir(`/${b.id}`, { method: 'DELETE' })}
                    className={`${botonChico} hover:bg-red-400!`}
                >
                    Delete
                </button>
                <button onClick={guardar} disabled={guardando} className={`${botonGuardar} ml-auto`}>
                    {guardando ? 'Saving...' : 'Save'}
                </button>
            </div>
        </div>
    );
}
