import { useCallback, useEffect, useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';
import { getAddress } from 'viem';
import { useApodos } from '@/lib/nicknames';
import { BACKEND_URL } from '@/lib/backend';
import { imagenPremio, miniaturaPrimal, type PremioRuleta } from '@/lib/staking';
import { imagenRaffle } from '@/lib/raffles';
import { botonChico, campo, fecha, fog, panel, pestana, titulo } from './comun';

type Entrega = {
    clave: string;
    grupo: 'raffle' | 'shop';
    origen: string;
    premio: string;
    imagen: string | null;
    tipo: string;
    wallet: string;
    at: string;
    estado: 'pending' | 'sent';
    nota?: string | null;
    // El texto del boton cuando el premio se entrega solo (FOG, rolls, keys).
    dar: string | null;
    ruta: string;
};

type DeLaShop = {
    id: string;
    wallet: string;
    item: string;
    prize: PremioRuleta;
    status: 'credited' | 'pending' | 'sent';
    note?: string;
    at: string;
};
type GanadorRaffle = {
    slot: number;
    prize: string;
    kind: string | null;
    amount: number | null;
    wallet: string;
    status: 'pending' | 'sent';
    note: string | null;
    auto: boolean;
};
type RaffleAdmin = { id: string; title: string; image: string | null; status: string; drawnAt: string | null; winners: GanadorRaffle[] };

const conChecksum = (w: string) => {
    try {
        return getAddress(w);
    } catch {
        return w;
    }
};

export async function leerEntregas(token: string): Promise<Entrega[]> {
    const pedir = (ruta: string) =>
        fetch(`${BACKEND_URL}/admin/${ruta}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
            if (!r.ok) throw new Error();
            return r.json();
        });
    const [ruletas, staking, raffles] = await Promise.all([pedir('staking/wheels'), pedir('staking'), pedir('raffles')]);
    const nombres: Record<string, string> = Object.fromEntries(
        (staking.config?.catalog ?? []).map((i: { id: string; label: string }) => [i.id, i.label])
    );
    const premios: Record<string, string> = Object.fromEntries(
        (raffles.rewards ?? []).map((r: { id: string; label: string }) => [r.id, r.label])
    );

    const deLaShop: Entrega[] = (ruletas.wins as DeLaShop[])
        .filter((w) => w.status !== 'credited')
        .map((w) => ({
            clave: `shop:${w.id}`,
            grupo: 'shop',
            origen: nombres[w.item] ?? w.item,
            premio: w.prize.label,
            imagen: imagenPremio(w.prize) ?? (w.prize.tokenId ? miniaturaPrimal(w.prize.tokenId, 192) : null),
            tipo: w.prize.kind,
            wallet: w.wallet,
            at: w.at,
            estado: w.status as 'pending' | 'sent',
            nota: w.note,
            dar: null,
            ruta: `staking/prizes/${w.id}`,
        }));

    const deRaffles: Entrega[] = (raffles.raffles as RaffleAdmin[])
        .filter((r) => r.status === 'drawn')
        .flatMap((r) =>
            r.winners.map((w) => {
                const solo = w.auto;
                const cantidad = w.amount && w.amount > 1 ? `${fog(w.amount)} ` : '';
                return {
                    clave: `raffle:${r.id}:${w.slot}`,
                    grupo: 'raffle' as const,
                    origen: r.title,
                    premio: w.prize,
                    imagen: r.image ? imagenRaffle(r.image) : null,
                    tipo: w.kind ?? 'other',
                    wallet: w.wallet,
                    at: r.drawnAt ?? '',
                    estado: w.status,
                    nota: w.note,
                    dar: solo ? `Give ${cantidad}${premios[w.kind!] ?? w.prize}` : null,
                    ruta: `raffles/${r.id}/winners/${w.slot}`,
                };
            })
        );

    return [...deRaffles, ...deLaShop].sort((a, b) => b.at.localeCompare(a.at));
}

export default function EntregasAdmin({ token }: { token: string }) {
    const [entregas, setEntregas] = useState<Entrega[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [verEnviados, setVerEnviados] = useState(false);
    const [notas, setNotas] = useState<Record<string, string>>({});
    const [ocupado, setOcupado] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        try {
            setEntregas(await leerEntregas(token));
            setError(null);
        } catch {
            setError("Couldn't load the deliveries.");
        }
    }, [token]);

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    const marcar = async (e: Entrega, estado: 'pending' | 'sent') => {
        setOcupado(e.clave);
        setError(null);
        try {
            const r = await fetch(`${BACKEND_URL}/admin/${e.ruta}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ status: estado, note: notas[e.clave] ?? '' }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Couldn't save.");
            await cargar();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
        setOcupado(null);
    };

    const pendientes = entregas?.filter((e) => e.estado === 'pending') ?? [];
    const visibles = entregas?.filter((e) => e.estado === (verEnviados ? 'sent' : 'pending')) ?? [];
    const grupos: { id: Entrega['grupo']; nombre: string }[] = [
        { id: 'raffle', nombre: 'From raffles' },
        { id: 'shop', nombre: 'From the Shop' },
    ];

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">Deliveries</h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    Every prize that still has to reach its winner. Prizes from the list (FOG, rolls, keys) are given
                    with one click; the rest you send from the project wallet and mark here.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {[
                    { valor: false, nombre: `To send (${pendientes.length})` },
                    { valor: true, nombre: 'Sent' },
                ].map((o) => (
                    <button
                        key={o.nombre}
                        onClick={() => setVerEnviados(o.valor)}
                        className={pestana(verEnviados === o.valor)}
                    >
                        {o.nombre}
                    </button>
                ))}
            </div>

            {error && <p className="text-red-300 text-sm">{error}</p>}
            {!entregas && !error && <p className="text-lightblue/70">Loading...</p>}

            {entregas &&
                grupos.map((g) => {
                    const items = visibles.filter((e) => e.grupo === g.id);
                    return (
                        <section key={g.id} className={panel}>
                            <h2 className={titulo}>
                                {g.nombre} <span className="text-lightblue/60 text-lg">{items.length}</span>
                            </h2>
                            {items.length === 0 ? (
                                <p className="text-lightblue/70">{verEnviados ? 'Nothing sent yet.' : 'Nothing to send.'}</p>
                            ) : (
                                <ul className="flex flex-col gap-3">
                                    {items.map((e) => (
                                        <Fila
                                            key={e.clave}
                                            entrega={e}
                                            nota={notas[e.clave] ?? ''}
                                            alEscribir={(v) => setNotas((n) => ({ ...n, [e.clave]: v }))}
                                            ocupado={ocupado === e.clave}
                                            alMarcar={(estado) => marcar(e, estado)}
                                        />
                                    ))}
                                </ul>
                            )}
                        </section>
                    );
                })}
        </main>
    );
}

function Fila({
    entrega: e,
    nota,
    alEscribir,
    ocupado,
    alMarcar,
}: {
    entrega: Entrega;
    nota: string;
    alEscribir: (v: string) => void;
    ocupado: boolean;
    alMarcar: (estado: 'pending' | 'sent') => void;
}) {
    const apodos = useApodos();
    const [copiada, setCopiada] = useState(false);

    return (
        <li className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] items-center rounded-xl border border-lightblue/10 bg-lightblue/5 p-3 sm:p-4 text-sm text-lightblue">
            <div className="flex items-center gap-3 min-w-0">
                <div className="size-12 shrink-0 rounded-lg bg-blue grid place-items-center overflow-hidden">
                    {e.imagen ? (
                        <img src={e.imagen} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-[10px] font-accent text-yellow">{e.tipo.toUpperCase()}</span>
                    )}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-white text-base">
                        {e.premio} <span className="text-lightblue/60 text-sm">· {e.origen}</span>
                    </span>
                    <span className="text-lightblue/60 text-xs">
                        {e.at && fecha(e.at)}
                        {e.nota && ` · ${e.nota}`}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs">
                        {apodos[e.wallet] && <span className="text-yellow font-semibold">{apodos[e.wallet]}</span>}
                        <span className="font-mono text-lightblue break-all select-all">{conChecksum(e.wallet)}</span>
                        <button
                            type="button"
                            title="Copy the address"
                            aria-label="Copy the address"
                            onClick={() => {
                                navigator.clipboard?.writeText(conChecksum(e.wallet));
                                setCopiada(true);
                                setTimeout(() => setCopiada(false), 1500);
                            }}
                            className="shrink-0 inline-flex items-center gap-1 text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300"
                        >
                            {copiada ? (
                                <>
                                    <FiCheck className="size-3.5 text-green-300" />
                                    <span className="text-green-300">Copied</span>
                                </>
                            ) : (
                                <FiCopy className="size-3.5" />
                            )}
                        </button>
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {e.estado === 'pending' ? (
                    e.dar ? (
                        <button type="button" disabled={ocupado} onClick={() => alMarcar('sent')} className={botonChico}>
                            {ocupado ? 'Giving...' : e.dar}
                        </button>
                    ) : (
                        <>
                            <div className="w-full sm:w-60">
                                <input
                                    value={nota}
                                    onChange={(ev) => alEscribir(ev.target.value)}
                                    placeholder="Tx hash (optional)"
                                    className={`${campo} text-sm py-1`}
                                />
                            </div>
                            <button type="button" disabled={ocupado} onClick={() => alMarcar('sent')} className={botonChico}>
                                {ocupado ? 'Saving...' : 'Mark sent'}
                            </button>
                        </>
                    )
                ) : e.dar ? (
                    <span className="text-green-300 text-xs">Given</span>
                ) : (
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => alMarcar('pending')}
                        className="text-xs text-lightblue/60 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                    >
                        Back to pending
                    </button>
                )}
            </div>
        </li>
    );
}
