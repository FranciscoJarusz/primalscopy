import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { FiArrowLeft, FiArrowRight, FiArrowUpRight, FiDownload } from 'react-icons/fi';
import {
    leerFicha,
    urlFicha,
    urlHolder,
    UNICO,
    type Ficha as Datos,
} from '@/lib/explore';
import { ZONAS } from '@/lib/zonas';
import { fog, ICONO_FOG_CHICO } from '@/lib/staking';
import { useApodos, walletCorta } from '@/lib/nicknames';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import { tierDe } from '@/components/forge/rareza';
import { urlDeRoll, urlOpenSea } from '@/components/forge/forge';
import { BACKEND_BASE_URL, BACKEND_URL } from '@/lib/backend';

const card =
    'rounded-2xl sm:rounded-[30px] bg-darkblue shadow-lg shadow-darkblue/50 p-5 sm:p-8';
const titulo = 'font-accent uppercase text-yellow text-2xl sm:text-3xl';
const boton =
    'h-8 inline-flex items-center gap-1.5 leading-none rounded-md px-3 font-accent uppercase text-darkblue cursor-pointer active:scale-97 transition-all duration-300';
const botonLink = `${boton} bg-lightblue hover:bg-yellow`;
const botonAmarillo = `${boton} bg-yellow hover:scale-102`;
const subir = 'relative -top-[0.19em]';

const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

const porcentaje = (parte: number, total: number) =>
    `${((parte / total) * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

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
            className={botonLink}
        >
            <span className={subir}>{children}</span>
            <FiArrowUpRight className="w-4 h-4" />
        </a>
    );
}

function Staking({ s }: { s: NonNullable<Datos['staking']> }) {
    const zona = ZONAS.find((z) => z.days === s.days);
    const dias = Math.max(
        0,
        Math.ceil((Date.parse(s.endsAt) - Date.now()) / 86400000)
    );
    return (
        <div
            className="flex flex-col gap-2 rounded-xl border-2 px-4 py-3"
            style={{ borderColor: zona?.color }}
        >
            <span
                className="font-accent uppercase text-lg leading-none pb-1"
                style={{ color: zona?.color }}
            >
                Training in {zona?.titulo ?? `${s.days} days`}
            </span>
            <span className="text-sm text-lightblue/80">
                {dias > 0
                    ? `${dias} day${dias === 1 ? '' : 's'} left`
                    : 'Period finished'}{' '}
                · since {fecha(s.startAt)}
            </span>
            <span className="flex items-center gap-1.5 text-lightblue">
                <img src={ICONO_FOG_CHICO} alt="" className="w-5 h-5" />
                <span className="font-semibold text-yellow">
                    {fog(s.earned)}
                </span>{' '}
                FOG earned
                {s.perDayNow > 0 && (
                    <span className="text-lightblue/60">
                        · {fog(s.perDayNow)}/day
                    </span>
                )}
            </span>
        </div>
    );
}

export default function Ficha({
    id,
    inicial,
}: {
    id: string;
    inicial: Datos | null;
}) {
    const { address } = useAccount();
    const apodos = useApodos();
    const [datos, setDatos] = useState<Datos | null>(inicial);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        leerFicha(id)
            .then(setDatos)
            .catch((e) => !inicial && setError(e.message));
    }, [id]);

    const anterior = Number(id) - 1;
    const siguiente = Number(id) + 1;
    const navegacion = (
        <div className="flex items-center justify-between gap-3">
            <a
                href="/explore"
                className="flex items-center gap-1.5 text-lightblue hover:text-yellow transition-all duration-300"
            >
                <FiArrowLeft className="w-4 h-4" /> All Primals
            </a>
            <div className="flex gap-2">
                {anterior >= 1 && (
                    <a
                        href={urlFicha(anterior)}
                        aria-label="Previous Primal"
                        className={botonLink}
                    >
                        <FiArrowLeft className="w-5 h-5" />
                    </a>
                )}
                {(!datos || siguiente <= datos.total) && (
                    <a
                        href={urlFicha(siguiente)}
                        aria-label="Next Primal"
                        className={botonLink}
                    >
                        <FiArrowRight className="w-5 h-5" />
                    </a>
                )}
            </div>
        </div>
    );

    if (!datos) {
        return (
            <div className="flex flex-col gap-5">
                {navegacion}
                <div className={card}>
                    <p className="text-lightblue">{error ?? 'Loading...'}</p>
                </div>
            </div>
        );
    }

    const esMio = Boolean(address && datos.owner === address.toLowerCase());
    const apodo = datos.owner ? (apodos[datos.owner] ?? datos.ownerName) : null;
    const rasgos = datos.attributes.filter((a) => a.trait_type !== UNICO);
    const unico = datos.attributes.find((a) => a.trait_type === UNICO);

    return (
        <div className="flex flex-col gap-5 sm:gap-8">
            {navegacion}

            <div className="grid gap-5 sm:gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start">
                <div className={`${card} p-3! sm:p-4! flex flex-col gap-4`}>
                    <img
                        src={datos.image ?? ''}
                        alt={datos.name ?? `Primal #${id}`}
                        className="w-full aspect-square object-cover rounded-xl sm:rounded-2xl bg-blue"
                    />
                    <div className="flex flex-wrap gap-2 px-1 pb-1">
                        <Enlace href={urlOpenSea(id)}>OpenSea</Enlace>
                        {(['gif', 'png'] as const).map((formato) => (
                            <a
                                key={formato}
                                href={`${BACKEND_URL}/explore/download/${id}.${formato}`}
                                download={`primal-${id}.${formato}`}
                                className={botonLink}
                            >
                                <span className={subir}>{formato}</span>
                                <FiDownload className="w-4 h-4" />
                            </a>
                        ))}
                        {esMio && (
                            <>
                                <a
                                    href={`/cultomizer/edit?tokenId=${id}`}
                                    className={botonAmarillo}
                                >
                                    <span className={subir}>Customize</span>
                                </a>
                                {!datos.oneOfOne && (
                                    <a
                                        href={urlDeRoll(id)}
                                        className={botonAmarillo}
                                    >
                                        <span className={subir}>Forge</span>
                                    </a>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-5 sm:gap-8">
                    <div className={`${card} flex flex-col gap-5`}>
                        <div className="flex flex-col gap-2">
                            <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl leading-none pb-2">
                                Primal #{id}
                            </h1>
                            <div className="flex flex-wrap items-center gap-2">
                                {datos.rank && (
                                    <span className="rounded-md bg-lightblue/10 px-2.5 py-0.5 text-sm text-lightblue">
                                        Rarity rank{' '}
                                        <span className="text-yellow font-semibold">
                                            #{datos.rank}
                                        </span>{' '}
                                        of {datos.total.toLocaleString('en-US')}
                                    </span>
                                )}
                                {unico && (
                                    <span className="rounded-md bg-amber-400 px-2.5 py-0.5 text-sm font-semibold text-darkblue">
                                        1/1 · {unico.value}
                                    </span>
                                )}
                                {datos.exiled && (
                                    <span className="rounded-md bg-red-600 px-2.5 py-0.5 text-sm font-semibold text-white">
                                        Exiled Twenty
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="text-xs sm:text-sm font-bold uppercase text-lightblue/70">
                                Owner
                            </span>
                            {datos.exiled ? (
                                <span className="text-lightblue">
                                    Locked forever in the Core Beacon.
                                </span>
                            ) : datos.owner ? (
                                <div className="h-8 flex items-center gap-3">
                                    {apodo ? (
                                        <a
                                            href={urlHolder(datos.owner)}
                                            className="font-accent text-xl leading-none text-lightblue hover:text-yellow transition-all duration-300 relative top-[-0.19em]"
                                        >
                                            {apodo}
                                        </a>
                                    ) : (
                                        <a
                                            href={urlHolder(datos.owner)}
                                            className="font-mono text-base leading-none text-lightblue hover:text-yellow transition-all duration-300"
                                        >
                                            {walletCorta(datos.owner)}
                                        </a>
                                    )}
                                    <a
                                        href={`${APECHAIN.explorador}/address/${datos.owner}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label="View on ApeScan"
                                        className="group inline-flex items-center gap-1 font-mono text-xs leading-none text-lightblue transition-all duration-300"
                                    >
                                        {apodo && (
                                            <span className="opacity-50 group-hover:opacity-100 transition-all duration-300">
                                                {walletCorta(datos.owner)}
                                            </span>
                                        )}
                                        <span className="flex opacity-50 group-hover:opacity-100 transition-all duration-300">
                                            <FiArrowUpRight size={16} />
                                        </span>
                                    </a>
                                </div>
                            ) : (
                                <span className="text-lightblue/70">
                                    Couldn't read the owner right now.
                                </span>
                            )}
                        </div>

                        {datos.staking && <Staking s={datos.staking} />}
                    </div>

                    {rasgos.length > 0 && (
                        <div className={`${card} flex flex-col gap-4`}>
                            <h2 className={titulo}>Traits</h2>
                            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                                {rasgos.map((a) => {
                                    const tier = tierDe(a.count / datos.total);
                                    return (
                                        <li key={a.trait_type}>
                                            <a
                                                href={`/explore?t.${encodeURIComponent(a.trait_type)}=${encodeURIComponent(a.value)}`}
                                                className="flex flex-col gap-0.5 rounded-xl bg-lightblue/5 border border-lightblue/10 px-3 py-2 hover:border-yellow/60 transition-all duration-300"
                                            >
                                                <span className="text-xs uppercase text-lightblue/60">
                                                    {a.trait_type}
                                                </span>
                                                <span
                                                    className={`font-semibold truncate ${tier.color}`}
                                                >
                                                    {a.value}
                                                </span>
                                                <span className="text-xs text-lightblue/60">
                                                    {a.count} ·{' '}
                                                    {porcentaje(
                                                        a.count,
                                                        datos.total
                                                    )}{' '}
                                                    · {tier.nombre}
                                                </span>
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {(datos.forge.length > 0 ||
                        datos.customizations.length > 0) && (
                        <div className={`${card} flex flex-col gap-4`}>
                            <h2 className={titulo}>History</h2>
                            {datos.forge.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-xs sm:text-sm font-bold uppercase text-lightblue/70">
                                        Forge
                                    </span>
                                    <ul className="flex flex-col gap-2">
                                        {datos.forge.map((f) => (
                                            <li
                                                key={f.at}
                                                className="rounded-xl bg-lightblue/5 border border-lightblue/10 px-3 py-2"
                                            >
                                                <span className="text-xs text-lightblue/60">
                                                    {fecha(f.at)}
                                                </span>
                                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-lightblue">
                                                    {f.changes
                                                        .filter(
                                                            (c) =>
                                                                c.from !== c.to
                                                        )
                                                        .map((c) => (
                                                            <span
                                                                key={c.category}
                                                            >
                                                                <span className="text-lightblue/60">
                                                                    {c.category}
                                                                    :
                                                                </span>{' '}
                                                                {c.from && (
                                                                    <span className="line-through text-lightblue/50">
                                                                        {c.from}
                                                                    </span>
                                                                )}{' '}
                                                                {c.to}
                                                            </span>
                                                        ))}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {datos.customizations.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-xs sm:text-sm font-bold uppercase text-lightblue/70">
                                        Customizations
                                    </span>
                                    <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {datos.customizations.map((c) => (
                                            <li
                                                key={c.at}
                                                className="flex flex-col gap-1"
                                            >
                                                <img
                                                    src={`${BACKEND_BASE_URL}${c.thumbnail}`}
                                                    alt=""
                                                    loading="lazy"
                                                    className="w-full aspect-square object-cover rounded-lg bg-blue"
                                                />
                                                <span className="text-xs text-lightblue/60">
                                                    {fecha(c.at)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
