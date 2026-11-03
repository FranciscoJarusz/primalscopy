import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import { RAREZAS, type CartaPack } from '@/lib/packs';
import { Frente, PastillaCarta, TituloCarta } from './Carta';
import Resumen from './Resumen';
import { Escena3D, type Ranura, type Sonido } from './escena3d';
export { precalentar } from './texturas3d';
import {
    activarSonido,
    cargar as sonarCarga,
    despertar,
    fondo,
    sonar,
    sonarResumen,
    sonidoActivo,
} from './sonidos';

type Etapa = 'cargando' | 'pack' | 'abriendo' | 'revelando' | 'resumen';

const VIBRACION: Partial<Record<Sonido, number | number[]>> = {
    rasgar: 40,
    'impacto-rare': 15,
    'impacto-epic': 30,
    'impacto-legendary': [40, 40, 70],
    'impacto-chosen': [60, 50, 140],
};

const vibrar = (patron: number | number[]) => {
    try {
        navigator.vibrate?.(patron);
    } catch {}
};

const buena = (c: CartaPack) => RAREZAS[c.rareza].tier >= RAREZAS.rare.tier;

export default function Apertura3D({
    cartas,
    compartir,
    quedan,
    onFin,
}: {
    cartas: CartaPack[];
    compartir: string | null;
    quedan: number;
    onFin: (otro: boolean) => void;
}) {
    const [etapa, setEtapa] = useState<Etapa>('cargando');
    const [actual, setActual] = useState(0);
    const [volteada, setVolteada] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [sonido, setSonido] = useState(sonidoActivo);
    const etapaRef = useRef<Etapa>('cargando');
    const raiz = useRef<HTMLDivElement>(null);
    const ranuras = useRef<(HTMLDivElement | null)[]>([]);
    const arrastro = useRef(false);
    const pulso = useRef(0);
    const lienzo = useRef<HTMLDivElement>(null);
    const escena = useRef<Escena3D | null>(null);
    const destello = useRef<HTMLDivElement>(null);
    const barra = useRef<HTMLDivElement>(null);
    const info = useRef<HTMLDivElement>(null);
    const puntero = useRef<{
        x: number;
        y: number;
        x0: number;
        y0: number;
        movio: boolean;
    } | null>(null);
    const espera = useRef(0);
    const carga = useRef({ p: 0 });
    const cargaTween = useRef<gsap.core.Tween | null>(null);

    const pasar = (e: Etapa) => {
        etapaRef.current = e;
        setEtapa(e);
    };

    useEffect(() => {
        const html = document.documentElement;
        const antes = html.style.overflow;
        html.style.overflow = 'hidden';
        let e: Escena3D | null = null;
        const suave = matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
            e = new Escena3D(lienzo.current!, cartas, {
                destello: (opacidad, duracion) =>
                    gsap.fromTo(
                        destello.current,
                        { opacity: suave ? opacidad * 0.3 : opacidad },
                        { opacity: 0, duration: duracion, ease: 'power2.out' }
                    ),
                sonido: (nombre) => {
                    sonar(nombre);
                    const patron = VIBRACION[nombre];
                    if (patron) vibrar(patron);
                },
            });
            escena.current = e;
            if (import.meta.env.DEV)
                Object.assign(window, { __escena3d: e, __gsap: gsap });
            fondo(true);
            e.iniciar()
                .then(
                    (ok) =>
                        ok && etapaRef.current === 'cargando' && pasar('pack')
                )
                .catch(() => pasar('resumen'));
        } catch {
            pasar('resumen');
        }
        return () => {
            html.style.overflow = antes;
            clearTimeout(espera.current);
            cargaTween.current?.kill();
            sonarCarga(0);
            fondo(false);
            e?.destruir();
            escena.current = null;
        };
    }, []);

    useLayoutEffect(() => {
        gsap.set(info.current, { opacity: 0 });
    }, [actual]);

    const actualizarCarga = () => {
        escena.current?.cargar(carga.current.p);
        sonarCarga(carga.current.p);
        if (barra.current)
            barra.current.style.transform = `scaleX(${carga.current.p})`;
        const escalon = Math.min(3, Math.floor(carga.current.p * 4));
        if (escalon > pulso.current) vibrar(8 + escalon * 6);
        pulso.current = escalon;
    };

    const ranura = (j: number): Ranura => {
        const r = ranuras.current[j]!.getBoundingClientRect();
        const c = raiz.current!.getBoundingClientRect();
        return {
            x: r.left + r.width / 2 - c.left,
            y: r.top + r.height / 2 - c.top,
            alto: r.height,
        };
    };

    const abrir = async () => {
        pasar('abriendo');
        await escena.current?.abrir();
        if (etapaRef.current !== 'abriendo') return;
        pasar('revelando');
        llegar(0);
    };

    const llegar = (i: number) => {
        escena.current?.mostrarAura(i);
        if (buena(cartas[i])) setOcupado(false);
        else mostrar(i);
    };

    const mostrar = async (i: number) => {
        setOcupado(true);
        await escena.current?.revelar(i);
        if (etapaRef.current !== 'revelando') return;
        setVolteada(true);
        setOcupado(false);
        gsap.fromTo(
            info.current,
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.35 }
        );
    };

    const empezarCarga = () => {
        cargaTween.current?.kill();
        cargaTween.current = gsap.to(carga.current, {
            p: 1,
            duration: 1.6 * (1 - carga.current.p),
            ease: 'power1.in',
            onUpdate: actualizarCarga,
            onComplete: abrir,
        });
    };

    const descargar = () => {
        if (carga.current.p >= 1) return;
        cargaTween.current?.kill();
        cargaTween.current = gsap.to(carga.current, {
            p: 0,
            duration: 0.4,
            ease: 'power2.out',
            onUpdate: actualizarCarga,
        });
    };

    const apretar = (e: PointerEvent) => {
        despertar();
        if (etapaRef.current === 'revelando') {
            arrastro.current = false;
            puntero.current = {
                x: e.clientX,
                y: e.clientY,
                x0: e.clientX,
                y0: e.clientY,
                movio: false,
            };
            return;
        }
        if (etapaRef.current !== 'pack') return;
        puntero.current = {
            x: e.clientX,
            y: e.clientY,
            x0: e.clientX,
            y0: e.clientY,
            movio: false,
        };
        try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {}
        clearTimeout(espera.current);
        espera.current = window.setTimeout(() => {
            if (puntero.current && !puntero.current.movio) empezarCarga();
        }, 140);
    };

    const mover = (e: PointerEvent) => {
        const p = puntero.current;
        if (etapaRef.current === 'revelando') {
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (!p || !volteada || ocupado) return;
            if (!p.movio && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8)
                p.movio = arrastro.current = true;
            if (p.movio)
                escena.current?.inclinar(
                    (e.clientX - p.x0) / (w * 0.3),
                    (e.clientY - p.y0) / (h * 0.3)
                );
            return;
        }
        if (!p || etapaRef.current !== 'pack') return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (!p.movio && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) {
            p.movio = true;
            clearTimeout(espera.current);
            descargar();
        }
        if (p.movio) escena.current?.arrastrar(dx, dy);
    };

    const levantar = () => {
        clearTimeout(espera.current);
        if (etapaRef.current === 'revelando') escena.current?.inclinar(0, 0);
        if (!puntero.current) return;
        puntero.current = null;
        escena.current?.soltar();
        if (etapaRef.current === 'pack') descargar();
    };

    const siguiente = async () => {
        setOcupado(true);
        gsap.to(info.current, { opacity: 0, duration: 0.2 });
        await escena.current?.siguiente(actual, ranura(actual));
        if (etapaRef.current !== 'revelando') return;
        setVolteada(false);
        const n = actual + 1;
        if (n >= cartas.length) {
            setOcupado(false);
            return terminar();
        }
        setActual(n);
        llegar(n);
    };

    const tocar = () => {
        if (arrastro.current) {
            arrastro.current = false;
            return;
        }
        if (etapaRef.current !== 'revelando' || ocupado) return;
        if (volteada) return siguiente();
        mostrar(actual);
    };

    const revelarTodo = async () => {
        const desde = volteada ? actual + 1 : actual;
        const k = cartas.findIndex((c, j) => j >= desde && buena(c));
        if (k < 0) return terminar();
        if (ocupado) return;
        if (k === actual) return mostrar(actual);
        setOcupado(true);
        gsap.to(info.current, { opacity: 0, duration: 0.2 });
        await escena.current?.saltar(
            actual,
            k,
            Array.from({ length: k - actual }, (_, j) => ranura(actual + j))
        );
        if (etapaRef.current !== 'revelando') return;
        setVolteada(false);
        setActual(k);
        escena.current?.mostrarAura(k);
        setOcupado(false);
    };

    const terminar = () => {
        escena.current?.quitarAura();
        escena.current?.ocultar();
        sonarResumen();
        pasar('resumen');
    };

    const carta = cartas[actual];
    const ayuda =
        etapa === 'cargando'
            ? 'Loading...'
            : etapa === 'pack'
              ? 'Drag to spin · Press and hold to open'
              : etapa === 'revelando'
                ? ocupado
                    ? ''
                    : volteada
                      ? 'Drag to tilt · Tap to continue'
                      : 'Tap to reveal'
                : '';

    return createPortal(
        <div
            ref={raiz}
            className="mw-texto fixed inset-0 z-[60] bg-black text-mw-mist overflow-hidden select-none touch-none"
            data-lenis-prevent
            onPointerDown={apretar}
            onPointerMove={mover}
            onPointerUp={levantar}
            onPointerCancel={levantar}
            onPointerLeave={() => escena.current?.inclinar(0, 0)}
            onClick={etapa === 'revelando' ? tocar : undefined}
        >
            <div
                ref={lienzo}
                className={`absolute inset-0 ${etapa === 'pack' ? 'cursor-grab active:cursor-grabbing' : etapa === 'revelando' ? 'cursor-pointer' : ''}`}
            />
            <div
                ref={destello}
                className="absolute inset-0 z-40 bg-[#fff6c8] opacity-0 pointer-events-none"
            />

            <div className="absolute top-5 inset-x-5 z-50 flex items-center justify-between">
                <span className="mw-etiqueta text-[10px] sm:text-xs text-mw-fog">
                    {etapa === 'resumen'
                        ? 'Pack opened'
                        : `Card ${actual + 1} / ${cartas.length}`}
                </span>
                <div className="flex items-center gap-5">
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            despertar();
                            activarSonido(!sonido);
                            setSonido(!sonido);
                        }}
                        aria-label={sonido ? 'Mute' : 'Unmute'}
                        title={sonido ? 'Mute' : 'Unmute'}
                        className="text-mw-fog hover:text-mw-champagne cursor-pointer transition-all duration-300"
                    >
                        {sonido ? (
                            <FiVolume2 className="size-5" />
                        ) : (
                            <FiVolumeX className="size-5" />
                        )}
                    </button>
                    {etapa === 'revelando' && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                revelarTodo();
                            }}
                            className="mw-etiqueta text-[10px] sm:text-xs text-mw-champagne cursor-pointer hover:text-mw-mist transition-all duration-300"
                        >
                            Reveal all
                        </button>
                    )}
                </div>
            </div>

            {etapa !== 'resumen' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26%] z-20 bg-[radial-gradient(ellipse_60%_100%_at_bottom,rgb(0_0_0/0.85),rgb(0_0_0/0.5)_45%,transparent_85%)]" />
            )}

            {etapa !== 'resumen' ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-[13%] z-30 flex flex-col items-center gap-3 text-center px-4">
                    <div
                        ref={info}
                        className="opacity-0 flex flex-col items-center gap-3"
                    >
                        {carta && <TituloCarta carta={carta} />}
                        {carta && <PastillaCarta carta={carta} />}
                    </div>
                    {etapa === 'pack' && (
                        <div className="w-40 h-1 rounded-full bg-mw-champagne/20 overflow-hidden">
                            <div
                                ref={barra}
                                className="h-full bg-mw-champagne origin-left scale-x-0"
                            />
                        </div>
                    )}
                    {etapa !== 'abriendo' && (
                        <p className="mw-etiqueta text-[10px] sm:text-xs text-mw-fog">
                            {ayuda || ' '}
                        </p>
                    )}
                </div>
            ) : (
                <div className="absolute inset-0 z-30 flex items-center justify-center px-4 animate-aparece">
                    <Resumen
                        cartas={cartas}
                        compartir={compartir}
                        quedan={quedan}
                        onFin={onFin}
                    />
                </div>
            )}

            {etapa === 'revelando' && (
                <div className="pointer-events-none absolute bottom-3 inset-x-0 z-30 flex justify-center gap-2">
                    {cartas.map((c, i) => (
                        <div
                            key={i}
                            ref={(el) => {
                                ranuras.current[i] = el;
                            }}
                            className="w-12 sm:w-16 aspect-[1621/2250]"
                        >
                            {i < actual && <Frente carta={c} chica />}
                        </div>
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
}
