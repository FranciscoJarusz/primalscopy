import { useEffect, useState, type ReactNode } from 'react';
import { BACKEND_URL } from '@/lib/backend';
import { fog, miniaturaPrimal } from '@/lib/staking';
import CartaPrimal from '@/components/shared/CartaPrimal';
import { imagenRaffle } from '@/lib/raffles';
import { walletCorta } from '@/lib/nicknames';
import { ZONAS } from '@/lib/zonas';
import { hace, reloj } from '@/lib/tiempo';
import Dato from '@/components/shared/Dato';

type Rareza = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'chosen';
type Persona = { wallet: string | null; nickname: string | null };

type Datos = {
    packs: {
        status: 'upcoming' | 'open' | 'ended';
        endsAt: string | null;
        players: number;
        today: number;
        top: (Persona & { rank: number; points: number })[];
        goal: {
            title: string;
            reward: string;
            target: number;
            daily: boolean;
            progress: number;
            from: string;
            to: string | null;
            status: 'running' | 'reached' | 'missed';
        } | null;
        pulls: (Persona & { at: string; pull: string; card: { id: number; name: string; rarity: Rareza } })[];
    };
    raffle:
        | { state: 'open'; id: string; title: string; image: string | null; endsAt: string | null; participants: number; prizes: string[] }
        | { state: 'drawn'; id: string; title: string; image: string | null; drawnAt: string; participants: number; winners: (Persona & { prize: string })[] }
        | null;
    staking: { staking: number; earned: number; collectionSize: number };
    activity: (Persona & { at: string; kind: 'forge' | 'customize' | 'stake'; tokenId: string; days?: number })[];
};

const boton =
    'w-fit bg-yellow text-darkblue font-accent uppercase px-6 pt-2 pb-3.5 rounded-[10px] hover:scale-102 active:scale-97 transition-all duration-300';
const tarjeta =
    'flex flex-col gap-5 rounded-2xl sm:rounded-[30px] bg-darkblue p-6 sm:p-8 shadow-lg shadow-darkblue/50 min-w-0';
const titulo = 'font-accent uppercase text-yellow text-3xl sm:text-4xl';

const COLOR_RAREZA: Record<Rareza, string> = {
    common: 'text-lightblue',
    uncommon: 'text-lightblue',
    rare: 'text-lightblue',
    epic: 'text-mw-champagne',
    legendary: 'text-yellow',
    chosen: 'text-yellow',
};

const nombre = (p: Persona) => p.nickname ?? (p.wallet ? walletCorta(p.wallet) : 'Someone');
const imagenCarta = (id: number) => `/packs/cards/sm/MW${String(id).padStart(2, '0')}.webp`;

function useAhora(activo: boolean) {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        if (!activo) return;
        const t = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(t);
    }, [activo]);
    return ahora;
}

export default function EnVivo() {
    const [datos, setDatos] = useState<Datos | null>(null);

    useEffect(() => {
        let vivo = true;
        const cargar = async () => {
            try {
                const r = await fetch(`${BACKEND_URL}/live`);
                if (r.ok && vivo) setDatos(await r.json());
            } catch {}
        };
        cargar();
        const t = setInterval(cargar, 60_000);
        return () => {
            vivo = false;
            clearInterval(t);
        };
    }, []);

    const contando = datos?.raffle?.state === 'open' && Boolean(datos.raffle.endsAt);
    const ahora = useAhora(contando || Boolean(datos?.packs.goal?.to));

    if (!datos) return null;

    const tarjetas: ReactNode[] = [];
    if (datos.packs.status !== 'upcoming') tarjetas.push(<Mudwater key="packs" packs={datos.packs} ahora={ahora} />);
    if (datos.raffle) tarjetas.push(<Sorteo key="raffle" raffle={datos.raffle} ahora={ahora} />);
    tarjetas.push(<Staking key="staking" staking={datos.staking} />);

    return (
        <section id="live" className="scroll-mt-24 sm:scroll-mt-32 flex flex-col gap-4 sm:gap-7" aria-labelledby="live-titulo">
            <h2
                data-anim="reveal"
                id="live-titulo"
                className="rounded-2xl sm:rounded-[30px] bg-yellow pt-1 pb-5 sm:pt-2 sm:pb-7 xl:pb-9 text-center font-accent text-[7.5vw] sm:text-6xl xl:text-7xl uppercase text-darkblue shadow-lg shadow-darkblue/50"
            >
                Live in the Cult
            </h2>

            {datos.packs.goal && datos.packs.status !== 'upcoming' && <Meta meta={datos.packs.goal} ahora={ahora} />}

            <div
                data-anim-stagger
                className={`grid grid-cols-1 gap-4 sm:gap-7 ${tarjetas.length === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2'}`}
            >
                {tarjetas}
            </div>

            {datos.activity.length > 0 && <Actividad items={datos.activity} />}
        </section>
    );
}

function Meta({ meta, ahora }: { meta: NonNullable<Datos['packs']['goal']>; ahora: number }) {
    const porcentaje = Math.min(100, (meta.progress / meta.target) * 100);
    const cierre = meta.to ? Date.parse(meta.to) - ahora : null;
    const estado = meta.daily
        ? `${meta.status === 'reached' ? 'Goal reached! · ' : ''}${cierre !== null && cierre > 0 ? `Resets in ${reloj(cierre)}` : 'Resetting...'}`
        : meta.status === 'reached'
            ? 'Goal reached!'
            : meta.status === 'missed'
              ? 'Goal ended'
              : cierre !== null
                ? `Ends in ${reloj(cierre)}`
                : null;

    return (
        <div data-anim="reveal" className={tarjeta}>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="flex flex-col gap-2 min-w-0">
                    <span className="text-sm sm:text-base font-bold uppercase text-lightblue/70">Community goal</span>
                    <h3 className={titulo}>{meta.title || `Open ${fog(meta.target)} packs${meta.daily ? ' today' : ''}`}</h3>
                    <p className="text-base sm:text-lg text-lightblue">Unlocks: {meta.reward}</p>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-1">
                    <span className="font-accent text-yellow text-3xl sm:text-4xl leading-none pb-1">
                        {fog(meta.progress)} / {fog(meta.target)}
                    </span>
                    {estado && <span className="text-sm sm:text-base font-bold uppercase text-lightblue/70">{estado}</span>}
                </div>
            </div>
            <div
                className="h-4 sm:h-5 rounded-full bg-lightblue/10 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={meta.target}
                aria-valuenow={meta.progress}
            >
                <div className="h-full rounded-full bg-yellow transition-all duration-300" style={{ width: `${porcentaje}%` }} />
            </div>
        </div>
    );
}

function Mudwater({ packs, ahora }: { packs: Datos['packs']; ahora: number }) {
    const ultimo = packs.pulls[0];
    const abierto = packs.status === 'open';
    return (
        <article className={tarjeta}>
            <div className="flex items-start justify-between gap-3">
                <h3 className={titulo}>Mudwater</h3>
                <span className="mt-2 shrink-0 rounded-[10px] bg-lightblue/10 px-3 py-1 text-xs font-bold uppercase text-lightblue">
                    {abierto ? 'Open' : 'Ended'}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Dato label="Players" valor={fog(packs.players)} />
                <Dato label="Packs today" valor={fog(packs.today)} />
            </div>
            {packs.top.length > 0 && (
                <ol className="flex flex-col gap-2">
                    {packs.top.map((f) => (
                        <li key={f.rank} className="flex items-center gap-3 text-lightblue">
                            <span className="font-accent text-yellow text-xl w-7 shrink-0 pb-1">#{f.rank}</span>
                            <span className="flex-1 min-w-0 truncate">{nombre(f)}</span>
                            <span className="shrink-0 text-sm font-bold">{fog(f.points)} pts</span>
                        </li>
                    ))}
                </ol>
            )}
            {ultimo && (
                <a
                    href={`/mudwater/pull/${ultimo.pull}`}
                    className="flex items-center gap-3 rounded-xl sm:rounded-2xl bg-lightblue/5 border border-lightblue/10 p-2.5 hover:border-yellow/60 transition-all duration-300"
                >
                    <img src={imagenCarta(ultimo.card.id)} alt="" loading="lazy" className="w-11 aspect-1000/1388 rounded-md object-cover shrink-0" />
                    <span className="min-w-0 text-sm text-lightblue leading-snug">
                        <span className="font-bold">{nombre(ultimo)}</span> pulled{' '}
                        <span className={`font-bold ${COLOR_RAREZA[ultimo.card.rarity]}`}>{ultimo.card.name}</span>
                        <span className="block text-lightblue/50">{hace(ultimo.at, ahora)}</span>
                    </span>
                </a>
            )}
            <a href="/mudwater" className={`${boton} mt-auto`}>
                {abierto ? 'Rip packs' : 'See leaderboard'}
            </a>
        </article>
    );
}

function Sorteo({ raffle, ahora }: { raffle: NonNullable<Datos['raffle']>; ahora: number }) {
    const abierto = raffle.state === 'open';
    const detalle = abierto
        ? raffle.endsAt
            ? `Ends in ${reloj(Date.parse(raffle.endsAt) - ahora)}`
            : 'Open now'
        : raffle.winners.length
          ? `Won by ${raffle.winners.map(nombre).join(', ')}`
          : 'Nobody entered';
    return (
        <article className={tarjeta}>
            <div className="flex items-start justify-between gap-3">
                <h3 className={titulo}>{abierto ? 'Raffle' : 'Last raffle'}</h3>
                <span className="mt-2 shrink-0 rounded-[10px] bg-lightblue/10 px-3 py-1 text-xs font-bold uppercase text-lightblue">
                    {abierto ? 'Open' : 'Drawn'}
                </span>
            </div>
            <div className="relative aspect-2/1 rounded-xl sm:rounded-2xl overflow-hidden bg-[radial-gradient(circle_at_50%_42%,#1b1596,#090050_75%)]">
                {raffle.image && (
                    <img src={imagenRaffle(raffle.image)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                )}
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
                <p className="font-accent uppercase text-white text-xl sm:text-2xl leading-none pb-1.5 wrap-break-word">{raffle.title}</p>
                <p className="text-lightblue truncate">{detalle}</p>
                <p className="text-sm text-lightblue/70">
                    {fog(raffle.participants)} {raffle.participants === 1 ? 'player' : 'players'}
                </p>
            </div>
            <a href={`/raffles/${raffle.id}`} className={`${boton} mt-auto`}>
                {abierto ? 'Enter raffle' : 'See raffles'}
            </a>
        </article>
    );
}

function Staking({ staking }: { staking: Datos['staking'] }) {
    const parte = staking.collectionSize ? Math.round((staking.staking / staking.collectionSize) * 100) : null;
    return (
        <article className={tarjeta}>
            <h3 className={titulo}>Staking</h3>
            <div className="grid grid-cols-1 gap-3">
                <Dato label={parte !== null ? `Primals staking · ${parte}%` : 'Primals staking'} valor={fog(staking.staking)} />
                <Dato label="FOG earned" valor={fog(staking.earned)} />
            </div>
            <p className="text-base sm:text-lg text-lightblue">Stake your Primals and earn FOG every day. No gas.</p>
            <a href="/staking" className={`${boton} mt-auto`}>
                Start staking
            </a>
        </article>
    );
}

const ACCION: Record<Datos['activity'][number]['kind'], string> = {
    forge: 'forged',
    customize: 'customized',
    stake: 'staked',
};

function Actividad({ items }: { items: Datos['activity'] }) {
    return (
        <div className="flex flex-col gap-5 min-w-0">
            <h3 className={titulo}>Latest in the Cult</h3>
            <ul data-anim-stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                {items.map((a, i) => {
                    const zona = a.kind === 'stake' ? ZONAS.find((z) => z.days === a.days) : null;
                    return (
                        <li key={`${a.kind}-${a.tokenId}-${a.at}`} className={i >= 4 ? 'max-sm:hidden' : undefined}>
                            <CartaPrimal
                                tokenId={a.tokenId}
                                href={`/explore/${a.tokenId}`}
                                estatica={miniaturaPrimal(a.tokenId, 512)}
                                alt={`Primal #${a.tokenId}`}
                                className="h-full items-stretch!"
                            >
                                <span className="px-1 text-sm text-lightblue leading-snug min-w-0">
                                    <span className="font-bold block truncate">{nombre(a)}</span>
                                    {ACCION[a.kind]}
                                    {zona ? ` in ${zona.nombre}` : ''}
                                    <span className="block text-lightblue/50">{hace(a.at)}</span>
                                </span>
                            </CartaPrimal>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
