import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { FiArrowUpRight, FiCheck, FiEdit2, FiLink } from 'react-icons/fi';
import { leerPerfil, type Perfil as Datos } from '@/lib/explore';
import { fog, ICONO_FOG_CHICO, leerMapa, nombreInsignia } from '@/lib/staking';
import { walletCorta } from '@/lib/nicknames';
import { ZONAS } from '@/lib/zonas';
import { rolDe } from '@/lib/stats/roles';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import { ImagenPrimal } from '@/components/shared/CartaPrimal';
import Dato from '@/components/shared/Dato';
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

function Seccion({
    titulo,
    children,
}: {
    titulo: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 min-w-0">
            <span className="text-xs sm:text-sm font-bold uppercase text-lightblue/70">
                {titulo}
            </span>
            {children}
        </div>
    );
}

export default function Perfil({
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
    const rol = datos.tokens.length ? rolDe(datos.tokens.length) : null;
    const insignias = datos.fog.badges.earned;

    return (
        <div className="flex flex-col gap-5 sm:gap-8">
            <div className={`${card} relative flex flex-col gap-6 sm:gap-8`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
                    {avatar && (
                        <div className="w-32 sm:w-44 shrink-0">
                            <ImagenPrimal
                                tokenId={avatar}
                                className="rounded-2xl"
                            />
                        </div>
                    )}
                    <div className="flex flex-col gap-3 min-w-0">
                        {esMio && (
                            <span className="text-xs sm:text-sm font-bold uppercase text-lightblue/70">
                                Your profile
                            </span>
                        )}
                        <h1
                            className={`text-yellow leading-none break-all ${
                                datos.nickname
                                    ? 'font-accent uppercase text-5xl sm:text-7xl pb-2'
                                    : 'font-mono text-2xl sm:text-4xl'
                            }`}
                        >
                            {datos.nickname ?? walletCorta(datos.wallet)}
                        </h1>
                        <a
                            href={`${APECHAIN.explorador}/address/${datos.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group w-fit inline-flex items-center gap-1 font-mono text-sm leading-none text-lightblue transition-all duration-300"
                        >
                            <span className="opacity-50 group-hover:opacity-100 transition-all duration-300">
                                {datos.nickname
                                    ? walletCorta(datos.wallet)
                                    : 'View on ApeScan'}
                            </span>
                            <span className="flex opacity-50 group-hover:opacity-100 transition-all duration-300">
                                <FiArrowUpRight size={16} />
                            </span>
                        </a>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:absolute sm:top-6 sm:right-6">
                        {esMio && (
                            <button
                                onClick={() => setEditando(true)}
                                className={accion}
                            >
                                <FiEdit2
                                    className="w-4 h-4"
                                    strokeWidth={2.5}
                                />
                                <span className="relative top-[-0.19em]">
                                    Edit profile
                                </span>
                            </button>
                        )}
                        <a
                            href={tweet.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={accion}
                        >
                            <Icono src="/icons/x.svg" />
                            <span className="relative top-[-0.19em]">
                                Share
                            </span>
                        </a>
                        <button onClick={copiarLink} className={accion}>
                            {linkCopiado ? (
                                <FiCheck
                                    className="w-4 h-4"
                                    strokeWidth={2.5}
                                />
                            ) : (
                                <FiLink className="w-4 h-4" strokeWidth={2.5} />
                            )}
                            <span className="relative top-[-0.19em]">
                                {linkCopiado ? 'Copied!' : 'Copy link'}
                            </span>
                        </button>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-3 border-t border-lightblue/10 pt-6 sm:pt-8">
                    <Seccion titulo="Status">
                        <div className="flex flex-wrap items-center gap-2">
                            {rol && (
                                <span
                                    className="h-7 inline-flex items-center font-accent uppercase rounded-md px-2.5 pb-[0.38em] leading-none"
                                    style={{
                                        backgroundColor: rol.color,
                                        color: rol.textoOscuro
                                            ? 'var(--color-darkblue)'
                                            : '#fff',
                                    }}
                                >
                                    {rol.nombre}
                                </span>
                            )}
                            {insignias.map((b) => (
                                <span
                                    key={b}
                                    title={`${b} days staking in a row`}
                                    className="h-7 inline-flex items-center font-accent uppercase rounded-md bg-yellow text-darkblue px-2.5 pb-[0.38em] leading-none"
                                >
                                    {nombreInsignia(b)}
                                </span>
                            ))}
                        </div>
                        {datos.rank && (
                            <span className="text-lightblue">
                                Holder{' '}
                                <span className="text-yellow font-semibold">
                                    #{datos.rank}
                                </span>{' '}
                                of {datos.holders.toLocaleString('en-US')}
                            </span>
                        )}
                    </Seccion>
                    <Seccion titulo="About">
                        {datos.profile.bio ? (
                            <p className="text-lightblue whitespace-pre-line wrap-break-word">
                                {datos.profile.bio}
                            </p>
                        ) : (
                            <p className="text-lightblue/50">
                                {esMio
                                    ? 'Add a bio with Edit profile.'
                                    : 'No bio yet.'}
                            </p>
                        )}
                    </Seccion>
                    <Seccion titulo="Socials">
                        {datos.profile.x || datos.profile.discord ? (
                            <div className="flex flex-col gap-2">
                                {datos.profile.x && (
                                    <a
                                        href={`https://x.com/${datos.profile.x}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-fit inline-flex items-center gap-2 text-lightblue hover:text-yellow transition-all duration-300"
                                    >
                                        <Icono src="/icons/x.svg" />@
                                        {datos.profile.x}
                                    </a>
                                )}
                                {datos.profile.discord && (
                                    <button
                                        onClick={() =>
                                            copiarDiscord(datos.profile.discord)
                                        }
                                        title="Copy Discord username"
                                        className="w-fit inline-flex items-center gap-2 text-lightblue hover:text-yellow cursor-pointer transition-all duration-300"
                                    >
                                        <Icono src="/icons/discord.svg" />
                                        {copiado
                                            ? 'Copied!'
                                            : datos.profile.discord}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <p className="text-lightblue/50">
                                {esMio
                                    ? 'Add your X or Discord with Edit profile.'
                                    : 'No socials yet.'}
                            </p>
                        )}
                    </Seccion>
                </div>
            </div>

            <div className={`${card} flex flex-col gap-6`}>
                <h2 className={titulo}>Overview</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <Dato label="Primals" valor={fog(datos.tokens.length)} />
                    <Dato label="Training" valor={fog(datos.fog.training)} />
                    <Dato
                        label="Current FOG"
                        valor={fog(datos.fog.balance)}
                        icono={ICONO_FOG_CHICO}
                        ancho
                    />
                    <Dato
                        label="FOG per day"
                        valor={fog(datos.fog.perDay)}
                        icono={ICONO_FOG_CHICO}
                        ancho
                    />
                </div>
            </div>

            {destacados.length > 0 && (
                <div className="flex flex-col gap-4 sm:gap-6">
                    <h2 className={titulo}>Featured</h2>
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
                        {destacados.map((t) => (
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
                </div>
            )}

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
