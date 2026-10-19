import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import {
    colorRareza,
    fog,
    iconoPremio,
    imagenPremio,
    leerRuleta,
    tarjetaPremio,
    type Ganado,
    type Premio,
    type PremioRuleta,
} from '@/lib/staking';

const ANCHO = 120; // ancho de cada carta, en px
const PASO = ANCHO + 10; // carta + espacio
const CARTAS = 56;
const GANADORA = 48; // la que frena entre las flechas
const DURACION = 6500;
// Despues de frenar, cuanto se luce la carta en la cinta antes de pasar a la
// carta grande.
const PAUSA = 900;
const CLAVE_SONIDO = 'primal_ruleta_sonido';

// Lo que no se puede escribir con clases: rayos, confeti y el rebote de las
// flechas. Como en Mapa.tsx, va en un <style> del componente.
const CSS = `
@keyframes ruleta-rayos { to { rotate: 360deg } }
@keyframes ruleta-pop { 0% { scale: .4; opacity: 0 } 60% { scale: 1.12; opacity: 1 } 100% { scale: 1 } }
@keyframes ruleta-confeti {
  0% { translate: 0 0; rotate: 0deg; opacity: 1 }
  100% { translate: var(--dx) var(--dy); rotate: var(--giro); opacity: 0 }
}
@keyframes ruleta-tic { 0% { scale: 1 } 40% { scale: 1.35 } 100% { scale: 1 } }
@keyframes ruleta-latido { 0%, 100% { scale: 1.06 } 50% { scale: 1.12 } }
.ruleta-rayos { animation: ruleta-rayos 14s linear infinite }
.ruleta-pop { animation: ruleta-pop .6s cubic-bezier(.2,.9,.3,1.3) both }
.ruleta-confeti { animation: ruleta-confeti 1.4s cubic-bezier(.15,.7,.35,1) both }
.ruleta-tic { animation: ruleta-tic .15s ease-out }
.ruleta-latido { animation: ruleta-latido .45s ease-in-out 2 }
@media (prefers-reduced-motion: reduce) {
  .ruleta-rayos, .ruleta-latido { animation: none }
  .ruleta-confeti { display: none }
}
`;

type Etapa = 'comprado' | 'girando' | 'listo';

export default function Ruleta({
    premio,
    ganado,
    onCerrar,
    titulo = 'Purchase complete!',
}: {
    // La key: alcanza con su nombre e icono (puede venir de un codigo).
    premio: Pick<Premio, 'id' | 'label' | 'icon'>;
    ganado: Ganado;
    onCerrar: () => void;
    // Lo que dice el primer paso: la compra o el codigo canjeado.
    titulo?: string;
}) {
    const [etapa, setEtapa] = useState<Etapa>('comprado');
    const [pozo, setPozo] = useState<PremioRuleta[] | null>(null);
    const [sonido, setSonido] = useState(() => {
        try {
            return localStorage.getItem(CLAVE_SONIDO) !== 'no';
        } catch {
            return true;
        }
    });
    const cerrar = useRef(onCerrar);
    cerrar.current = onCerrar;

    // Los premios para rellenar la cinta. Se precargan sus imagenes mientras
    // se muestra "Purchase complete": si no, la cinta arranca con huecos.
    useEffect(() => {
        leerRuleta(premio.id)
            .then((r) => {
                for (const p of [...r.prizes, ganado.prize]) {
                    const src = imagenPremio(p);
                    if (src) new Image().src = src;
                }
                setPozo(r.prizes);
            })
            .catch(() => setPozo([]));
    }, [premio.id, ganado.prize]);

    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && etapa !== 'girando') cerrar.current();
        };
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, [etapa]);

    const alternarSonido = () =>
        setSonido((s) => {
            try {
                localStorage.setItem(CLAVE_SONIDO, s ? 'no' : 'si');
            } catch {
                // Sin almacenamiento: vale solo por esta vez.
            }
            return !s;
        });

    const icono = iconoPremio(premio);
    const premioGanado = useMemo(
        () => ({ ...ganado.prize, chance: ganado.chance }),
        [ganado]
    );

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => etapa !== 'girando' && onCerrar()}
        >
            <style>{CSS}</style>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Open ${premio.label}`}
                onClick={(e) => e.stopPropagation()}
                className={`relative w-full ${etapa === 'comprado' ? 'max-w-md' : 'max-w-3xl'} bg-darkblue rounded-2xl p-5 sm:p-6 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col items-center gap-4 text-center overflow-hidden`}
            >
                {etapa !== 'comprado' && (
                    <button
                        type="button"
                        onClick={alternarSonido}
                        aria-label={sonido ? 'Mute' : 'Unmute'}
                        title={sonido ? 'Mute' : 'Unmute'}
                        className="absolute top-3.5 left-4 z-10 text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300"
                    >
                        {sonido ? <FiVolume2 className="size-5" /> : <FiVolumeX className="size-5" />}
                    </button>
                )}
                {etapa !== 'girando' && (
                    <button
                        type="button"
                        onClick={onCerrar}
                        aria-label="Close"
                        className="absolute top-3 right-4 z-10 text-lightblue/60 hover:text-yellow text-2xl leading-none cursor-pointer transition-all duration-300"
                    >
                        ×
                    </button>
                )}

                {etapa === 'comprado' && (
                    <>
                        <h2 className="font-accent uppercase text-yellow text-3xl sm:text-4xl">
                            {titulo}
                        </h2>
                        <p className="text-lightblue text-base sm:text-lg -mt-2">
                            You got a {premio.label}.
                        </p>
                        {icono && (
                            <img
                                src={icono}
                                alt=""
                                className="size-40 object-contain drop-shadow-xl animate-aparece"
                            />
                        )}
                        <button
                            onClick={() => setEtapa('girando')}
                            disabled={!pozo}
                            className="bg-yellow text-darkblue font-accent uppercase text-lg leading-normal! rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-50"
                        >
                            Open {premio.label}
                        </button>
                    </>
                )}

                {etapa === 'girando' && (
                    <>
                        <h2 className="font-accent uppercase text-yellow text-3xl sm:text-4xl">
                            Opening {premio.label}...
                        </h2>
                        <Cinta
                            pozo={pozo ?? []}
                            ganado={premioGanado}
                            sonido={sonido}
                            alTerminar={() => setEtapa('listo')}
                        />
                    </>
                )}

                {etapa === 'listo' && (
                    <Revelacion
                        premio={premioGanado}
                        ganado={ganado}
                        llave={premio.label}
                        sonido={sonido}
                        onCerrar={onCerrar}
                    />
                )}
            </div>
        </div>,
        document.body
    );
}

// Un "tic" corto, como el de una rueda que pasa por cada clavo. Sin archivos:
// un pulso de Web Audio que baja de tono.
function crearTic() {
    let ctx: AudioContext | null = null;
    return (fuerte = false) => {
        try {
            ctx ??= new AudioContext();
            const osc = ctx.createOscillator();
            const vol = ctx.createGain();
            const t = ctx.currentTime;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(fuerte ? 880 : 1400, t);
            osc.frequency.exponentialRampToValueAtTime(fuerte ? 440 : 700, t + 0.05);
            vol.gain.setValueAtTime(fuerte ? 0.25 : 0.08, t);
            vol.gain.exponentialRampToValueAtTime(0.001, t + (fuerte ? 0.3 : 0.06));
            osc.connect(vol).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + (fuerte ? 0.3 : 0.07));
        } catch {
            // Sin audio en este navegador: la animacion sigue igual.
        }
    };
}

// La cinta: cartas al azar (con el peso de cada premio, solo para que se vea
// parejo) y la que toco en la posicion GANADORA. Corre con Web Animations: se
// pasa un poco de la carta y vuelve, como una rueda de verdad.
function Cinta({
    pozo,
    ganado,
    sonido,
    alTerminar,
}: {
    pozo: PremioRuleta[];
    ganado: PremioRuleta;
    sonido: boolean;
    alTerminar: () => void;
}) {
    const tira = useRef<HTMLDivElement>(null);
    const flechas = useRef<HTMLDivElement>(null);
    const conSonido = useRef(sonido);
    conSonido.current = sonido;
    const terminar = useRef(alTerminar);
    terminar.current = alTerminar;
    const [frenado, setFrenado] = useState(false);

    const cartas = useMemo(() => {
        const premios = pozo.length ? pozo : [ganado];
        const total = premios.reduce((n, p) => n + (p.chance ?? 1), 0);
        const azar = () => {
            let r = Math.random() * total;
            for (const p of premios) {
                r -= p.chance ?? 1;
                if (r <= 0) return p;
            }
            return premios[premios.length - 1];
        };
        return Array.from({ length: CARTAS }, (_, i) => (i === GANADORA ? ganado : azar()));
    }, [pozo, ganado]);

    useLayoutEffect(() => {
        const el = tira.current;
        if (!el) return;
        const calma = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Frena con la carta justo entre las flechas. Antes se pasa un poco (lo
        // que cambia de una vez a otra) y vuelve. La tira arranca en el centro
        // de la caja (margin-left 50%), igual que las flechas: el destino no
        // depende del ancho.
        const destino = GANADORA * PASO + ANCHO / 2;
        const pasada = calma ? 0 : 14 + Math.random() * 26;
        const anim = el.animate(
            [
                { transform: 'translateX(0)', easing: 'cubic-bezier(0.12, 0.6, 0.08, 1)' },
                { transform: `translateX(${-(destino + pasada)}px)`, offset: 0.9, easing: 'ease-in-out' },
                { transform: `translateX(${-destino}px)` },
            ],
            { duration: calma ? 1200 : DURACION, fill: 'forwards' }
        );

        // Un tic cada vez que una carta nueva pasa por las flechas.
        const tic = crearTic();
        let anterior = -1;
        let raf = 0;
        const mirar = () => {
            const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
            const carta = Math.floor((-m.m41 + ANCHO / 2) / PASO);
            if (carta !== anterior) {
                anterior = carta;
                if (conSonido.current) tic();
                const f = flechas.current;
                if (f) {
                    f.classList.remove('ruleta-tic');
                    void f.offsetWidth;
                    f.classList.add('ruleta-tic');
                }
            }
            raf = requestAnimationFrame(mirar);
        };
        raf = requestAnimationFrame(mirar);

        let pausa = 0;
        anim.finished
            .then(() => {
                cancelAnimationFrame(raf);
                if (conSonido.current) tic(true);
                setFrenado(true);
                pausa = window.setTimeout(() => terminar.current(), PAUSA);
            })
            .catch(() => {});
        return () => {
            anim.cancel();
            cancelAnimationFrame(raf);
            clearTimeout(pausa);
        };
    }, [cartas]);

    return (
        // py-8: aire para que la carta ganadora crezca sin que se corte.
        <div
            className="relative w-full overflow-hidden py-8"
            style={{
                maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
            }}
        >
            <div ref={tira} className="relative ml-[50%] flex gap-2.5 will-change-transform">
                {cartas.map((p, i) => (
                    <Carta
                        key={i}
                        premio={p}
                        estado={frenado ? (i === GANADORA ? 'ganadora' : 'apagada') : 'normal'}
                    />
                ))}
            </div>
            <div
                ref={flechas}
                className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col justify-between items-center py-1"
            >
                <Flecha />
                <Flecha abajo />
            </div>
        </div>
    );
}

function Flecha({ abajo = false }: { abajo?: boolean }) {
    return (
        <svg
            viewBox="0 0 24 16"
            className={`w-6 h-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] ${abajo ? 'rotate-180' : ''}`}
        >
            <path d="M2 1h20L12 15z" fill="#fdf468" stroke="#090050" strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}

// Una carta: fondo con el color de su rareza, de arriba hacia abajo, y la
// franja de abajo con el nombre. Sin sombras hacia afuera (la caja las corta).
function Carta({
    premio,
    estado,
    grande = false,
}: {
    premio: PremioRuleta;
    estado: 'normal' | 'ganadora' | 'apagada';
    grande?: boolean;
}) {
    const color = colorRareza(premio.chance ?? 1);
    const imagen = imagenPremio(premio);
    return (
        <div
            className={`shrink-0 rounded-xl overflow-hidden flex flex-col transition-all duration-300 ${
                estado === 'ganadora' ? 'ruleta-latido' : estado === 'apagada' ? 'opacity-30 scale-95' : ''
            }`}
            style={{
                width: grande ? 200 : ANCHO,
                // Opaca: con transparencia se veian los rayos de atras por
                // encima de la carta.
                background: `linear-gradient(to bottom, transparent 35%, ${color}40), #0b0a4a`,
                border: `2px solid ${color}`,
            }}
        >
            <div className="aspect-square grid place-items-center p-1.5">
                {premio.kind === 'fog' || premio.kind === 'ape' ? (
                    <div className="relative w-full h-full grid place-items-center">
                        <img src={imagen!} alt="" className="absolute inset-0 w-full h-full object-contain p-1" draggable={false} />
                        <span
                            className={`relative font-accent text-yellow ${grande ? 'text-5xl' : 'text-2xl'} [text-shadow:0_2px_0_#090050,0_0_10px_#090050]`}
                        >
                            {fog(premio.amount ?? 0)}
                        </span>
                    </div>
                ) : imagen ? (
                    <img src={imagen} alt="" className="w-full h-full object-contain rounded-lg" draggable={false} />
                ) : (
                    // Un NFT al que todavia no le subieron imagen.
                    <span className={`font-accent uppercase text-lightblue ${grande ? 'text-3xl' : 'text-xl'}`}>
                        NFT
                    </span>
                )}
            </div>
            <div
                className={`leading-tight px-1.5 truncate font-semibold text-darkblue ${grande ? 'text-sm py-1.5' : 'text-[11px] py-1'}`}
                style={{ background: color }}
            >
                {premio.label}
            </div>
        </div>
    );
}

// El sonido del premio: notas que suben, mas cuanto mas raro (gris 1, azul 2,
// violeta 3, dorado 4 y un brillo al final).
function sonarPremio(chance: number) {
    try {
        const ctx = new AudioContext();
        const notas = chance >= 0.25 ? 1 : chance >= 0.08 ? 2 : chance >= 0.02 ? 3 : 4;
        const escala = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        for (let n = 0; n <= notas; n++) {
            if (n === notas && notas < 4) break;
            const t = ctx.currentTime + n * 0.11;
            const osc = ctx.createOscillator();
            const vol = ctx.createGain();
            osc.type = n === 4 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(escala[n], t);
            vol.gain.setValueAtTime(0.0001, t);
            vol.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
            vol.gain.exponentialRampToValueAtTime(0.0001, t + (n === notas - 1 || n === 4 ? 0.7 : 0.25));
            osc.connect(vol).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.8);
        }
        setTimeout(() => ctx.close(), 1500);
    } catch {
        // Sin audio: no pasa nada.
    }
}

// Para compartir solo lo que vale la pena: el consuelo de FOG no.
const vale = (p: PremioRuleta) => !(p.kind === 'fog' && (p.chance ?? 1) >= 0.2);

function Revelacion({
    premio,
    ganado,
    llave,
    sonido,
    onCerrar,
}: {
    premio: PremioRuleta;
    ganado: Ganado;
    // El nombre de la key que se abrio ("LOWKEY"), para el tweet.
    llave: string;
    sonido: boolean;
    onCerrar: () => void;
}) {
    const color = colorRareza(premio.chance ?? 1);

    useEffect(() => {
        if (sonido) sonarPremio(premio.chance ?? 1);
        // Suena una vez, al aparecer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // El link de X solo lleva texto y una URL: la URL es la pagina del premio
    // (pages/staking/win/[id].astro), y X arma con ella la tarjeta con la
    // imagen. En el celular se abre el menu de compartir del sistema con la
    // tarjeta adjunta de verdad; si no se puede, va el link.
    const texto = `I just won ${premio.label} opening a ${llave} in Primal Cult 🔥\n\nStake your Primals and earn FOG:`;
    const enlace = `${window.location.origin}/staking/win/${ganado.id}`;
    const tweet = new URL('https://x.com/intent/tweet');
    tweet.searchParams.set('text', texto);
    tweet.searchParams.set('url', enlace);

    const compartir = async (e: React.MouseEvent) => {
        if (!window.matchMedia('(pointer: coarse)').matches || !navigator.canShare) return;
        e.preventDefault();
        try {
            const blob = await fetch(tarjetaPremio(ganado.id)).then((r) => r.blob());
            const archivo = new File([blob], 'primal-cult-prize.png', { type: 'image/png' });
            if (navigator.canShare({ files: [archivo] })) {
                await navigator.share({ files: [archivo], text: `${texto} ${enlace}` });
                return;
            }
        } catch (err) {
            // Cerrar el menu de compartir no es un error.
            if (err instanceof DOMException && err.name === 'AbortError') return;
        }
        window.open(tweet.href, '_blank', 'noopener');
    };
    const confeti = useMemo(
        () =>
            Array.from({ length: 36 }, (_, i) => {
                const angulo = (i / 36) * Math.PI * 2 + Math.random() * 0.3;
                const lejos = 120 + Math.random() * 140;
                return {
                    dx: `${Math.cos(angulo) * lejos}px`,
                    dy: `${Math.sin(angulo) * lejos + 60}px`,
                    giro: `${Math.random() * 720 - 360}deg`,
                    color: i % 3 === 0 ? '#fdf468' : i % 3 === 1 ? color : '#dfe8ff',
                    demora: `${Math.random() * 0.15}s`,
                    ancho: 6 + Math.random() * 6,
                };
            }),
        [color]
    );

    return (
        <>
            <h2 className="ruleta-pop font-accent uppercase text-yellow text-4xl sm:text-5xl">You won!</h2>
            <div className="relative grid place-items-center py-4">
                {/* Rayos: un abanico conico que gira y se apaga hacia afuera. */}
                <div
                    className="ruleta-rayos pointer-events-none absolute size-105 rounded-full"
                    style={{
                        background: `repeating-conic-gradient(${color}55 0deg 10deg, transparent 10deg 24deg)`,
                        maskImage: 'radial-gradient(circle, black 20%, transparent 68%)',
                    }}
                />
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    {confeti.map((c, i) => (
                        <i
                            key={i}
                            className="ruleta-confeti absolute rounded-xs"
                            style={
                                {
                                    width: c.ancho,
                                    height: c.ancho * 0.45,
                                    background: c.color,
                                    animationDelay: c.demora,
                                    '--dx': c.dx,
                                    '--dy': c.dy,
                                    '--giro': c.giro,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>
                <div className="ruleta-pop relative">
                    <Carta premio={premio} estado="normal" grande />
                </div>
            </div>
            <div className="ruleta-pop flex flex-col items-center gap-3" style={{ animationDelay: '.25s' }}>
                <p className="text-lightblue text-sm max-w-md">
                    {ganado.status === 'credited'
                        ? `${premio.label} added to your FOG balance.`
                        : "It's yours! We'll send it to your wallet soon. You can follow it in the shop, under Your prizes."}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                    {vale(premio) && (
                        <a
                            href={tweet.href}
                            onClick={compartir}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-lightblue text-darkblue font-accent uppercase leading-normal! rounded-md px-5 pb-1.5 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300"
                        >
                            Share on X
                        </a>
                    )}
                    <button
                        onClick={onCerrar}
                        className="bg-yellow text-darkblue font-accent uppercase leading-normal! rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300"
                    >
                        Nice!
                    </button>
                </div>
            </div>
        </>
    );
}
