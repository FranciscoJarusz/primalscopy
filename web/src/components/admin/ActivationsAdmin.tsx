import { useCallback, useEffect, useState } from 'react';
import { FiArrowDown, FiArrowUp, FiChevronDown } from 'react-icons/fi';
import { BACKEND_URL } from '@/lib/backend';
import { ETIQUETA, imagenActivation, type ActivationAdmin, type Estado } from '@/lib/activations';
import { botonChico, botonGuardar, campo, etiqueta, panel, titulo } from './comun';

type Datos = { activations: ActivationAdmin[]; statuses: Estado[] };
type Pedir = (ruta: string, init?: RequestInit) => Promise<Datos | null>;

export default function ActivationsAdmin({ token }: { token: string }) {
    const [datos, setDatos] = useState<Datos | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [abierta, setAbierta] = useState<string | null>(null);

    const pedir: Pedir = useCallback(
        async (ruta, init = {}) => {
            const r = await fetch(`${BACKEND_URL}/admin/activations${ruta}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
                },
            }).catch(() => null);
            const json = await r?.json().catch(() => ({}));
            if (!r?.ok) {
                setError(json?.error || "Couldn't reach the server.");
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
        const ids = datos.activations.map((h) => h.id);
        [ids[i], ids[i + paso]] = [ids[i + paso], ids[i]];
        pedir('/order', { method: 'PUT', body: JSON.stringify({ order: ids }) });
    };

    const nueva = async () => {
        const r = await pedir('', { method: 'POST', body: JSON.stringify({ title: 'New activation' }) });
        if (r) setAbierta(r.activations[0].id);
    };

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">Activations</h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    The cards of the{' '}
                    <a href="/activations" target="_blank" className="text-yellow underline underline-offset-4">
                        Activations page
                    </a>
                    , in this order. The front of each card is only its cover (a vertical 2:3 image, like 900×1350);
                    everything else shows when the card flips. Changes show up on the site within a minute.
                </p>
            </div>

            {error && <p className="text-red-300">{error}</p>}

            <section className={panel}>
                <div className="flex items-center justify-between gap-3">
                    <h2 className={titulo}>{datos.activations.length} activations</h2>
                    <button onClick={nueva} className={botonChico}>
                        Add activation
                    </button>
                </div>
                <ul className="flex flex-col gap-2">
                    {datos.activations.map((h, i) => {
                        const imagen = imagenActivation(h.image);
                        return (
                            <li key={h.id} className="rounded-xl bg-lightblue/5 border border-lightblue/10">
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
                                            disabled={i === datos.activations.length - 1}
                                            onClick={() => mover(i, 1)}
                                            className="text-lightblue hover:text-yellow disabled:opacity-20 cursor-pointer transition-all duration-300"
                                        >
                                            <FiArrowDown />
                                        </button>
                                    </div>
                                    {imagen ? (
                                        <img src={imagen} alt="" className="h-12 w-8 rounded-md object-cover" />
                                    ) : (
                                        <span className="h-12 w-8 rounded-md border-2 border-dashed border-lightblue/30" />
                                    )}
                                    <button
                                        onClick={() => setAbierta(abierta === h.id ? null : h.id)}
                                        className="group flex-1 flex items-center justify-between gap-3 text-left cursor-pointer"
                                    >
                                        <span className="flex flex-col">
                                            <span className={`font-semibold ${h.enabled ? 'text-white' : 'text-lightblue/50 line-through'}`}>
                                                {h.title}
                                            </span>
                                            <span className="text-xs text-lightblue/60">
                                                {[ETIQUETA[h.status], h.category, h.date].filter(Boolean).join(' · ')}
                                                {!h.enabled && ' · hidden'}
                                            </span>
                                        </span>
                                        <FiChevronDown
                                            className={`size-5 shrink-0 text-lightblue group-hover:text-yellow transition-all duration-300 ${abierta === h.id ? 'rotate-180' : ''}`}
                                        />
                                    </button>
                                </div>
                                {abierta === h.id && <Editor key={h.id} h={h} estados={datos.statuses} pedir={pedir} />}
                            </li>
                        );
                    })}
                </ul>
            </section>
        </main>
    );
}

function Editor({ h, estados, pedir }: { h: ActivationAdmin; estados: Estado[]; pedir: Pedir }) {
    const [f, setF] = useState(h);
    const [guardando, setGuardando] = useState(false);
    const [subiendo, setSubiendo] = useState(false);
    const set = (cambio: Partial<ActivationAdmin>) => setF((x) => ({ ...x, ...cambio }));

    const guardar = async () => {
        setGuardando(true);
        const { title, text, status, category, date, href, fit, enabled } = f;
        await pedir(`/${h.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ title, text, status, category, date, href, fit, enabled }),
        });
        setGuardando(false);
    };

    const subir = async (archivo: File | undefined) => {
        if (!archivo) return;
        setSubiendo(true);
        const form = new FormData();
        form.append('file', archivo);
        await pedir(`/${h.id}/image`, { method: 'POST', body: form });
        setSubiendo(false);
    };

    const imagen = imagenActivation(h.image);

    return (
        <div className="flex flex-col gap-4 border-t border-lightblue/10 p-4">
            <div className="flex flex-col sm:flex-row gap-5">
                <div className="flex flex-col gap-2 shrink-0 w-full max-w-40">
                    <div className="aspect-2/3 rounded-xl overflow-hidden bg-darkblue border border-lightblue/10 flex items-center justify-center">
                        {imagen ? (
                            <img
                                src={imagen}
                                alt=""
                                className={`h-full w-full ${f.fit === 'contain' ? 'object-contain p-3' : 'object-cover'}`}
                            />
                        ) : (
                            <span className="text-xs text-lightblue/50 p-3 text-center">No cover</span>
                        )}
                    </div>
                    <label className={`${botonChico} text-center ${subiendo ? 'opacity-40 pointer-events-none' : ''}`}>
                        {subiendo ? 'Uploading...' : imagen ? 'Change cover' : 'Upload cover'}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                subir(e.target.files?.[0]);
                                e.target.value = '';
                            }}
                        />
                    </label>
                    {h.image && (
                        <button onClick={() => pedir(`/${h.id}/image`, { method: 'DELETE' })} className={botonChico}>
                            Remove cover
                        </button>
                    )}
                </div>

                <div className="grid flex-1 gap-3 sm:grid-cols-2 content-start">
                    <label className={etiqueta}>
                        Title
                        <input value={f.title} onChange={(e) => set({ title: e.target.value })} className={campo} />
                    </label>
                    <label className={etiqueta}>
                        Status
                        <select value={f.status} onChange={(e) => set({ status: e.target.value as Estado })} className={campo}>
                            {estados.map((s) => (
                                <option key={s} value={s}>
                                    {ETIQUETA[s]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className={etiqueta}>
                        Category
                        <input
                            value={f.category}
                            onChange={(e) => set({ category: e.target.value })}
                            placeholder="Games, Rewards, Tools..."
                            className={campo}
                        />
                    </label>
                    <label className={etiqueta}>
                        Date
                        <input
                            value={f.date}
                            onChange={(e) => set({ date: e.target.value })}
                            placeholder="Oct 2026, Q1 2027, TBA..."
                            className={campo}
                        />
                    </label>
                    <label className={`${etiqueta} sm:col-span-2`}>
                        Text
                        <textarea
                            rows={3}
                            value={f.text}
                            onChange={(e) => set({ text: e.target.value })}
                            className={campo}
                        />
                    </label>
                    <label className={etiqueta}>
                        Link of the Open button (empty: no button)
                        <input
                            value={f.href}
                            onChange={(e) => set({ href: e.target.value })}
                            placeholder="/forge or https://..."
                            className={campo}
                        />
                    </label>
                    <label className={etiqueta}>
                        Cover fit
                        <select value={f.fit} onChange={(e) => set({ fit: e.target.value as 'cover' | 'contain' })} className={campo}>
                            <option value="cover">Fill the card (crops the edges)</option>
                            <option value="contain">Fit inside (whole image visible)</option>
                        </select>
                    </label>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-lightblue">
                    <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                    Shown on the site
                </label>
                <button
                    onClick={() => confirm(`Delete "${h.title}"?`) && pedir(`/${h.id}`, { method: 'DELETE' })}
                    className={`${botonChico} hover:bg-red-400! ml-auto`}
                >
                    Delete
                </button>
                <button onClick={guardar} disabled={guardando} className={botonGuardar}>
                    {guardando ? 'Saving...' : 'Save'}
                </button>
            </div>
        </div>
    );
}
