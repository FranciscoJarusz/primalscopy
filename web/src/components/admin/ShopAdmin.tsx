import { useCallback, useEffect, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiGift, FiImage, FiTrash2 } from 'react-icons/fi';
import { degradado, fondoDe, iconoPremio, type Fondo } from '@/lib/staking';
import { BACKEND_URL } from '@/lib/backend';
import { regalar } from '@/lib/admin';
import StakingWheelsAdmin from './StakingWheelsAdmin';
import FogSaleAdmin, { type Compras, type VentaAdmin } from './FogSaleAdmin';
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

type Tipo = 'key' | 'ape' | 'nft' | 'forge-roll' | 'raffle';
type Premio = {
    id: string;
    kind: Tipo;
    amount?: number;
    label: string;
    description: string;
    price: number;
    enabled: boolean;
    icon?: string;
    stock?: number | null;
    background?: Fondo;
};
type Resumen = {
    config: { catalog: Premio[]; fogSale: VentaAdmin };
    fogSale: Compras;
    redemptions: {
        id: string;
        wallet: string;
        item: string;
        label: string;
        price: number;
        at: string;
    }[];
};
type Fila = Omit<Premio, 'price' | 'stock'> & { price: string; stock: string };

const TIPOS: Record<Tipo, string> = {
    key: 'Key',
    ape: 'APE',
    nft: 'NFT',
    'forge-roll': 'Reroll',
    raffle: 'Raffle',
};
const REGALABLES: Tipo[] = ['key', 'ape', 'nft'];

const aFilas = (catalogo: Premio[]): Fila[] =>
    catalogo.map((i) => ({
        ...i,
        price: String(i.price),
        stock: i.stock === null || i.stock === undefined ? '' : String(i.stock),
    }));

const nuevoVacio = { kind: 'key' as 'key' | 'ape' | 'nft', label: '', price: '', amount: '' };

export default function ShopAdmin({ token }: { token: string }) {
    const quien = useQuien();
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [filas, setFilas] = useState<Fila[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [guardado, setGuardado] = useState(false);
    const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);
    const [subiendoIcono, setSubiendoIcono] = useState<string | null>(null);
    const [nuevo, setNuevo] = useState(nuevoVacio);
    const [creando, setCreando] = useState(false);
    const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
    const [versionRuletas, setVersionRuletas] = useState(0);

    const auth = useCallback(
        (extra: HeadersInit = {}) => ({ Authorization: `Bearer ${token}`, ...extra }),
        [token]
    );

    const cargar = useCallback(
        async (pisarFilas = true) => {
            setError(null);
            try {
                const respuesta = await fetch(`${BACKEND_URL}/admin/staking`, { headers: auth() });
                if (!respuesta.ok) throw new Error();
                const datos: Resumen = await respuesta.json();
                setResumen(datos);
                if (pisarFilas) setFilas(aFilas(datos.config.catalog));
            } catch {
                setError("Couldn't load the shop.");
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
        return datos as Resumen['config'];
    };

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!filas) return;
        setGuardando(true);
        setGuardado(false);
        setError(null);
        try {
            await enviar({
                catalog: filas.map((i) => ({
                    id: i.id,
                    label: i.label,
                    description: i.description,
                    price: Number(i.price),
                    stock: i.stock.trim() === '' ? null : Number(i.stock),
                    enabled: i.enabled,
                    background: i.background ?? null,
                })),
                order: filas.map((i) => i.id),
            });
            await cargar();
            setGuardado(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
        setGuardando(false);
    };

    const crear = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreando(true);
        setErrorNuevo(null);
        try {
            const config = await enviar({
                addCatalog: {
                    kind: nuevo.kind,
                    label: nuevo.label,
                    price: Number(nuevo.price),
                    ...(nuevo.kind === 'ape' ? { amount: Number(nuevo.amount) } : {}),
                },
            });
            setResumen((r) => (r ? { ...r, config } : r));
            const creado = config.catalog[config.catalog.length - 1];
            setFilas((f) => (f ? [...f, ...aFilas([creado])] : f));
            setNuevo(nuevoVacio);
            setVersionRuletas((v) => v + 1);
        } catch (err) {
            setErrorNuevo(err instanceof Error ? err.message : "Couldn't create it.");
        }
        setCreando(false);
    };

    const borrar = async (id: string) => {
        if (confirmarBorrado !== id) {
            setConfirmarBorrado(id);
            return;
        }
        setConfirmarBorrado(null);
        setError(null);
        try {
            const config = await enviar({ removeCatalog: id });
            setResumen((r) => (r ? { ...r, config } : r));
            setFilas((f) => (f ? f.filter((p) => p.id !== id) : f));
            setVersionRuletas((v) => v + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't delete it.");
        }
    };

    const cambiarIcono = async (id: string, archivo: File | null) => {
        setSubiendoIcono(id);
        setError(null);
        try {
            let respuesta: Response;
            if (archivo) {
                const datos = new FormData();
                datos.append('file', archivo);
                respuesta = await fetch(`${BACKEND_URL}/admin/staking/icon/${id}`, {
                    method: 'POST',
                    headers: auth(),
                    body: datos,
                });
            } else {
                respuesta = await fetch(`${BACKEND_URL}/admin/staking/icon/${id}`, {
                    method: 'DELETE',
                    headers: auth(),
                });
            }
            const datos = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok) throw new Error(datos.error || "Couldn't change the icon.");
            const config = datos as Resumen['config'];
            const icon = config.catalog.find((p) => p.id === id)?.icon;
            setResumen((r) => (r ? { ...r, config } : r));
            setFilas((f) => (f ? f.map((p) => (p.id === id ? { ...p, icon } : p)) : f));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't change the icon.");
        }
        setSubiendoIcono(null);
    };

    const mover = (i: number, paso: -1 | 1) =>
        filas &&
        setFilas(
            filas.map((p, j) => (j === i ? filas[i + paso] : j === i + paso ? filas[i] : p))
        );

    const editar = (id: string, cambio: Partial<Fila>) =>
        filas && setFilas(filas.map((p) => (p.id === id ? { ...p, ...cambio } : p)));

    const catalogo = resumen?.config.catalog ?? [];

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                    Shop
                </h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    The FOG sale, what holders can buy with FOG, the prize wheels behind
                    every key, and what has to be sent by hand.
                </p>
            </div>

            {error && <p className="text-red-300">{error}</p>}

            {resumen && (
                <FogSaleAdmin
                    venta={resumen.config.fogSale}
                    compras={resumen.fogSale}
                    enviar={enviar}
                    alGuardar={() => cargar(false)}
                />
            )}

            {filas && (
                <form onSubmit={guardar} className={panel}>
                    <h2 className={titulo}>Rewards</h2>
                    <p className="text-lightblue/70 text-sm -mt-2">
                        A key opens a prize wheel. APE and NFTs are sent by hand (they
                        show up under Deliveries). The Reroll ticket is delivered on its
                        own. Stock is how many are left to sell: empty is unlimited, 0
                        shows &quot;Sold out&quot;. Click an icon to upload a new one; it
                        changes right away. The gift button creates a promo code for
                        that reward.
                    </p>
                    <div className="flex flex-col gap-3">
                        {filas.map((item, i) => (
                            <div
                                key={item.id}
                                className={`grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-[1.25rem_7.5rem_minmax(0,1fr)_minmax(0,2fr)_8rem_6rem_8rem_5.5rem_5rem] items-end rounded-xl bg-blue/30 p-3 xl:bg-transparent xl:p-0 xl:rounded-none ${
                                    item.enabled ? '' : 'opacity-50'
                                }`}
                            >
                                <div className="order-1 xl:order-none sm:col-span-2 flex items-end gap-3 xl:contents">
                                <div className="h-16 xl:h-9 flex flex-col items-center justify-center">
                                    <button
                                        type="button"
                                        aria-label={`Move ${item.label} up`}
                                        disabled={i === 0}
                                        onClick={() => mover(i, -1)}
                                        className="text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-lightblue/60"
                                    >
                                        <FiChevronUp className="w-4.5 h-4.5" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Move ${item.label} down`}
                                        disabled={i === filas.length - 1}
                                        onClick={() => mover(i, 1)}
                                        className="text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-lightblue/60"
                                    >
                                        <FiChevronDown className="w-4.5 h-4.5" />
                                    </button>
                                </div>
                                <div className="flex items-end gap-2">
                                    <label
                                        title="Upload a new icon"
                                        className={`relative size-16 shrink-0 grid place-items-center rounded-xl bg-blue cursor-pointer hover:ring-2 hover:ring-yellow transition-all duration-300 ${
                                            subiendoIcono === item.id ? 'opacity-50 pointer-events-none' : ''
                                        }`}
                                    >
                                        {iconoPremio(item) ? (
                                            <img src={iconoPremio(item)!} alt="" className="size-14 object-contain" />
                                        ) : (
                                            <FiImage className="w-6 h-6 text-lightblue/60" />
                                        )}
                                        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-darkblue ring-1 ring-lightblue/30 px-1.5 text-[10px] leading-4 uppercase text-lightblue whitespace-nowrap">
                                            {TIPOS[item.kind] ?? item.kind}
                                        </span>
                                        <input
                                            type="file"
                                            accept=".png,.jpg,.jpeg,.gif,.webp"
                                            className="sr-only"
                                            onChange={(e) => {
                                                const archivo = e.target.files?.[0];
                                                e.target.value = '';
                                                if (archivo) cambiarIcono(item.id, archivo);
                                            }}
                                        />
                                    </label>
                                    {item.icon && (
                                        <button
                                            type="button"
                                            onClick={() => cambiarIcono(item.id, null)}
                                            disabled={subiendoIcono === item.id}
                                            title="Go back to the default icon"
                                            className="text-xs text-lightblue/60 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                                        >
                                            Default
                                        </button>
                                    )}
                                </div>
                                </div>
                                <label className={`${etiqueta} order-3 xl:order-none col-span-2 xl:col-span-1`}>
                                    Name
                                    <input
                                        value={item.label}
                                        maxLength={40}
                                        onChange={(e) => editar(item.id, { label: e.target.value })}
                                        className={campo}
                                    />
                                </label>
                                <label className={`${etiqueta} order-4 xl:order-none col-span-2 xl:col-span-1`}>
                                    Description
                                    <input
                                        value={item.description}
                                        maxLength={120}
                                        onChange={(e) => editar(item.id, { description: e.target.value })}
                                        className={campo}
                                    />
                                </label>
                                <label className={`${etiqueta} order-5 xl:order-none`}>
                                    Price (FOG)
                                    <input
                                        type="number"
                                        min={1}
                                        value={item.price}
                                        onChange={(e) => editar(item.id, { price: e.target.value })}
                                        className={campo}
                                    />
                                </label>
                                <label className={`${etiqueta} order-6 xl:order-none`} title="How many are left to sell. Empty means unlimited.">
                                    Stock
                                    <input
                                        type="number"
                                        min={0}
                                        value={item.stock}
                                        placeholder="∞"
                                        onChange={(e) => editar(item.id, { stock: e.target.value })}
                                        className={campo}
                                    />
                                </label>
                                <div className={`${etiqueta} order-7 xl:order-none col-span-2 xl:col-span-1`}>
                                    Background
                                    <div className="h-9 flex items-center gap-1.5">
                                        {(['from', 'to'] as const).map((lado) => {
                                            const actual = fondoDe({ price: Number(item.price) || 0, background: item.background });
                                            return (
                                                <input
                                                    key={lado}
                                                    type="color"
                                                    value={actual[lado]}
                                                    onChange={(e) =>
                                                        editar(item.id, { background: { ...actual, [lado]: e.target.value } })
                                                    }
                                                    aria-label={`${item.label} background, ${lado === 'from' ? 'top' : 'bottom'} color`}
                                                    title={lado === 'from' ? 'Top color' : 'Bottom color'}
                                                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md bg-lightblue p-0.5"
                                                />
                                            );
                                        })}
                                        {item.background ? (
                                            <button
                                                type="button"
                                                onClick={() => editar(item.id, { background: undefined })}
                                                title="Back to the color of its price"
                                                className="text-xs text-lightblue/60 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                                            >
                                                Default
                                            </button>
                                        ) : (
                                            <span
                                                aria-hidden="true"
                                                className="h-9 flex-1 min-w-4 rounded-md"
                                                style={{ backgroundImage: degradado(fondoDe({ price: Number(item.price) || 0 })) }}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="order-2 xl:order-none sm:col-span-2 self-start xl:self-auto flex items-center justify-end gap-2 xl:contents">
                                <label className="h-9 flex items-center gap-2 text-sm text-lightblue cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={item.enabled}
                                        onChange={(e) => editar(item.id, { enabled: e.target.checked })}
                                        className="w-4 h-4 accent-yellow"
                                    />
                                    Shown
                                </label>
                                <div className="h-9 flex items-center gap-1">
                                    {REGALABLES.includes(item.kind) && (
                                        <button
                                            type="button"
                                            onClick={() => regalar(item.id)}
                                            title="Give away as a promo code"
                                            aria-label={`Give away ${item.label} as a promo code`}
                                            className="h-9 inline-flex items-center rounded-md px-2 text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300"
                                        >
                                            <FiGift className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => borrar(item.id)}
                                        onBlur={() => setConfirmarBorrado((c) => (c === item.id ? null : c))}
                                        aria-label={`Delete ${item.label}`}
                                        className={`h-9 inline-flex items-center gap-1.5 rounded-md px-2 text-sm cursor-pointer transition-all duration-300 ${
                                            confirmarBorrado === item.id
                                                ? 'bg-red-400/20 text-red-300'
                                                : 'text-lightblue/60 hover:text-red-300'
                                        }`}
                                    >
                                        <FiTrash2 className="w-4 h-4" />
                                        {confirmarBorrado === item.id && 'Delete?'}
                                    </button>
                                </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                        <button type="submit" disabled={guardando} className={botonGuardar}>
                            {guardando ? 'Saving...' : 'Save changes'}
                        </button>
                        {guardado && <span className="text-green-300 text-sm">Saved.</span>}
                    </div>
                </form>
            )}

            {filas && (
                <form onSubmit={crear} className={panel}>
                    <h2 className={titulo}>Add reward</h2>
                    <p className="text-lightblue/70 text-sm -mt-2">
                        A new key comes with its own prize wheel below, ready to load.
                        APE and NFTs start with 0 in stock so they aren&apos;t sold by
                        accident: set the stock when you have them to send.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_10rem_8rem_auto] items-end">
                        <label className={etiqueta}>
                            Type
                            <select
                                value={nuevo.kind}
                                onChange={(e) =>
                                    setNuevo({ ...nuevo, kind: e.target.value as typeof nuevo.kind })
                                }
                                className={campo}
                            >
                                <option value="key">Key</option>
                                <option value="ape">APE</option>
                                <option value="nft">NFT</option>
                            </select>
                        </label>
                        <label className={etiqueta}>
                            Name
                            <input
                                value={nuevo.label}
                                maxLength={40}
                                placeholder={
                                    nuevo.kind === 'key' ? 'MEGA KEY' : nuevo.kind === 'ape' ? '5 APE' : 'BORED APE #123'
                                }
                                onChange={(e) => setNuevo({ ...nuevo, label: e.target.value })}
                                className={campo}
                            />
                        </label>
                        <label className={etiqueta}>
                            Price (FOG)
                            <input
                                type="number"
                                min={1}
                                value={nuevo.price}
                                onChange={(e) => setNuevo({ ...nuevo, price: e.target.value })}
                                className={campo}
                            />
                        </label>
                        <label className={`${etiqueta} ${nuevo.kind === 'ape' ? '' : 'invisible'}`}>
                            APE sent
                            <input
                                type="number"
                                min={1}
                                value={nuevo.amount}
                                onChange={(e) => setNuevo({ ...nuevo, amount: e.target.value })}
                                className={campo}
                            />
                        </label>
                        <button type="submit" disabled={creando} className={`${botonChico} h-9`}>
                            {creando ? 'Adding...' : 'Add'}
                        </button>
                    </div>
                    {errorNuevo && <p className="text-red-300 text-sm">{errorNuevo}</p>}
                </form>
            )}

            {resumen && (
                <StakingWheelsAdmin
                    token={token}
                    ruletas={catalogo.filter((i) => i.kind === 'key').map((i) => i.id)}
                    nombres={Object.fromEntries(catalogo.map((i) => [i.id, i.label]))}
                    version={versionRuletas}
                />
            )}

            {resumen && (
                <div className={panel}>
                    <Desplegable
                        grande
                        nombre="Redemptions"
                        resumen={`${resumen.redemptions.length === 100 ? 'last 100' : resumen.redemptions.length} · ${fog(resumen.redemptions.reduce((n, r) => n + r.price, 0))} FOG`}
                    >
                    {resumen.redemptions.length === 0 ? (
                        <p className="text-lightblue/70">No redemptions yet.</p>
                    ) : (
                        <ul data-scroll-propio className={`${lista} text-sm text-lightblue flex flex-col gap-1.5`}>
                            {resumen.redemptions.map((r) => (
                                <li key={r.id} className="flex gap-3">
                                    <span className="text-lightblue/60 w-32 shrink-0 whitespace-nowrap">
                                        {fecha(r.at)}
                                    </span>
                                    <span className="font-mono">{quien(r.wallet)}</span>
                                    <span className="flex-1 text-right">
                                        <b className="text-white font-semibold">
                                            {catalogo.find((i) => i.id === r.item)?.label ?? r.label}
                                        </b>{' '}
                                        · <span className="text-yellow">{fog(r.price)} FOG</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    </Desplegable>
                </div>
            )}
        </main>
    );
}
