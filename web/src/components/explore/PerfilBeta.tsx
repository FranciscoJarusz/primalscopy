import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { FiArrowUpRight, FiCheck, FiEdit2, FiLink } from 'react-icons/fi';
import { leerPerfil, urlFicha, type Perfil as Datos } from '@/lib/explore';
import { fog, ICONO_FOG_CHICO, leerMapa, miniaturaPrimal } from '@/lib/staking';
import { walletCorta } from '@/lib/nicknames';
import { ZONAS } from '@/lib/zonas';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import { leerTablero, type Tablero } from '@/lib/insignias';
import Sticker, { giro } from '@/components/insignias/Sticker';
import Carta from './Carta';
import EditarPerfil from './EditarPerfil';
import { rememberPrimal } from '@/lib/cultomizer/avatarPrimal';

const card =
    'rounded-2xl sm:rounded-[30px] bg-darkblue shadow-lg shadow-darkblue/50 p-5 sm:p-8';
const titulo = 'font-accent uppercase text-yellow text-2xl sm:text-3xl';
const accion =
    'h-8 inline-flex items-center gap-1.5 rounded-md bg-lightblue text-darkblue font-accent uppercase px-3 leading-none cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300';
const POR_TANDA = 30;

function Icono({ src }: { src: string }) {
    return (
        <span
            aria-hidden="true"
            className="size-5 shrink-0 bg-current"
            style={{ mask: `url(${src}) center / contain no-repeat` }}
        />
    );
}

function Numero({ label, valor, icono = false }: { label: string; valor: string; icono?: boolean }) {
    return (
        <div className="flex flex-col">
            <span className="text-xs uppercase text-lightblue/60">{label}</span>
            <span className="inline-flex items-center gap-1.5 font-accent text-2xl text-white leading-none pb-1.5">
                {icono && <img src={ICONO_FOG_CHICO} alt="" className="size-5 mt-1" />}
                {valor}
            </span>
        </div>
    );
}

function hace(iso: string) {
    const min = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 60000));
    if (min < 60) return `${min}m ago`;
    if (min < 60 * 24) return `${Math.floor(min / 60)}h ago`;
    if (min < 60 * 24 * 30) return `${Math.floor(min / 60 / 24)}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Actividad({ a }: { a: Datos['activity'][number] }) {
    const zona = ZONAS.find((z) => z.days === a.days);
    const primal = a.tokenId ? (
        <a href={urlFicha(a.tokenId)} className="text-yellow hover:underline underline-offset-4">
            #{a.tokenId}
        </a>
    ) : null;
    const texto =
        a.kind === 'forge' ? (
            <>Forged {primal}</>
        ) : a.kind === 'customize' ? (
            <>Cultomized {primal}</>
        ) : a.kind === 'stake' ? (
            <>Sent {primal} to {zona?.titulo ?? `${a.days} days`}</>
        ) : a.kind === 'trained' ? (
            <>{primal} finished training in {zona?.nombre ?? `${a.days} days`}</>
        ) : (
            <>Redeemed {a.label}</>
        );
    return (
        <li className="flex items-center gap-3">
            <img
                src={a.tokenId ? miniaturaPrimal(a.tokenId) : ICONO_FOG_CHICO}
                alt=""
                className="size-9 shrink-0 rounded-lg object-cover bg-blue"
            />
            <span className="flex-1 min-w-0 text-sm text-lightblue">{texto}</span>
            <span className="text-xs text-lightblue/50 shrink-0">{hace(a.at)}</span>
        </li>
    );
}

export default function PerfilBeta({
    id,
    inicial,
}: {
    id: string;
    inicial: Datos | null;
}) {
    const { address } = useAccount();
    const [datos, setDatos] = useState<Datos | null>(inicial);
    const [error, setError] = useState<string | null>(null);
    const [entrenando, setEntrenando] = useState<Map<number, number>>(
        new Map()
    );
    const [cuantos, setCuantos] = useState(POR_TANDA);
    const [editando, setEditando] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const [linkCopiado, setLinkCopiado] = useState(false);
    const [tablero, setTablero] = useState<Tablero | null>(null);

    const copiarDiscord = async (usuario: string) => {
        try {
            await navigator.clipboard.writeText(usuario);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
        } catch {}
    };

    useEffect(() => {
        leerPerfil(id)
            .then(setDatos)
            .catch((e) => !inicial && setError(e.message));
        leerTablero(id)
            .then(setTablero)
            .catch(() => {});
        leerMapa()
            .then((periodos) => {
                const mapa = new Map<number, number>();
                for (const [dias, ids] of Object.entries(periodos)) {
                    for (const t of ids) mapa.set(Number(t), Number(dias));
                }
                setEntrenando(mapa);
            })
            .catch(() => {});
    }, [id]);

    if (!datos) {
        return (
            <div className={card}>
                <p className="text-lightblue">{error ?? 'Loading...'}</p>
            </div>
        );
    }

    const esMio = address?.toLowerCase() === datos.wallet;
    const nombre = datos.nickname ?? walletCorta(datos.wallet);
    const link = `${window.location.origin}/holder/${datos.nickname ?? datos.wallet}`;
    const primals = `${datos.tokens.length} Primal${datos.tokens.length === 1 ? '' : 's'}`;
    const tweet = new URL('https://x.com/intent/tweet');
    tweet.searchParams.set(
        'text',
        esMio
            ? `My Primal Cult profile: ${primals} and ${fog(datos.fog.balance)} FOG. Check it out: ${link}\n\n#CultNeverDies #PrimalCult`
            : `Check out ${nombre}'s ${primals} on Primal Cult: ${link}\n\n#CultNeverDies #PrimalCult`
    );
    const copiarLink = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setLinkCopiado(true);
            setTimeout(() => setLinkCopiado(false), 1500);
        } catch {}
    };
    const avatar = datos.profile.avatar;
    const destacados = datos.profile.featured
        .map((t) => datos.tokens.find((x) => x.id === t))
        .filter((t) => t !== undefined);
    const sellos = (tablero?.badges ?? []).filter((b) => b.earned);
    const unico = sellos.find((b) => b.id === 'one-of-one' && b.earned);
    const resto = sellos.filter((b) => b !== unico);

    return (
        <div className="flex flex-col gap-5 sm:gap-8">
            <div className="grid gap-5 sm:gap-8 lg:grid-cols-12 items-start">
                <div
                    className="lg:col-span-7 rounded-2xl sm:rounded-[30px] shadow-lg shadow-darkblue/50 bg-[#0b0b0b] bg-cover bg-center p-5 sm:p-8 lg:aspect-[3/2] grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center"
                    style={{ backgroundImage: 'url(/profile/fondo.webp)' }}
                >
                    <div className="relative w-full max-w-56 mx-auto aspect-[994/1326] -rotate-2">
                        {avatar && (
                            <img
                                src={miniaturaPrimal(avatar, 384)}
                                alt=""
                                className="absolute object-cover left-[7.55%] top-[4.98%] w-[84.71%] h-[63.5%]"
                            />
                        )}
                        <img src="/profile/estampilla.webp" alt="" className="absolute inset-0 w-full h-full drop-shadow-2xl" />
                        <div className="absolute left-[8%] right-[8%] top-[69.5%] bottom-[5.5%] flex flex-col text-black">
                            <div className="flex items-center gap-2">
                                <h1
                                    className={`flex-1 min-w-0 truncate leading-none ${
                                        datos.nickname ? 'font-accent uppercase text-2xl sm:text-3xl pb-1.5' : 'font-mono text-base'
                                    }`}
                                >
                                    {nombre}
                                </h1>
                                <img src="/profile/icono.webp" alt="" className="size-7 sm:size-8 shrink-0" />
                            </div>
                            <div className="border-t-2 border-black mt-1 pt-1 text-[9px] sm:text-[10px] uppercase font-semibold leading-tight line-clamp-3 wrap-break-word">
                                {datos.profile.bio || 'Once a cultist, always a cultist.'}
                            </div>
                        </div>
                        {unico && (
                            <div className="absolute -top-8 -left-8 w-28 aspect-square scale-[.6] origin-top-left -rotate-6 [&>div]:w-full!">
                                <Sticker b={unico} />
                            </div>
                        )}
                    </div>

                    {tablero && resto.length === 0 ? (
                        <p className="text-white/50 text-center">No badges yet.</p>
                    ) : tablero ? (
                        <ul className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                            {resto.map((b) => (
                                <li
                                    key={b.id}
                                    className="hover:scale-110 hover:rotate-0 transition-all duration-300"
                                    style={{ rotate: `${giro(b.id)}deg` }}
                                >
                                    <Sticker b={b} chico />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-white/50 text-center">Loading badges...</p>
                    )}
                </div>

                <div className="lg:col-span-5 flex flex-col gap-5 sm:gap-6">
                    <div className={`${card} flex flex-col gap-4`}>
                        <div className="flex flex-wrap gap-2">
                            {esMio && (
                                <button onClick={() => setEditando(true)} className={accion}>
                                    <FiEdit2 className="w-4 h-4" strokeWidth={2.5} />
                                    <span className="relative top-[-0.19em]">Edit profile</span>
                                </button>
                            )}
                            <a href={tweet.href} target="_blank" rel="noopener noreferrer" className={accion}>
                                <Icono src="/icons/x.svg" />
                                <span className="relative top-[-0.19em]">Share</span>
                            </a>
                            <button onClick={copiarLink} className={accion}>
                                {linkCopiado ? (
                                    <FiCheck className="w-4 h-4" strokeWidth={2.5} />
                                ) : (
                                    <FiLink className="w-4 h-4" strokeWidth={2.5} />
                                )}
                                <span className="relative top-[-0.19em]">{linkCopiado ? 'Copied!' : 'Copy link'}</span>
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Numero label="Primals" valor={fog(datos.tokens.length)} />
                            <Numero label="Training" valor={fog(datos.fog.training)} />
                            <Numero label="FOG" valor={fog(datos.fog.balance)} icono />
                            <Numero label="FOG per day" valor={fog(datos.fog.perDay)} icono />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-lightblue border-t border-lightblue/10 pt-4">
                            <a
                                href={`${APECHAIN.explorador}/address/${datos.wallet}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-lightblue/70 hover:text-yellow transition-all duration-300"
                            >
                                {walletCorta(datos.wallet)} <FiArrowUpRight size={14} />
                            </a>
                            {datos.rank && (
                                <span>
                                    Holder <span className="text-yellow font-semibold">#{datos.rank}</span> of{' '}
                                    {datos.holders.toLocaleString('en-US')}
                                </span>
                            )}
                            {datos.profile.x && (
                                <a
                                    href={`https://x.com/${datos.profile.x}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 hover:text-yellow transition-all duration-300"
                                >
                                    <Icono src="/icons/x.svg" />@{datos.profile.x}
                                </a>
                            )}
                            {datos.profile.discord && (
                                <button
                                    onClick={() => copiarDiscord(datos.profile.discord)}
                                    title="Copy Discord username"
                                    className="inline-flex items-center gap-1.5 hover:text-yellow cursor-pointer transition-all duration-300"
                                >
                                    <Icono src="/icons/discord.svg" />
                                    {copiado ? 'Copied!' : datos.profile.discord}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className={`${card} flex flex-col gap-3`}>
                        <h2 className={titulo}>Activity</h2>
                        {datos.activity.length === 0 ? (
                            <p className="text-lightblue/60">Nothing yet.</p>
                        ) : (
                            <ul className="flex flex-col gap-2.5">
                                {datos.activity.map((a, i) => (
                                    <Actividad key={`${a.at}-${i}`} a={a} />
                                ))}
                            </ul>
                        )}
                    </div>

                    {destacados.length > 0 && (
                        <div className={`${card} flex flex-col gap-3`}>
                            <h2 className={titulo}>Featured</h2>
                            <ul className="grid grid-cols-3 gap-2 sm:gap-3">
                                {destacados.map((t) => (
                                    <li key={t.id}>
                                        <a
                                            href={urlFicha(t.id)}
                                            className="group flex flex-col gap-1 rounded-xl overflow-hidden"
                                        >
                                            <img
                                                src={miniaturaPrimal(t.id, 192)}
                                                alt={`Primal #${t.id}`}
                                                className="w-full aspect-square object-cover rounded-xl bg-blue group-hover:scale-103 transition-all duration-300"
                                            />
                                            <span className="font-accent text-yellow pb-1 leading-none">#{t.id}</span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-4 sm:gap-6">
                <h2 className={titulo}>
                    Primals
                    {datos.oneOfOnes > 0 && (
                        <span className="ml-3 text-base text-lightblue/70 normal-case font-sans">
                            {datos.oneOfOnes} 1/1
                            {datos.oneOfOnes === 1 ? '' : 's'}
                        </span>
                    )}
                </h2>
                {datos.tokens.length === 0 ? (
                    <p className="text-lightblue/70">
                        No Primals in this wallet right now.
                    </p>
                ) : (
                    <>
                        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
                            {datos.tokens.slice(0, cuantos).map((t) => (
                                <li key={t.id}>
                                    <Carta
                                        id={Number(t.id)}
                                        rank={t.rank}
                                        zona={ZONAS.find(
                                            (z) =>
                                                z.days ===
                                                entrenando.get(Number(t.id))
                                        )}
                                    />
                                </li>
                            ))}
                        </ul>
                        {datos.tokens.length > cuantos && (
                            <button
                                onClick={() => setCuantos((n) => n + POR_TANDA)}
                                className="self-center h-8 inline-flex items-center rounded-md bg-lightblue text-darkblue font-accent uppercase px-3 pb-[0.38em] leading-none cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300"
                            >
                                Show more
                            </button>
                        )}
                    </>
                )}
            </div>

            {editando && (
                <EditarPerfil
                    perfil={datos}
                    onCerrar={() => setEditando(false)}
                    onGuardado={(nickname, profile) => {
                        setDatos({ ...datos, nickname, profile });
                        if (profile.avatar)
                            rememberPrimal(datos.wallet, {
                                tokenId: profile.avatar,
                            });
                        setEditando(false);
                    }}
                />
            )}
        </div>
    );
}
