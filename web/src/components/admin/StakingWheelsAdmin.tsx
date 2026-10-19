// Las ruletas de la tienda de FOG en el admin (ver backend/lib/stakingWheels.js):
// los premios de cada key con su imagen, peso y stock, el vault del Summon
// shard, y las entregas pendientes (NFTs, APE y Primals que hay que mandar a
// mano desde la wallet del proyecto).
import { useCallback, useEffect, useState } from 'react';
import { FiCheck, FiCopy, FiImage, FiX } from 'react-icons/fi';
import { getAddress } from 'viem';
import { useApodos } from '@/lib/nicknames';
import {
    colorRareza,
    imagenPremio,
    miniaturaPrimal,
    type PremioRuleta,
} from '@/lib/staking';
import { BACKEND_URL } from '@/lib/backend';

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

const campo =
    'w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-medium text-base leading-normal! rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow';
const etiqueta = 'flex flex-col gap-1 text-sm text-lightblue/80';
const botonChico =
    'bg-lightblue text-darkblue font-accent uppercase text-sm rounded-md px-3 pb-1 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-40';
const panel =
    'flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50';
const titulo = 'font-accent uppercase text-yellow text-2xl';

// Las wallets se guardan en minusculas; se muestran y copian con mayusculas
// (checksum), que es como las muestran las wallets y el explorador.
const conChecksum = (w: string) => {
    try {
        return getAddress(w);
    } catch {
        return w;
    }
};
const fecha = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
const pct = (n: number) =>
    `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: n < 0.01 ? 2 : 1 })}%`;

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
    const apodos = useApodos();
    const [datos, setDatos] = useState<Datos | null>(null);
    const [elegida, setElegida] = useState(ruletas[0] ?? 'lowkey');
    const [borrador, setBorrador] = useState<Borrador>([]);
    const [pesoVault, setPesoVault] = useState('');
    const [direccion, setDireccion] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [guardado, setGuardado] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [verEnviados, setVerEnviados] = useState(false);
    const [notas, setNotas] = useState<Record<string, string>>({});
    const [copiada, setCopiada] = useState<string | null>(null);

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

    const entregas = datos.wins.filter((w) =>
        verEnviados ? w.status === 'sent' : w.status === 'pending'
    );
    const pendientes = datos.wins.filter((w) => w.status === 'pending').length;

    return (
        <>
            <div className={panel}>
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
                            }}
                            className={`font-accent uppercase text-sm rounded-md px-3 pb-1 cursor-pointer transition-all duration-300 ${
                                elegida === id
                                    ? 'bg-yellow text-darkblue'
                                    : 'bg-blue text-lightblue hover:text-yellow'
                            }`}
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
                            className="grid gap-3 sm:grid-cols-[auto_minmax(0,2fr)_7rem_7rem_6rem_6rem_4rem_auto] items-end"
                        >
                            <label
                                title={p.id ? 'Upload an image' : 'Save the wheel first, then add the image'}
                                className={`relative size-16 grid place-items-center rounded-xl bg-blue border-2 overflow-hidden ${p.id ? 'cursor-pointer hover:ring-2 hover:ring-yellow' : 'opacity-50 cursor-not-allowed'} transition-all duration-300`}
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
                            <label className={etiqueta}>
                                Name
                                <input
                                    value={p.label}
                                    maxLength={60}
                                    onChange={(e) => editar(i, { label: e.target.value })}
                                    className={campo}
                                />
                            </label>
                            <label className={etiqueta}>
                                Kind
                                <select
                                    value={p.kind}
                                    onChange={(e) => editar(i, { kind: e.target.value as Premio['kind'] })}
                                    className={campo}
                                >
                                    {TIPOS.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.nombre}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className={etiqueta}>
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
                            <label className={etiqueta}>
                                Weight
                                <input
                                    type="number"
                                    min={0}
                                    value={p.weight}
                                    onChange={(e) => editar(i, { weight: e.target.value })}
                                    className={campo}
                                />
                            </label>
                            <label className={etiqueta}>
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
            </div>

            <div className={panel}>
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className={`${titulo} flex-1`}>
                        Deliveries{pendientes > 0 && ` (${pendientes} pending)`}
                    </h2>
                    <button
                        type="button"
                        onClick={() => setVerEnviados((v) => !v)}
                        className={botonChico}
                    >
                        {verEnviados ? 'Show pending' : 'Show sent'}
                    </button>
                </div>
                {entregas.length === 0 ? (
                    <p className="text-lightblue/70">
                        {verEnviados ? 'Nothing sent yet.' : 'Nothing to send.'}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {entregas.map((w) => {
                            const imagen =
                                imagenPremio(w.prize) ??
                                (w.prize.tokenId ? miniaturaPrimal(w.prize.tokenId, 192) : null);
                            return (
                                <li key={w.id} className="flex flex-wrap items-center gap-3 text-sm text-lightblue">
                                    <div className="size-10 rounded-lg bg-blue grid place-items-center overflow-hidden">
                                        {imagen ? (
                                            <img src={imagen} alt="" className="w-full h-full object-contain" />
                                        ) : (
                                            <span className="text-[10px] font-accent text-yellow">{w.prize.kind.toUpperCase()}</span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-48 leading-tight">
                                        <div className="text-white">
                                            {w.prize.label}
                                            <span className="text-lightblue/60"> · {datos.wheels[w.item] ? nombreDe(w.item) : 'Shop'}</span>
                                        </div>
                                        <div className="text-lightblue/60 text-xs">
                                            {fecha(w.at)}
                                            {w.note && ` · ${w.note}`}
                                        </div>
                                        {/* La wallet que lo gano, entera: es a donde hay que mandarlo. */}
                                        <div className="mt-1 flex items-center gap-1.5 text-xs">
                                            <span className="text-lightblue/60">Wallet:</span>
                                            {apodos[w.wallet] && (
                                                <span className="text-yellow font-semibold">{apodos[w.wallet]}</span>
                                            )}
                                            <span className="font-mono text-lightblue break-all select-all">
                                                {conChecksum(w.wallet)}
                                            </span>
                                            <button
                                                type="button"
                                                title="Copy the address"
                                                aria-label="Copy the address"
                                                onClick={() => {
                                                    navigator.clipboard?.writeText(conChecksum(w.wallet));
                                                    setCopiada(w.id);
                                                    setTimeout(() => setCopiada((c) => (c === w.id ? null : c)), 1500);
                                                }}
                                                className="shrink-0 inline-flex items-center gap-1 text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300"
                                            >
                                                {copiada === w.id ? (
                                                    <>
                                                        <FiCheck className="size-3.5 text-green-300" />
                                                        <span className="text-green-300">Copied</span>
                                                    </>
                                                ) : (
                                                    <FiCopy className="size-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    {w.status === 'pending' ? (
                                        <>
                                            <input
                                                value={notas[w.id] ?? ''}
                                                onChange={(e) => setNotas((n) => ({ ...n, [w.id]: e.target.value }))}
                                                placeholder="Tx hash (optional)"
                                                className={`${campo} w-48 text-sm py-1`}
                                            />
                                            <button
                                                type="button"
                                                disabled={ocupado}
                                                onClick={() =>
                                                    correr(
                                                        () =>
                                                            pedir(`prizes/${w.id}`, {
                                                                method: 'PATCH',
                                                                body: JSON.stringify({ status: 'sent', note: notas[w.id] }),
                                                            }),
                                                        false
                                                    )
                                                }
                                                className={botonChico}
                                            >
                                                Mark sent
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={ocupado}
                                            onClick={() =>
                                                correr(
                                                    () =>
                                                        pedir(`prizes/${w.id}`, {
                                                            method: 'PATCH',
                                                            body: JSON.stringify({ status: 'pending' }),
                                                        }),
                                                    false
                                                )
                                            }
                                            className="text-xs text-lightblue/60 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                                        >
                                            Back to pending
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </>
    );
}
