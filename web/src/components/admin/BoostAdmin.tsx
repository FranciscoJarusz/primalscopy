import { useState } from 'react';

export type BoostGuardado = {
    id: string;
    multiplier: number;
    title: string;
    startAt: string;
    endsAt: string;
    // Escondido del admin; sigue guardado porque el FOG que pago depende de el.
    archived?: boolean;
};

const campo =
    'w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-medium text-base leading-normal! rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow';
const etiqueta = 'flex flex-col gap-1 text-sm text-lightblue/80';
const botonChico =
    'bg-lightblue text-darkblue font-accent uppercase text-sm rounded-md px-3 pb-1 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-40';

const fecha = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const quedan = (iso: string) => {
    const ms = Date.parse(iso) - Date.now();
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
};

export default function BoostAdmin({
    boosts,
    enviar,
}: {
    boosts: BoostGuardado[];
    enviar: (cambios: object) => Promise<void>;
}) {
    const [multiplicador, setMultiplicador] = useState('2');
    const [dias, setDias] = useState('30');
    const [nombre, setNombre] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [confirmarFin, setConfirmarFin] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ahora = Date.now();
    const actual = boosts.find(
        (b) => Date.parse(b.startAt) <= ahora && ahora < Date.parse(b.endsAt)
    );
    const [verPasados, setVerPasados] = useState(false);
    const pasados = boosts
        .filter((b) => b !== actual && !b.archived && Date.parse(b.endsAt) <= ahora)
        .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));

    const mandar = async (cambios: object) => {
        setOcupado(true);
        setError(null);
        try {
            await enviar(cambios);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
        setOcupado(false);
        setConfirmarFin(false);
    };

    return (
        <div className="flex flex-col gap-4">
            <h2 className="font-accent uppercase text-yellow text-2xl">Boost</h2>
            <p className="text-lightblue/70 text-sm -mt-2">
                Multiplies the FOG of every Primal staking, bonuses included,
                for the days you pick. It starts right away and shows as a
                banner on the map with the time left. Unstaking early loses
                it, like the bonus.
            </p>
            {actual ? (
                <div className="flex flex-wrap items-center gap-3 bg-blue rounded-xl px-4 py-3">
                    {/* Sunzone queda 0,19em por debajo del centro (ver SUBIR
                        en Staking.tsx). */}
                    <span className="relative -top-[0.19em] font-accent uppercase text-yellow text-xl">
                        x{actual.multiplier}
                    </span>
                    <span className="text-white">{actual.title}</span>
                    <span className="text-lightblue/70 text-sm">
                        until {fecha(actual.endsAt)} · {quedan(actual.endsAt)}
                    </span>
                    {confirmarFin ? (
                        <span className="flex items-center gap-2 ml-auto">
                            <span className="text-sm text-lightblue">
                                End it now? What it already paid stays.
                            </span>
                            <button
                                type="button"
                                disabled={ocupado}
                                onClick={() => mandar({ boost: { end: true } })}
                                className={botonChico}
                            >
                                End
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmarFin(false)}
                                className="text-sm text-lightblue/70 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                            >
                                Cancel
                            </button>
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirmarFin(true)}
                            className={`${botonChico} ml-auto`}
                        >
                            End early
                        </button>
                    )}
                </div>
            ) : (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        mandar({
                            boost: {
                                multiplier: Number(multiplicador),
                                days: Number(dias),
                                title: nombre,
                            },
                        });
                    }}
                    className="grid gap-3 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_auto] items-end"
                >
                    <label className={etiqueta}>
                        Multiplier
                        <input
                            type="number"
                            min={1.01}
                            max={10}
                            step={0.01}
                            value={multiplicador}
                            onChange={(e) => setMultiplicador(e.target.value)}
                            className={campo}
                        />
                    </label>
                    <label className={etiqueta}>
                        Days
                        <input
                            type="number"
                            min={1}
                            max={365}
                            value={dias}
                            onChange={(e) => setDias(e.target.value)}
                            className={campo}
                        />
                    </label>
                    <label className={etiqueta}>
                        Name on the banner
                        <input
                            value={nombre}
                            maxLength={40}
                            placeholder={`x${multiplicador || 2} FOG`}
                            onChange={(e) => setNombre(e.target.value)}
                            className={campo}
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={ocupado}
                        className={`${botonChico} h-9`}
                    >
                        Start
                    </button>
                </form>
            )}
            {error && <p className="text-red-300 text-sm">{error}</p>}
            {pasados.length > 0 && (
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => setVerPasados(!verPasados)}
                        aria-expanded={verPasados}
                        className="self-start text-sm text-lightblue/70 hover:text-yellow cursor-pointer transition-all duration-300"
                    >
                        {verPasados ? '▾' : '▸'} Past boosts ({pasados.length})
                    </button>
                    {verPasados && (
                        <ul className="text-lightblue/60 text-sm flex flex-col gap-1">
                            {pasados.map((b) => (
                                <li key={b.id} className="flex flex-wrap items-center gap-x-3">
                                    <span>
                                        {b.title.toLowerCase().startsWith(`x${b.multiplier}`)
                                            ? b.title
                                            : `x${b.multiplier} ${b.title}`}{' '}
                                        · {fecha(b.startAt)} to {fecha(b.endsAt)}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={ocupado}
                                        onClick={() => mandar({ boost: { archive: b.id } })}
                                        className="text-xs text-lightblue/60 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300 disabled:opacity-40"
                                    >
                                        Archive
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
