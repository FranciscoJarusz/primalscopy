// Las ruletas de la tienda de FOG en el admin (ver backend/lib/stakingWheels.js):
// los premios de cada key con su imagen, peso y stock, el vault del Summon
// shard, y las entregas pendientes (NFTs, APE y Primals que hay que mandar a
// mano desde la wallet del proyecto, que se marcan en la pestaña Deliveries).
import { useCallback, useEffect, useState } from 'react';
import { FiImage, FiX } from 'react-icons/fi';
import Ruleta from '@/components/staking/Ruleta';
import {
    colorRareza,
    imagenPremio,
    type Ganado,
    type PremioRuleta,
} from '@/lib/staking';
import { BACKEND_URL } from '@/lib/backend';
import { botonChico, campo, etiqueta, opcion, panel, titulo } from './comun';

const TIPOS = [
    { id: 'nft', nombre: 'NFT' },
    { id: 'ape', nombre: 'APE' },
    { id: 'fog', nombre: 'FOG' },
];

type Premio = {
    id: string;
    label: string;
    kind: 'fog' | 'ape' | 'nft';
    amount: number | null;
    weight: number;
    stock: number | null;
    image: string | null;
};
type Datos = {
    wheels: Record<
        string,
        {
            prizes: Premio[];
            vaultWeight?: number;
            vaultAvailable?: number;
            chances: Record<string, number>;
        }
    >;
    vault: { address: string | null; at: string | null; count: number };
    wins: {
        id: string;
        wallet: string;
        item: string;
        prize: PremioRuleta;
        status: 'credited' | 'pending' | 'sent';
        note?: string;
        at: string;
        sentAt?: string;
    }[];
};
// En el formulario los numeros van como texto, para poder borrarlos.
type Borrador = (Omit<Premio, 'amount' | 'weight' | 'stock'> & {
    amount: string;
    weight: string;
    stock: string;
})[];


const fecha = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
const pct = (n: number) =>
    `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: n < 0.01 ? 2 : 1 })}%`;

type Simulacion = {
    abiertas: number;
    pedidas: number;
    filas: { id: string; label: string; veces: number; esperado: number }[];
    fog: number;
    ape: number;
};

const aBorrador = (prizes: Premio[]): Borrador =>
    prizes.map((p) => ({
        ...p,
        amount: p.amount === null ? '' : String(p.amount),
        weight: String(p.weight),
        stock: p.stock === null ? '' : String(p.stock),
    }));

export default function StakingWheelsAdmin({
    token,
    ruletas,
    nombres = {},
    version = 0,
}: {
    token: string;
    ruletas: string[];
    // El nombre de cada premio en el catalogo, por id.
    nombres?: Record<string, string>;
    version?: number;
}) {
    const nombreDe = (id: string) => nombres[id] ?? id;
    const [datos, setDatos] = useState<Datos | null>(null);
    const [elegida, setElegida] = useState(ruletas[0] ?? 'lowkey');
    const [borrador, setBorrador] = useState<Borrador>([]);
    const [pesoVault, setPesoVault] = useState('');
    const [direccion, setDireccion] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [guardado, setGuardado] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [simulacion, setSimulacion] = useState<Simulacion | null>(null);
    const [tirada, setTirada] = useState<{ ganado: Ganado; pozo: PremioRuleta[] } | null>(null);

    const pedir = useCallback(
        async (ruta: string, init: RequestInit = {}) => {
            const r = await fetch(`${BACKEND_URL}/admin/staking/${ruta}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(init.body && !(init.body instanceof FormData)
                        ? { 'content-type': 'application/json' }
                        : {}),
                },
            }).catch(() => null);
            const d = await r?.json().catch(() => ({}));
            if (!r?.ok) throw new Error(d?.error || "Couldn't reach the server.");
            return d as Datos;
        },
        [token]
    );

    const aplicar = useCallback(
        (d: Datos, pisar = true) => {
            setDatos(d);
            if (pisar) {
                setBorrador(aBorrador(d.wheels[elegida]?.prizes ?? []));
                setPesoVault(String(d.wheels['summon-shard']?.vaultWeight ?? ''));
                setDireccion(d.vault.address ?? '');
            }
        },
        [elegida]
    );

    useEffect(() => {
        pedir('wheels')
            .then((d) => aplicar(d))
            .catch((e) => setError(e.message));
    }, [pedir, aplicar, version]);

    const correr = async (fn: () => Promise<Datos>, pisar = true) => {
        setOcupado(true);
        setError(null);
        setGuardado(false);
        try {
            aplicar(await fn(), pisar);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save.");
            return false;
        } finally {
            setOcupado(false);
        }
    };

    const guardar = async () => {
        const ok = await correr(() =>
            pedir(`wheels/${elegida}`, {
                method: 'PUT',
                body: JSON.stringify({
                    prizes: borrador.map((p) => ({
                        id: p.id || undefined,
                        label: p.label,
                        kind: p.kind,
                        amount: p.kind === 'nft' ? null : Number(p.amount),
                        weight: Number(p.weight),
                        stock: p.stock.trim() === '' ? null : Number(p.stock),
                    })),
                    ...(elegida === 'summon-shard'
                        ? { vaultWeight: Number(pesoVault) }
                        : {}),
                }),
            })
        );
        if (ok) setGuardado(true);
    };

    // La imagen va directo al server; el premio tiene que estar guardado.
    const subirImagen = (prizeId: string, archivo: File) => {
        const form = new FormData();
        form.append('file', archivo);
        correr(
            () =>
                pedir(`wheels/${elegida}/prizes/${prizeId}/image`, {
                    method: 'POST',
                    body: form,
                }),
            false
        ).then(() =>
            // Solo la imagen: lo demas que se este editando no se pisa.
            pedir('wheels').then((d) => {
                const img = d.wheels[elegida]?.prizes.find((p) => p.id === prizeId)?.image ?? null;
                setBorrador((b) => b.map((p) => (p.id === prizeId ? { ...p, image: img } : p)));
            })
        );
    };

    const editar = (i: number, cambio: Partial<Borrador[number]>) =>
        setBorrador((b) => b.map((p, j) => (j === i ? { ...p, ...cambio } : p)));

    if (!datos) {
        return error ? <p className="text-red-300">{error}</p> : null;
    }

    // La chance de cada premio con lo que se esta editando (y los Primals del
    // vault, en el Summon shard), antes de guardar.
    const enJuego = borrador.filter(
        (p) => Number(p.weight) > 0 && (p.stock.trim() === '' || Number(p.stock) > 0)
    );
    const delVault =
        elegida === 'summon-shard'
            ? (datos.wheels['summon-shard']?.vaultAvailable ?? 0) * (Number(pesoVault) || 0)
            : 0;
    const total = enJuego.reduce((n, p) => n + Number(p.weight), 0) + delVault;
    const chance = (p: Borrador[number]) =>
        total && enJuego.includes(p) ? Number(p.weight) / total : 0;

    const simular = (n: number) => {
        const pozo = borrador
            .filter((p) => Number(p.weight) > 0)
            .map((p, i) => ({
                id: p.id || `nuevo-${i}`,
                label: p.label || 'Unnamed prize',
                kind: p.kind,
                amount: Number(p.amount) || 0,
                image: p.image,
                peso: Number(p.weight),
                esperado: 0,
                veces: 0,
            }));
        if (delVault > 0) {
            pozo.push({
                id: 'vault',
                label: 'A vault Primal',
                kind: 'nft',
                amount: 0,
                image: null,
                peso: delVault,
                esperado: 0,
                veces: 0,
            });
        }
        const suma = pozo.reduce((s, p) => s + p.peso, 0);
        for (const p of pozo) p.esperado = suma ? p.peso / suma : 0;
        const sortear = () => {
            let r = Math.random() * suma;
            return pozo.find((p) => (r -= p.peso) < 0) ?? pozo[pozo.length - 1];
        };
        if (n === 1 && suma > 0) {
            const aCarta = (p: (typeof pozo)[number]): PremioRuleta => ({
                id: p.id,
                label: p.label,
                kind: p.kind,
                amount: p.kind === 'nft' ? null : p.amount,
                tokenId: null,
                image: p.image,
                chance: p.esperado,
            });
            const sale = sortear();
            setTirada({
                pozo: pozo.map(aCarta),
                ganado: {
                    id: 'prueba',
                    item: elegida,
                    prize: aCarta(sale),
                    chance: sale.esperado,
                    status: sale.kind === 'fog' ? 'credited' : 'pending',
                    at: new Date().toISOString(),
                },
            });
            return;
        }
        let abiertas = 0;
        while (abiertas < n && suma > 0) {
            sortear().veces++;
            abiertas++;
        }
        setSimulacion({
            abiertas,
            pedidas: n,
            filas: pozo,
            fog: pozo.reduce((s, p) => s + (p.kind === 'fog' ? p.veces * p.amount : 0), 0),
            ape: pozo.reduce((s, p) => s + (p.kind === 'ape' ? p.veces * p.amount : 0), 0),
        });
    };


    return (
        <>
            <div id="wheels" className={`${panel} scroll-mt-32`}>
                <h2 className={titulo}>Prize wheels</h2>
                <p className="text-lightblue/70 text-sm -mt-2">
                    Every key opens a wheel right after it is bought. The prize is drawn on the server with each
                    prize&apos;s weight: chance = weight ÷ the sum of the weights
                    still in stock. Empty stock means unlimited. A wheel can only
                    be bought while it has a prize that is not FOG. FOG prizes are
                    credited on their own; the rest show up below as deliveries.
                </p>
                <div className="flex flex-wrap gap-2">
                    {ruletas.filter((id) => datos.wheels[id]).map((id) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => {
                                setElegida(id);
                                setBorrador(aBorrador(datos.wheels[id].prizes));
                                setGuardado(false);
                                setSimulacion(null);
                            }}
                            className={opcion(elegida === id)}
                        >
                            {nombreDe(id)}
                        </button>
                    ))}
                </div>

                {elegida === 'summon-shard' && (
                    <div className="flex flex-col gap-3 bg-blue rounded-xl p-4">
                        <div className="text-sm text-lightblue">
                            The Primals in the vault wallet are the prizes. They are
                            read from the chain every 10 minutes; a Primal that was
                            won stays reserved until you mark it as sent.
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                            <label className={`${etiqueta} flex-1 min-w-64`}>
                                Vault wallet
                                <input
                                    value={direccion}
                                    onChange={(e) => setDireccion(e.target.value)}
                                    placeholder="0x..."
                                    className={`${campo} font-mono text-sm`}
                                />
                            </label>
                            <button
                                type="button"
                                disabled={ocupado}
                                onClick={() =>
                                    correr(
                                        () =>
                                            pedir('vault', {
                                                method: 'PATCH',
                                                body: JSON.stringify({ address: direccion.trim() || null }),
                                            }),
                                        false
                                    )
                                }
                                className={botonChico}
                            >
                                Save vault
                            </button>
                            <button
                                type="button"
                                disabled={ocupado || !datos.vault.address}
                                onClick={() => correr(() => pedir('vault/refresh', { method: 'POST' }), false)}
                                className={botonChico}
                            >
                                Read now
                            </button>
                        </div>
                        <div className="text-sm text-lightblue/80">
                            {datos.vault.address
                                ? `${datos.vault.count} Primals in the vault, ${datos.wheels['summon-shard']?.vaultAvailable ?? 0} available${
                                      datos.vault.at ? ` · read ${fecha(datos.vault.at)}` : ''
                                  }`
                                : 'No vault yet.'}
                        </div>
                        <label className={`${etiqueta} max-w-56`}>
                            Weight of each vault Primal
                            <input
                                type="number"
                                min={0}
                                value={pesoVault}
                                onChange={(e) => setPesoVault(e.target.value)}
                                className={campo}
                            />
                        </label>
                        {delVault > 0 && total > 0 && (
                            <div className="text-sm text-lightblue/80">
                                Each Primal: {pct(Number(pesoVault) / total)} · all of them together:{' '}
                                {pct(delVault / total)}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    {borrador.map((p, i) => (
                        <div
                            key={p.id || `nuevo-${i}`}
                            className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-[auto_minmax(0,2fr)_7rem_7rem_6rem_6rem_4rem_auto] items-end rounded-xl bg-blue/30 p-3 lg:bg-transparent lg:p-0 lg:rounded-none"
                        >
                            <label
                                title={p.id ? 'Upload an image' : 'Save the wheel first, then add the image'}
                                className={`order-1 lg:order-0 relative size-16 grid place-items-center rounded-xl bg-blue border-2 overflow-hidden ${p.id ? 'cursor-pointer hover:ring-2 hover:ring-yellow' : 'opacity-50 cursor-not-allowed'} transition-all duration-300`}
                                style={{ borderColor: colorRareza(chance(p) || 1) }}
                            >
                                {p.image || p.kind !== 'nft' ? (
                                    <img
                                        src={imagenPremio({ ...p, amount: null, tokenId: null })!}
                                        alt=""
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <FiImage className="w-6 h-6 text-lightblue/60" />
                                )}
                                <input
                                    type="file"
                                    accept=".png,.jpg,.jpeg,.gif,.webp"
                                    disabled={!p.id}
                                    className="sr-only"
                                    onChange={(e) => {
                                        const archivo = e.target.files?.[0];
                                        e.target.value = '';
                                        if (archivo && p.id) subirImagen(p.id, archivo);
                                    }}
                                />
                            </label>
                            <label className={`${etiqueta} order-3 lg:order-0 col-span-2 sm:col-span-4 lg:col-span-1`}>
                                Name
                                <input
                                    value={p.label}
                                    maxLength={60}
                                    onChange={(e) => editar(i, { label: e.target.value })}
                                    className={campo}
                                />
                            </label>
                            <label className={`${etiqueta} order-4 lg:order-0`}>
                                Kind
                                <select
                                    value={p.kind}
                                    onChange={(e) => editar(i, { kind: e.target.value as Premio['kind'] })}
                                    className={`${campo} h-9`}
                                >
                                    {TIPOS.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.nombre}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className={`${etiqueta} order-4 lg:order-0`}>
                                Amount
                                <input
                                    type="number"
                                    min={1}
                                    value={p.kind === 'nft' ? '' : p.amount}
                                    disabled={p.kind === 'nft'}
                                    placeholder={p.kind === 'nft' ? '-' : ''}
                                    onChange={(e) => editar(i, { amount: e.target.value })}
                                    className={`${campo} disabled:opacity-40`}
                                />
                            </label>
                            <label className={`${etiqueta} order-4 lg:order-0`}>
                                Weight
                                <input
                                    type="number"
                                    min={0}
                                    value={p.weight}
                                    onChange={(e) => editar(i, { weight: e.target.value })}
                                    className={campo}
                                />
                            </label>
                            <label className={`${etiqueta} order-4 lg:order-0`}>
                                Stock
                                <input
                                    type="number"
                                    min={0}
                                    value={p.stock}
                                    placeholder="∞"
                                    onChange={(e) => editar(i, { stock: e.target.value })}
                                    className={campo}
                                />
                            </label>
                            <div className="order-2 lg:order-0 sm:col-span-3 self-start lg:self-auto flex items-center justify-end gap-3 lg:contents">
                            <div className="h-9 flex items-center text-sm text-lightblue">
                                {pct(chance(p))}
                            </div>
                            <button
                                type="button"
                                aria-label={`Remove ${p.label}`}
                                onClick={() => setBorrador((b) => b.filter((_, j) => j !== i))}
                                className="h-9 text-lightblue/60 hover:text-red-300 cursor-pointer transition-all duration-300"
                            >
                                <FiX className="w-5 h-5" />
                            </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() =>
                            setBorrador((b) => [
                                ...b,
                                { id: '', label: '', kind: 'nft', amount: '', weight: '1', stock: '1', image: null },
                            ])
                        }
                        className={botonChico}
                    >
                        Add prize
                    </button>
                    <button
                        type="button"
                        onClick={guardar}
                        disabled={ocupado}
                        className="bg-yellow text-darkblue font-accent uppercase rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40"
                    >
                        {ocupado ? 'Saving...' : 'Save wheel'}
                    </button>
                    {guardado && <span className="text-green-300 text-sm">Saved.</span>}
                    {error && <span className="text-red-300 text-sm">{error}</span>}
                </div>

                <div className="flex flex-col gap-3 bg-blue rounded-xl p-4">
                    <div className="text-sm text-lightblue">
                        Simulator: opens test keys with the prizes above, saved or
                        not. Stock is ignored, so every prize with weight can come
                        out as many times as it is drawn. Nothing is charged,
                        credited or saved.
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[1, 10, 100, 1000, 10000].map((n) => (
                            <button key={n} type="button" onClick={() => simular(n)} className={botonChico}>
                                Open {n.toLocaleString('en-US')}
                            </button>
                        ))}
                    </div>
                    {tirada && (
                        <Ruleta
                            premio={{ id: elegida, label: nombreDe(elegida) }}
                            ganado={tirada.ganado}
                            prueba={tirada.pozo}
                            onCerrar={() => setTirada(null)}
                        />
                    )}
                    {simulacion && (
                        <div className="flex flex-col gap-2 text-sm text-lightblue">
                            <div className="text-white">
                                {simulacion.abiertas.toLocaleString('en-US')} keys opened
                            </div>
                            {simulacion.abiertas === 0 ? (
                                <div className="text-red-300">This wheel has no prize with weight.</div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 gap-y-1">
                                        <span className="text-lightblue/60">Prize</span>
                                        <span className="text-lightblue/60 text-right">Times</span>
                                        <span className="text-lightblue/60 text-right">Got</span>
                                        <span className="text-lightblue/60 text-right">Expected</span>
                                        {simulacion.filas.map((f) => (
                                            <div key={f.id} className="contents">
                                                <span className="truncate">{f.label}</span>
                                                <span className="text-right">{f.veces.toLocaleString('en-US')}</span>
                                                <span className="text-right">{pct(f.veces / simulacion.abiertas)}</span>
                                                <span className="text-right text-lightblue/60">{pct(f.esperado)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-lightblue/80">
                                        Paid out: {simulacion.fog.toLocaleString('en-US')} FOG
                                        {simulacion.ape > 0 && ` · ${simulacion.ape.toLocaleString('en-US')} APE`}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

        </>
    );
}
