// El catalogo de FOG. Lo que se entrega solo (el roll del Forge) tiene boton
// de canje; las keys y el Summon shard se abren con una ruleta (Ruleta.tsx),
// con sus premios y probabilidades a la vista; el resto se muestra con su
// precio hasta que se pueda.
import { useState } from 'react';
import { card, tituloCard, botonClaro } from '@/components/forge/estilos';
import {
    canjear,
    colorRareza,
    fog,
    iconoPremio,
    imagenPremio,
    leerRuleta,
    ICONO_FOG_CHICO,
    type Ganado,
    type Premio,
    type Ruleta as DatosRuleta,
} from '@/lib/staking';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import Mensaje, { type Aviso } from './Mensaje';
import Ruleta from './Ruleta';
import CompraEntregada from './CompraEntregada';

// A donde se usa cada premio despues de canjearlo.
const DESTINOS: Record<string, { texto: string; href: string }> = {
    'forge-roll': { texto: 'Go to the Forge', href: '/forge/select' },
};

const ESTADOS: Record<Ganado['status'], { texto: string; clase: string }> = {
    credited: { texto: 'Added', clase: 'bg-green-400/15 text-green-300' },
    pending: { texto: 'On its way', clase: 'bg-yellow/15 text-yellow' },
    sent: { texto: 'Sent', clase: 'bg-lightblue/15 text-lightblue' },
};

export default function Tienda({
    compacto = false,
    catalogo,
    saldo,
    token,
    ganados = [],
    alCanjear,
}: {
    // En el panel lateral del mapa: una sola columna.
    compacto?: boolean;
    catalogo: Premio[];
    saldo: number | null;
    token: string | null;
    // Lo que gano la wallet en las ruletas.
    ganados?: Ganado[];
    alCanjear: () => void;
}) {
    const [canjeando, setCanjeando] = useState<string | null>(null);
    const [aviso, setAviso] = useState<(Aviso & { item?: string }) | null>(null);
    // La ruleta abierta: la key comprada y lo que toco.
    const [abierta, setAbierta] = useState<{ premio: Premio; ganado: Ganado } | null>(null);
    // Un premio que se entrega a mano (APE): el popup que lo explica.
    const [entregado, setEntregado] = useState<Premio | null>(null);
    // Los premios de la ruleta que se esta mirando ("Prizes").
    const [viendo, setViendo] = useState<{ id: string; ruleta: DatosRuleta | null } | null>(null);

    const pedir = async (premio: Premio) => {
        if (!token) return;
        setCanjeando(premio.id);
        setAviso(null);
        try {
            const r = await canjear(token, premio.id);
            if (r.win) setAbierta({ premio, ganado: r.win });
            else if (r.delivery) setEntregado(premio);
            else setAviso({ ok: true, texto: `${premio.label} redeemed.`, item: premio.id });
            alCanjear();
        } catch (err) {
            setAviso({
                ok: false,
                texto: err instanceof Error ? err.message : "Couldn't redeem it.",
            });
        }
        setCanjeando(null);
    };

    const verPremios = (id: string) => {
        if (viendo?.id === id) return setViendo(null);
        setViendo({ id, ruleta: null });
        leerRuleta(id)
            .then((ruleta) => setViendo((v) => (v?.id === id ? { id, ruleta } : v)))
            .catch(() => setViendo(null));
    };

    const destino = aviso?.ok && aviso.item ? DESTINOS[aviso.item] : null;

    return (
        <section className="flex flex-col gap-4">
            <div>
                <h2 className={tituloCard}>Spend your FOG</h2>
                {aviso && (
                    <div className="flex flex-wrap items-center gap-x-3 mt-1">
                        <Mensaje ok={aviso.ok} texto={aviso.texto} />
                        {destino && (
                            <a
                                href={destino.href}
                                className="text-lightblue hover:text-yellow text-sm underline underline-offset-4 transition-all duration-300"
                            >
                                {destino.texto}
                            </a>
                        )}
                    </div>
                )}
            </div>
            <div
                className={
                    compacto
                        ? 'flex flex-col gap-2'
                        : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'
                }
            >
                {catalogo.map((premio) => {
                    const alcanza = saldo !== null && saldo >= premio.price;
                    const icono = iconoPremio(premio);
                    return (
                        <div
                            key={premio.id}
                            className={`${compacto ? 'bg-blue/40 rounded-xl p-3' : card} flex flex-col gap-2`}
                        >
                            <div className="flex items-center gap-3">
                                {icono && (
                                    <img
                                        src={icono}
                                        alt=""
                                        loading="lazy"
                                        className={`${compacto ? 'size-14' : 'size-20'} shrink-0 object-contain drop-shadow-lg`}
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="font-accent uppercase text-yellow text-lg leading-tight">
                                        {premio.label}
                                    </div>
                                    {premio.description && (
                                        <div className="text-lightblue/70 text-sm">
                                            {premio.description}
                                        </div>
                                    )}
                                    <div className="text-lightblue text-sm mt-1 flex flex-wrap items-center gap-x-3">
                                        <span className="inline-flex items-center gap-1">
                                            <img src={ICONO_FOG_CHICO} alt="" className="size-4" />
                                            {fog(premio.price)} FOG
                                        </span>
                                        {premio.redeemable && typeof premio.stock === 'number' && (
                                            <span className="text-xs text-yellow/80">
                                                {premio.stock} left
                                            </span>
                                        )}
                                        {premio.wheel && premio.redeemable && (
                                            <button
                                                onClick={() => verPremios(premio.id)}
                                                aria-expanded={viendo?.id === premio.id}
                                                className="text-xs text-lightblue/80 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                                            >
                                                {viendo?.id === premio.id ? 'Hide prizes' : 'Prizes'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {premio.redeemable ? (
                                    <button
                                        onClick={() => pedir(premio)}
                                        disabled={!token || !alcanza || canjeando !== null}
                                        title={
                                            !token
                                                ? 'Verify your wallet first'
                                                : !alcanza
                                                  ? 'Not enough FOG'
                                                  : undefined
                                        }
                                        className={`shrink-0 text-sm ${botonClaro}`}
                                    >
                                        {canjeando === premio.id
                                            ? premio.wheel
                                                ? 'Buying...'
                                                : 'Redeeming...'
                                            : premio.wheel
                                              ? 'Buy'
                                              : 'Redeem'}
                                    </button>
                                ) : (
                                    <span
                                        className={`shrink-0 text-xs uppercase tracking-wide ${premio.status === 'sold-out' ? 'text-red-300/80' : 'text-lightblue/50'}`}
                                    >
                                        {premio.status === 'sold-out' ? 'Sold out' : 'Soon'}
                                    </span>
                                )}
                            </div>
                            {viendo?.id === premio.id && (
                                <ListaPremios ruleta={viendo.ruleta} catalogo={catalogo} />
                            )}
                        </div>
                    );
                })}
            </div>

            {ganados.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="font-accent uppercase text-yellow text-xl leading-none">
                        Your prizes
                    </h3>
                    {ganados.map((g) => {
                        const imagen = imagenPremio(g.prize, catalogo);
                        const estado = ESTADOS[g.status];
                        return (
                            <div key={g.id} className="flex items-center gap-3 text-sm">
                                <div
                                    className="size-10 shrink-0 rounded-lg bg-blue/60 grid place-items-center overflow-hidden border-2"
                                    style={{ borderColor: colorRareza(g.chance) }}
                                >
                                    {imagen ? (
                                        <img src={imagen} alt="" className="w-full h-full object-contain" />
                                    ) : (
                                        <span className="font-accent text-yellow text-[10px] uppercase">
                                            NFT
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 leading-tight">
                                    <div className="text-lightblue truncate">{g.prize.label}</div>
                                    <div className="text-lightblue/50 text-xs">
                                        {new Date(g.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        {/* El hash del envio, si el admin lo cargo: prueba de que llego. */}
                                        {g.status === 'sent' && g.note && /^0x[0-9a-fA-F]{64}$/.test(g.note) && (
                                            <>
                                                {' · '}
                                                <a
                                                    href={`${APECHAIN.explorador}/tx/${g.note}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-lightblue/80 hover:text-yellow underline underline-offset-2 transition-all duration-300"
                                                >
                                                    View transaction
                                                </a>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <span className={`shrink-0 rounded-md px-2 text-xs uppercase ${estado.clase}`}>
                                    {estado.texto}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {entregado && (
                <CompraEntregada premio={entregado} onCerrar={() => setEntregado(null)} />
            )}

            {abierta && (
                <Ruleta
                    premio={abierta.premio}
                    ganado={abierta.ganado}
                    onCerrar={() => setAbierta(null)}
                />
            )}
        </section>
    );
}

// Los premios de una ruleta con su probabilidad, para elegir con datos.
function ListaPremios({ ruleta, catalogo }: { ruleta: DatosRuleta | null; catalogo: Premio[] }) {
    if (!ruleta) return <div className="text-lightblue/60 text-xs">Loading prizes...</div>;
    return (
        <div className="grid grid-cols-3 gap-1.5">
            {ruleta.prizes.map((p) => {
                const imagen = imagenPremio(p, catalogo);
                const color = colorRareza(p.chance);
                return (
                    <div
                        key={p.id}
                        className="rounded-lg bg-darkblue/60 border-2 overflow-hidden flex flex-col"
                        style={{ borderColor: color }}
                        title={p.label}
                    >
                        <div className="aspect-square grid place-items-center">
                            {p.kind === 'fog' || p.kind === 'ape' ? (
                                <span className="relative w-full h-full grid place-items-center">
                                    <img src={imagen!} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-contain p-1" />
                                    <span className="relative font-accent text-yellow text-sm [text-shadow:0_1px_0_#090050,0_0_6px_#090050]">
                                        {fog(p.amount ?? 0)}
                                    </span>
                                </span>
                            ) : imagen ? (
                                <img src={imagen} alt="" loading="lazy" className="w-full h-full object-contain" />
                            ) : (
                                // Un NFT al que todavia no le subieron imagen.
                                <span className="font-accent uppercase text-lightblue text-sm">NFT</span>
                            )}
                        </div>
                        <div className="px-1 py-0.5 text-[10px] leading-tight text-lightblue truncate">
                            {p.label}
                        </div>
                        <div className="px-1 pb-1 text-[10px] font-semibold" style={{ color }}>
                            {(p.chance * 100).toLocaleString('en-US', { maximumFractionDigits: p.chance < 0.01 ? 2 : 1 })}%
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
