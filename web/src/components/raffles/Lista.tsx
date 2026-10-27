import { useEffect, useMemo, useState } from 'react';
import { useApodos, nombreWallet } from '@/lib/nicknames';
import { fog, ICONO_FOG_CHICO } from '@/lib/staking';
import { leerRaffles, type MiRaffles, type Raffle } from '@/lib/raffles';
import Ganaste from './Ganaste';
import { botonAmarillo, card } from '@/components/forge/estilos';
import Dato from '@/components/shared/Dato';
import {
    BarraEntradas,
    Estado,
    Imagen,
    cierra,
    entradasTexto,
    fechaCorta,
    filasPremios,
    ganadoresTexto,
    odds,
    premiosTexto,
    quienEntra,
    useEsperandoSorteo,
    useMio,
    type Session,
    pastilla,
    reloj,
    useAhora,
    URGENTE,
} from './comun';

type Filtro = 'all' | 'live' | 'past';

const enlace = (r: Raffle) => `/raffles/${r.id}`;
const seleccionable =
    'cursor-pointer outline-none ring-yellow hover:ring-2 focus-visible:ring-2 hover:-translate-y-1 active:scale-97 transition-all duration-300';

export default function Lista() {
    const [lista, setLista] = useState<{ active: Raffle[]; past: Raffle[] } | null>(null);
    const [fallo, setFallo] = useState(false);
    const [filtro, setFiltro] = useState<Filtro>('live');
    const { session, mio, recargar } = useMio();
    const esperando = useEsperandoSorteo(lista?.active ?? [], recargar);

    useEffect(() => {
        const cargar = () =>
            leerRaffles()
                .then((l) => {
                    setLista(l);
                    setFallo(false);
                })
                .catch(() => setFallo(true));
        cargar();
        const t = setInterval(cargar, esperando ? 2_000 : 30_000);
        return () => clearInterval(t);
    }, [esperando]);

    const activos = useMemo(() => (lista?.active ?? []).slice().sort((a, b) => cierra(a) - cierra(b)), [lista]);
    const pasados = lista?.past ?? [];
    const destacado = activos[0] ?? pasados[0] ?? null;
    const visibles = filtro === 'live' ? activos : filtro === 'past' ? pasados : [...activos, ...pasados];

    const filtros: { id: Filtro; nombre: string; n: number }[] = [
        { id: 'live', nombre: 'Live', n: activos.length },
        { id: 'past', nombre: 'Past', n: pasados.length },
        { id: 'all', nombre: 'All', n: activos.length + pasados.length },
    ];

    return (
        <main className="w-full text-lightblue flex flex-col gap-6 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-5xl sm:text-7xl">Raffles</h1>
                <p className="text-lightblue text-base sm:text-lg md:text-xl mt-3 sm:mt-4 max-w-3xl">
                    One entry per wallet: free if you hold a Primal, paid with FOG if you don't. Raffle Tickets add
                    extra entries.
                </p>
            </div>

            {!lista && (
                <p className="text-lightblue/70">
                    {fallo ? 'Raffles are unavailable right now. Try again in a moment.' : 'Loading...'}
                </p>
            )}

            {lista && !destacado && (
                <section className={`${pastilla} p-6 sm:p-10`}>
                    <h2 className="font-accent uppercase text-yellow text-3xl sm:text-4xl leading-none pb-2">No raffles yet</h2>
                    <p className="mt-2">The first one opens soon. Stake your Primals in the meantime to stack FOG.</p>
                </section>
            )}

            {destacado && <Destacado raffle={destacado} session={session} mio={mio} />}
            <Ganaste mio={mio} wallet={session.address} />

            {lista && destacado && (
                <section className="flex flex-col gap-4 sm:gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="font-accent uppercase text-yellow text-3xl sm:text-4xl leading-none pb-2">All raffles</h2>
                        <div role="tablist" className="grid grid-cols-3 gap-2 bg-darkblue rounded-2xl p-1.5 shadow-lg shadow-darkblue/50">
                            {filtros.map((f) => (
                                <button
                                    key={f.id}
                                    role="tab"
                                    aria-selected={filtro === f.id}
                                    onClick={() => setFiltro(f.id)}
                                    className={`h-10 rounded-xl font-accent uppercase text-sm sm:text-base leading-none pb-1 px-4 cursor-pointer active:scale-97 transition-all duration-300 ${
                                        filtro === f.id ? 'bg-yellow text-darkblue' : 'text-lightblue hover:bg-lightblue hover:text-darkblue'
                                    }`}
                                >
                                    {f.nombre} {f.n}
                                </button>
                            ))}
                        </div>
                    </div>
                    {visibles.length === 0 ? (
                        <p className="text-lightblue/70">
                            {filtro === 'live' ? 'No raffle is open right now.' : 'No raffle has been drawn yet.'}
                        </p>
                    ) : (
                        <div className="grid gap-4 sm:gap-5 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {visibles.map((r) => (
                                <Tarjeta key={r.id} raffle={r} />
                            ))}
                        </div>
                    )}
                </section>
            )}
        </main>
    );
}

function Cierre({ raffle }: { raffle: Raffle }) {
    const ahora = useAhora();
    if (raffle.status === 'drawn') return <>{raffle.drawnAt ? `Drawn ${fechaCorta(raffle.drawnAt)}` : 'Drawn'}</>;
    if (!raffle.endsAt) return <>Open until drawn</>;
    const resta = Date.parse(raffle.endsAt) - ahora;
    if (resta <= 0) return <>Drawing now</>;
    return <span className={resta <= URGENTE ? 'text-red-300' : ''}>Closes in {reloj(resta)}</span>;
}

function Destacado({ raffle, session, mio }: { raffle: Raffle; session: Session; mio: MiRaffles | null }) {
    const apodos = useApodos();
    const ahora = useAhora();
    const ganador = raffle.winners[0];
    const vivo = raffle.status !== 'drawn';
    const resta = raffle.endsAt ? Date.parse(raffle.endsAt) - ahora : null;
    const mia = mio?.entries[raffle.id];

    const entradas = raffle.maxEntries === null ? fog(raffle.totalEntries) : `${fog(raffle.totalEntries)} / ${fog(raffle.maxEntries)}`;
    const datos: { nombre: string; valor: string; urgente?: boolean; icono?: string }[] = vivo
        ? [
              {
                  nombre: 'Closes in',
                  valor: resta === null ? 'When drawn' : resta <= 0 ? 'Drawing' : reloj(resta),
                  urgente: resta !== null && resta > 0 && resta <= URGENTE,
              },
              { nombre: 'Players', valor: fog(raffle.participants) },
              { nombre: 'Per entry', valor: fog(raffle.ticketPrice), icono: ICONO_FOG_CHICO },
          ]
        : [
              { nombre: 'Drawn', valor: raffle.drawnAt ? fechaCorta(raffle.drawnAt) : '—' },
              { nombre: 'Entries', valor: fog(raffle.totalEntries) },
              { nombre: 'Players', valor: fog(raffle.participants) },
          ];
    const filas: [string, string, boolean][] = [
        ...(premiosTexto(raffle) || ganadoresTexto(raffle) !== '1 winner'
            ? filasPremios(raffle).map(([a, b]): [string, string, boolean] => [a, b, true])
            : []),
        ...(vivo ? [['Who can enter', quienEntra(raffle), false] as [string, string, boolean]] : []),
        ...(!vivo && ganador
            ? [
                  [
                      'Won by',
                      `${nombreWallet(ganador.wallet, apodos)}${raffle.winners.length > 1 ? ` and ${raffle.winners.length - 1} more` : ''}`,
                      true,
                  ] as [string, string, boolean],
              ]
            : []),
    ];

    let estado: string | null = null;
    if (vivo && session.token && mio) {
        if (mia?.entries) estado = `You're in with ${entradasTexto(mia.entries)}, ${odds(mia.entries, raffle.totalEntries)} odds.`;
        else if (raffle.holdersFree && mio.holder) estado = 'You hold a Primal, so your entry is free.';
        else if (raffle.publicPrice !== null) estado = `You can join for ${raffle.publicPrice ? `${fog(raffle.publicPrice)} FOG` : 'free'}.`;
    }

    return (
        <section className={`${pastilla} p-4 sm:p-5 grid gap-5 md:gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start`}>
            <Imagen raffle={raffle} className="aspect-square w-full rounded-2xl" />
            <div className="flex flex-col gap-5 min-w-0 p-2 sm:p-4 md:pl-0">
                <div className="flex flex-col gap-3 items-start">
                    <Estado raffle={raffle} />
                    <h2 className="font-accent uppercase text-yellow text-4xl sm:text-5xl xl:text-6xl leading-none pb-2 wrap-break-word">
                        {raffle.title}
                    </h2>
                    {raffle.description && <p className="sm:text-lg whitespace-pre-line line-clamp-3">{raffle.description}</p>}
                </div>

                <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3 sm:gap-4">
                    {datos.map((d) => (
                        <Dato key={d.nombre} label={d.nombre} valor={d.valor} icono={d.icono} tono={d.urgente ? 'text-red-300' : 'text-yellow'} />
                    ))}
                </div>

                {vivo && (
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between gap-3">
                            <span className="text-xs sm:text-sm font-bold uppercase text-lightblue/70">Entries</span>
                            <span className="text-sm text-white tabular-nums">{entradas}</span>
                        </div>
                        <BarraEntradas raffle={raffle} alto="h-2" />
                    </div>
                )}

                {filas.length > 0 && (
                    <dl className="m-0 flex flex-col">
                        {filas.map(([dt, dd, destacado]) => (
                            <div key={dt} className="flex justify-between gap-4 py-2.5 border-b border-lightblue/12 last:border-0 text-sm sm:text-base">
                                <dt>{dt}</dt>
                                <dd className={`m-0 text-right font-semibold ${destacado ? 'text-yellow' : 'text-white'}`}>{dd}</dd>
                            </div>
                        ))}
                    </dl>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <a href={enlace(raffle)} className={`${botonAmarillo} sm:mt-0!`}>
                        {vivo ? (mia?.base ? 'Add Raffle Tickets' : 'Enter raffle') : 'View result'}
                    </a>
                    {estado && <span className="text-sm font-semibold text-yellow">{estado}</span>}
                </div>
            </div>
        </section>
    );
}

function Tarjeta({ raffle }: { raffle: Raffle }) {
    const apodos = useApodos();
    const ganador = raffle.winners[0];
    const precio =
        raffle.holdersFree && raffle.publicPrice === null
            ? 'Holders'
            : raffle.publicPrice
              ? `${fog(raffle.publicPrice)} FOG`
              : 'Free';

    return (
        <a href={enlace(raffle)} className={`${card} ${seleccionable} group flex flex-col gap-3`}>
            <div className="relative rounded-xl overflow-hidden">
                <Imagen raffle={raffle} className="aspect-square w-full" />
                <span className="absolute top-2.5 left-2.5">
                    <Estado raffle={raffle} />
                </span>
            </div>
            <div className="flex items-start justify-between gap-3">
                <h3 className="font-accent uppercase text-white text-xl leading-none pb-1.5 min-w-0 wrap-break-word group-hover:text-yellow transition-all duration-300">
                    {raffle.title}
                </h3>
                <span className="font-accent uppercase text-yellow text-sm leading-none pb-1 shrink-0 mt-1">{precio}</span>
            </div>
            <span className="text-sm truncate">
                {raffle.status === 'drawn'
                    ? ganador
                        ? `Won by ${nombreWallet(ganador.wallet, apodos)}`
                        : 'Nobody entered'
                    : (premiosTexto(raffle) ?? ganadoresTexto(raffle))}
            </span>
            <BarraEntradas raffle={raffle} />
            <div className="flex justify-between gap-3 text-xs">
                <span>{entradasTexto(raffle.totalEntries)}</span>
                <Cierre raffle={raffle} />
            </div>
        </a>
    );
}
