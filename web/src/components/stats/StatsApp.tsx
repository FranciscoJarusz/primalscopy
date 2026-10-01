import { useEffect, useState } from 'react';
import { FiArrowUpRight, FiCheck, FiCopy } from 'react-icons/fi';
import { APECHAIN, NFT_CONTRACT_ADDRESS } from '@/lib/cultomizer/contracts';
import { ROLES, rangoDe, rolDe, type Rol } from '@/lib/stats/roles';
import {
    EVENTO_NICKNAME,
    leerNicknames,
    type DetalleNickname,
} from '@/lib/nicknames';

type Stats = {
    totalSupply: number;
    holders: number;
    distribucion: { slug: string; holders: number }[];
    top: { address: string; cantidad: number }[];
    volumen: { valor: number; simbolo: string; ventas: number } | null;
    actualizado: number;
};

const OPENSEA = 'https://opensea.io/collection/primalcult';
const card =
    'rounded-2xl sm:rounded-[30px] bg-darkblue shadow-lg shadow-darkblue/50 p-5 sm:p-8';
const titulo = 'font-accent uppercase text-yellow text-2xl sm:text-3xl';

const numero = (n: number, decimales = 0) =>
    n.toLocaleString('en-US', {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
    });

const porcentaje = (parte: number, total: number) =>
    total ? `${numero((parte / total) * 100, 1)}%` : '0%';

const corta = (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`;

const hace = (desde: number) => {
    const minutos = Math.floor((Date.now() - desde) / 60000);
    if (minutos < 1) return 'just now';
    return `${minutos} min ago`;
};

function Enlace({
    href,
    children,
}: {
    href: string;
    children: React.ReactNode;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-lightblue text-darkblue font-accent uppercase text-sm rounded-md px-3 pt-1 pb-2 hover:bg-yellow active:scale-97 transition-all duration-300"
        >
            {children}
            <FiArrowUpRight className="mt-1 w-4 h-4" strokeWidth={3} />
        </a>
    );
}

function Resumen({
    stats,
    quemado,
    estado,
}: {
    stats: Stats | null;
    quemado: number | null;
    estado: string | null;
}) {
    const [copiado, setCopiado] = useState(false);

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(NFT_CONTRACT_ADDRESS);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
        } catch {}
    };

    const datos = [
        { label: 'Total supply', valor: stats && numero(stats.totalSupply) },
        { label: 'Unique holders', valor: stats && numero(stats.holders) },
        {
            label: 'Total traded volume',
            valor:
                stats &&
                (stats.volumen
                    ? `${numero(stats.volumen.valor, 2)} ${stats.volumen.simbolo}`
                    : '-'),
            detalle: stats?.volumen && `${numero(stats.volumen.ventas)} sales`,
        },
        {
            label: 'Total APE burned',
            valor: quemado === null ? null : numero(quemado, 2),
        },
    ];

    return (
        <section data-anim="reveal" className={`${card} flex flex-col gap-6`}>
            <h2 className={titulo}>Collection overview</h2>

            <div data-anim-stagger className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {datos.map((d) => (
                    <div
                        key={d.label}
                        className="flex flex-col justify-center gap-2 rounded-xl sm:rounded-2xl bg-lightblue/5 border border-lightblue/10 px-4 pt-3 pb-4"
                    >
                        <span className="text-xs sm:text-sm font-bold uppercase text-lightblue/70">
                            {d.label}
                        </span>
                        {d.valor ? (
                            <span className="font-accent text-3xl sm:text-4xl text-yellow leading-none">
                                {d.valor}
                            </span>
                        ) : (
                            <span className="mt-2 h-8 w-24 rounded-md bg-lightblue/10 animate-pulse" />
                        )}
                        {d.detalle && (
                            <span className="text-xs text-lightblue/60">
                                {d.detalle}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                    type="button"
                    onClick={copiar}
                    className="flex items-center justify-between gap-3 min-w-0 rounded-md bg-lightblue/5 border border-lightblue/10 px-3 py-2 text-left text-lightblue hover:border-yellow/60 transition-colors duration-300 cursor-pointer"
                >
                    <span className="font-mono text-xs sm:text-sm truncate">
                        {NFT_CONTRACT_ADDRESS}
                    </span>
                    {copiado ? (
                        <FiCheck
                            className="shrink-0 w-4 h-4 text-yellow"
                            strokeWidth={3}
                        />
                    ) : (
                        <FiCopy className="shrink-0 w-4 h-4" />
                    )}
                </button>

                <div className="flex gap-3">
                    <Enlace
                        href={`${APECHAIN.explorador}/token/${NFT_CONTRACT_ADDRESS}`}
                    >
                        ApeScan
                    </Enlace>
                    <Enlace href={OPENSEA}>OpenSea</Enlace>
                </div>

                {estado && (
                    <p className="sm:ml-auto text-sm text-lightblue/70">{estado}</p>
                )}
            </div>
        </section>
    );
}

function Pastilla({ rol, className = '' }: { rol: Rol; className?: string }) {
    return (
        <span
            className={`font-accent uppercase rounded-md px-2 pb-1.5 leading-none ${className}`}
            style={{
                backgroundColor: rol.color,
                color: rol.textoOscuro ? 'var(--color-darkblue)' : '#fff',
            }}
        >
            {rol.nombre}
        </span>
    );
}

function Distribucion({ stats }: { stats: Stats | null }) {
    return (
        <section className="flex flex-col gap-4 sm:gap-6">
            <h2 data-anim="reveal" className={titulo}>Holder distribution</h2>

            <div data-anim-stagger className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                {ROLES.map((rol, i) => {
                    const holders =
                        stats?.distribucion.find((d) => d.slug === rol.slug)
                            ?.holders ?? 0;
                    return (
                        <div
                            key={rol.slug}
                            className="flex flex-col items-center rounded-2xl sm:rounded-3xl shadow-lg shadow-darkblue/50 px-3 pt-5 pb-6.5 text-center"
                            style={{
                                backgroundColor: rol.color,
                                color: rol.textoOscuro
                                    ? 'var(--color-darkblue)'
                                    : '#fff',
                            }}
                        >
                            <span className="font-accent uppercase text-base sm:text-lg leading-none opacity-80">
                                {rangoDe(i)}
                            </span>
                            {stats ? (
                                <span className="font-accent text-5xl sm:text-6xl leading-none -mt-0.5 sm:-mt-1.5">
                                    {numero(holders)}
                                </span>
                            ) : (
                                <span className="mt-4 h-10 w-16 rounded-md bg-darkblue/15 animate-pulse" />
                            )}
                            <div className="mt-4 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-base">
                                <span className="font-accent uppercase rounded-md bg-darkblue text-white px-2 pb-1.5 leading-none">
                                    {rol.nombre}
                                </span>
                                <span className="font-accent rounded-md bg-darkblue text-yellow px-2 pb-1.5 leading-none">
                                    {stats
                                        ? porcentaje(holders, stats.holders)
                                        : '-'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

const MEDALLAS = [
    { color: '#fdf468', fondo: 'bg-yellow/10 border-yellow/40' },
    { color: '#dfe8ff', fondo: 'bg-lightblue/10 border-lightblue/30' },
    { color: '#e0935a', fondo: 'bg-[#e0935a]/10 border-[#e0935a]/40' },
];

function TopHolders({
    stats,
    nicknames,
}: {
    stats: Stats | null;
    nicknames: Record<string, string>;
}) {
    return (
        <section data-anim="reveal" className={`${card} flex flex-col gap-5`}>
            <div className="flex items-baseline justify-between gap-3">
                <h2 className={titulo}>Top holders</h2>
                {stats && (
                    <span className="text-xs sm:text-sm text-lightblue/60">
                        Top {stats.top.length}
                    </span>
                )}
            </div>

            <div className="relative">
                <ol
                    data-lenis-prevent
                    data-anim-stagger
                    className="flex flex-col gap-2 max-h-136 overflow-y-auto pr-2 pb-6"
                >
                    {stats
                        ? stats.top.map((h, i) => {
                              const medalla = MEDALLAS[i];
                              const rol = rolDe(h.cantidad);
                              return (
                                  <li key={h.address}>
                                      <a
                                          href={`${APECHAIN.explorador}/address/${h.address}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`group flex items-center gap-3 sm:gap-4 rounded-xl border px-3 sm:px-4 py-2.5 transition-colors duration-300 hover:border-yellow/60 ${
                                              medalla?.fondo ??
                                              'border-lightblue/10 bg-lightblue/5'
                                          }`}
                                      >
                                          <span
                                              className="w-8 shrink-0 text-center font-accent text-lg pb-1"
                                              style={{
                                                  color:
                                                      medalla?.color ??
                                                      'rgb(223 232 255 / 0.6)',
                                              }}
                                          >
                                              #{i + 1}
                                          </span>
                                          <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                              {nicknames[h.address] ? (
                                                  <span className="flex flex-col min-w-0">
                                                      <span className="font-accent text-lg text-lightblue leading-none pb-1 truncate group-hover:text-yellow transition-colors duration-300">
                                                          {nicknames[h.address]}
                                                      </span>
                                                      <span className="font-mono text-xs text-lightblue/50">
                                                          {corta(h.address)}
                                                      </span>
                                                  </span>
                                              ) : (
                                                  <span className="font-mono text-sm text-lightblue truncate group-hover:text-yellow transition-colors duration-300">
                                                      {corta(h.address)}
                                                  </span>
                                              )}
                                              <Pastilla
                                                  rol={rol}
                                                  className="w-fit text-xs"
                                              />
                                          </span>
                                          <span className="flex flex-col items-end shrink-0">
                                              <span className="font-accent text-xl text-yellow leading-none pb-1">
                                                  {numero(h.cantidad)}
                                              </span>
                                              <span className="text-xs text-lightblue/60">
                                                  {porcentaje(
                                                      h.cantidad,
                                                      stats.totalSupply
                                                  )}
                                              </span>
                                          </span>
                                      </a>
                                  </li>
                              );
                          })
                        : Array.from({ length: 8 }, (_, i) => (
                              <li
                                  key={i}
                                  className="h-14 rounded-xl bg-lightblue/5 animate-pulse"
                              />
                          ))}
                </ol>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-darkblue to-transparent" />
            </div>
        </section>
    );
}

export default function StatsApp() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [quemado, setQuemado] = useState<number | null>(null);
    const [fallo, setFallo] = useState(false);
    const [nicknames, setNicknames] = useState<Record<string, string>>({});

    useEffect(() => {
        leerNicknames().then(setNicknames);
        const alGuardar = (e: Event) => {
            const { address, nickname } = (e as CustomEvent<DetalleNickname>).detail;
            setNicknames((n) => ({ ...n, [address]: nickname }));
        };
        window.addEventListener(EVENTO_NICKNAME, alGuardar);
        return () => window.removeEventListener(EVENTO_NICKNAME, alGuardar);
    }, []);

    useEffect(() => {
        fetch('/api/stats/holders')
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then(setStats)
            .catch(() => setFallo(true));

        fetch('/api/stats/burned')
            .then((r) => r.json())
            .then((d) => typeof d.value === 'number' && setQuemado(d.value))
            .catch(() => {});
    }, []);

    return (
        <div className="flex flex-col gap-10 sm:gap-14">
            <h1 data-anim="reveal" className="rounded-2xl sm:rounded-[30px] bg-yellow pt-1 pb-5 sm:pt-2 sm:pb-7 xl:pb-9 text-center font-accent text-5xl sm:text-6xl xl:text-7xl uppercase text-darkblue shadow-lg shadow-darkblue/50">
                    Stats
                </h1>

            <Resumen
                stats={stats}
                quemado={quemado}
                estado={
                    fallo
                        ? "Couldn't load holder data. Try again in a few minutes."
                        : stats && `Updated ${hace(stats.actualizado)}`
                }
            />
            <Distribucion stats={stats} />
            <TopHolders stats={stats} nicknames={nicknames} />
        </div>
    );
}
