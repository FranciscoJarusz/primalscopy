// El mapa de staking: cuatro regiones (el mapa "Primal Cult Map2" que paso el
// usuario), cada una con su periodo de entrenamiento. Tocar una region abre el
// panel para mandar Primals ahi.
//
// Todo es un SVG: las costas, las regiones, las etiquetas y los Primals
// escalan juntos. La camara es el viewBox: al cargar baja desde el mapa entero,
// al elegir una region viaja hasta ella y la encuadra al lado del panel, y al
// cerrarlo vuelve. Tambien se puede acercar, alejar y arrastrar a mano, con el
// mouse o con los dedos.
//
// Rendimiento: la camara escribe el viewBox directo en el <svg>, sin pasar por
// React, y nada del mapa usa filtros (sombras, brillo, gris): con un mapa asi
// de grande, cada filtro se recalcula en cada cuadro y la animacion se traba.
// Lo que tiene que medir lo mismo en pantalla con cualquier zoom (nombres,
// avatares, ondas) se achica con la variable CSS --k, que es la escala.
import { createRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Periodo } from '@/lib/staking';
import { fog, miniaturaPrimal } from '@/lib/staking';
import { CapaPrimals, type Vista } from './capaPrimals';
import { FONDO, FORMAS, LAGOS, LINEAS } from './mapaDatos';

// El tamano del SVG original. El mundo esta corrido (110, 90) adentro.
const ANCHO = 1946;
const ALTO = 1043;
const DX = 110;
const DY = 90;

// Las regiones, con el lore del mapa. "etiqueta" es donde va el nombre, en
// coordenadas del mundo.
export const ZONAS = [
    {
        id: 'fogreach',
        days: 90,
        nombre: 'Fogreach',
        titulo: 'Fogreach Republic',
        lugar: 'West continent',
        lema: 'For the loyal ones. They work hard, then unwind with a beer at Cultbrew or the Primal Pour taverns once the rituals are done.',
        color: '#3b62f2',
        etiqueta: { x: 427, y: 571 },
    },
    {
        id: 'lornshore',
        days: 30,
        nombre: 'Lornshore',
        titulo: 'Lornshore State',
        lugar: 'Center of the east continent',
        lema: 'For the tryhards. Sharp minds, ritual focus only, and one goal: the biggest share of FOG.',
        color: '#19b387',
        etiqueta: { x: 1045, y: 463 },
    },
    {
        id: 'baum',
        days: 14,
        nombre: 'Baum',
        titulo: 'Baum Land',
        lugar: 'East and southeast',
        lema: 'The land of relief. Slow days, long breaks, and a permanent vacation.',
        color: '#ef5a3d',
        etiqueta: { x: 1298, y: 314 },
    },
    {
        id: 'varnoss',
        days: 7,
        nombre: 'Varnoss',
        titulo: 'Varnoss Island',
        lugar: 'South, isolated island',
        lema: 'For those who love a good brawl and are always sharpening their fight moves. Huge beer chuggers too.',
        color: '#9060f5',
        etiqueta: { x: 872, y: 738 },
    },
];

export type Zona = (typeof ZONAS)[number];
type Caja = { x0: number; y0: number; x1: number; y1: number };

// Cuanto mas grandes que la pantalla son las capas que se mueven con transform
// (el mapa base y las sombras), de cada lado: al arrastrar o volar se ve
// mapa ya pintado en vez de un borde vacio.
const SOBRANTE = 0.2;
const ESTILO_FIJO: React.CSSProperties = {
    inset: `-${SOBRANTE * 100}%`,
    width: `${(1 + 2 * SOBRANTE) * 100}%`,
    height: `${(1 + 2 * SOBRANTE) * 100}%`,
    transformOrigin: 'center',
    willChange: 'transform',
};

// El rectangulo de cada region en coordenadas del SVG, para encuadrarla. Los
// contornos son solo puntos (M x,y x,y ... Z).
const CAJAS: Record<string, Caja> = Object.fromEntries(
    Object.entries(FORMAS).map(([id, d]) => {
        const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
        const caja = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (let i = 0; i + 1 < n.length; i += 2) {
            caja.x0 = Math.min(caja.x0, n[i] + DX);
            caja.x1 = Math.max(caja.x1, n[i] + DX);
            caja.y0 = Math.min(caja.y0, n[i + 1] + DY);
            caja.y1 = Math.max(caja.y1, n[i + 1] + DY);
        }
        return [id, caja];
    })
);

// La parte de la pantalla que no tapan el header, el titulo y el panel de la
// region (ver Staking.tsx): ahi se encuadra la region elegida.
function libre(w: number, h: number): Caja {
    if (w >= 640) {
        const derecha = w >= 1280 ? 120 : w >= 1024 ? 64 : 32;
        return { x0: 24, y0: 150, x1: w - derecha - 384 - 24, y1: h - 24 };
    }
    // En el celular el panel sube desde abajo hasta un 65% del alto, y arriba
    // quedan el header y dos filas (titulo, botones) que terminan en ~155 px.
    return { x0: 12, y0: 160, x1: w - 12, y1: h * 0.4 };
}

// Un grupo parado en (x, y) del mundo cuyo contenido se mide en pixeles de
// pantalla, con cualquier zoom.
const enPantalla = (x: number, y: number): React.CSSProperties => ({
    transform: `translate(${x}px, ${y}px) scale(calc(1 / var(--k, 1)))`,
});

// Los nombres de las regiones: miden lo mismo en pantalla con la vista normal,
// pero con el mapa entero a la vista en un celular (escala ~0,2) se pisaban.
// Por debajo de escala 1/1,6 se achican con el zoom, hasta un 55%. Con el
// mapa cubriendo la pantalla (escala >= ~0,7 en compu y en celular) no cambian.
const ETIQUETA = 'min(1, max(0.55, var(--k, 1) * 1.6))';
const enPantallaEtiqueta = (x: number, y: number): React.CSSProperties => ({
    transform: `translate(${x}px, ${y}px) scale(calc(${ETIQUETA} / var(--k, 1)))`,
});
// "14 days · 420 FOG" se va fundiendo al alejarse: lejos solo queda el nombre.
const OPACIDAD_DETALLE = 'clamp(0, (var(--k, 1) * 1.6 - 0.8) * 5, 1)';

const CSS = `
@keyframes mapa-onda { from { transform: scale(.15); opacity: .95 } to { transform: scale(1); opacity: 0 } }
@keyframes mapa-aparece { from { opacity: 0 } }
.mapa-onda { transform-box: fill-box; transform-origin: center; animation: mapa-onda 1.2s cubic-bezier(.15,.6,.3,1) both }
.mapa-aparece { animation: mapa-aparece .6s ease-out both }
@media (prefers-reduced-motion: reduce) {
  .mapa-onda, .mapa-aparece { animation: none }
  .mapa-onda { opacity: 0 }
}
`;

const BORDE_TEXTO = {
    stroke: 'rgba(9,0,80,.65)',
    strokeLinejoin: 'round' as const,
    paintOrder: 'stroke',
};

export default function Mapa({
    periodos,
    dias,
    alElegir,
    poblacion,
    mios,
    miniatura = miniaturaPrimal,
    enfocado = null,
}: {
    periodos: Periodo[];
    dias: number | null;
    alElegir: (dias: number) => void;
    // Los Primals entrenando en cada periodo, de todas las wallets.
    poblacion: Record<string, string[]>;
    // Los de la wallet conectada, que se destacan.
    mios: Set<string>;
    // De donde sale la imagen de cada Primal (el modo demo usa otra).
    miniatura?: (tokenId: string) => string;
    // Un Primal de la wallet al que ir ("My Primals" en Staking.tsx).
    enfocado?: string | null;
}) {
    const caja = useRef<HTMLDivElement>(null);
    const svg = useRef<SVGSVGElement>(null);
    const svgArriba = useRef<SVGSVGElement>(null);
    const svgBordes = useRef<SVGSVGElement>(null);
    const lienzo = useRef<HTMLCanvasElement>(null);
    const capa = useRef<CapaPrimals | null>(null);
    // Una capa de sombra por region (ver mas abajo), que se mueve como el mapa.
    const sombras = useMemo(
        () => Object.fromEntries(ZONAS.map((z) => [z.id, createRef<SVGSVGElement>()])),
        []
    );
    const camara = useCamara(caja, [svg, ...Object.values(sombras)], [svgBordes, svgArriba], (v, w, h) =>
        capa.current?.setVista(v, w, h)
    );
    // La region (o el Primal) bajo el mouse, y donde mostrar su cartelito.
    const [encima, setEncima] = useState<{ id: string; x: number; y: number } | null>(null);
    const [primal, setPrimal] = useState<{ tokenId: string; mio: boolean; x: number; y: number } | null>(null);
    const [foco, setFoco] = useState<string | null>(null);
    // Las ondas que deja cada toque, en coordenadas del mundo.
    const [ondas, setOndas] = useState<{ n: number; x: number; y: number; color: string }[]>([]);
    const contador = useRef(0);
    const ultimoToque = useRef(0);

    const zonas = ZONAS.flatMap((z) => {
        const periodo = periodos.find((p) => p.days === z.days);
        return periodo ? [{ ...z, periodo }] : [];
    });

    // La capa de los Primals (un canvas, ver capaPrimals.ts).
    useLayoutEffect(() => {
        if (!lienzo.current) return;
        const c = new CapaPrimals(lienzo.current, miniatura);
        capa.current = c;
        camara.redibujar();
        return () => {
            c.destruir();
            capa.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clavePoblacion = JSON.stringify(poblacion) + [...mios].join();
    useEffect(() => {
        capa.current?.setDatos(
            ZONAS.map((z) => ({
                id: z.id,
                color: z.color,
                etiqueta: z.etiqueta,
                // El nombre mide unos 24 px por letra con la vista normal.
                anchoEtiqueta: z.nombre.length * 24 + 40,
                ids: poblacion[z.days] ?? [],
            })),
            mios
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clavePoblacion]);

    // Elegir una region lleva la camara hasta ella; cerrar el panel la
    // devuelve a la vista de arranque.
    const elegida = ZONAS.find((z) => z.days === dias)?.id ?? null;
    const habiaElegida = useRef(false);
    const { volarA, volverAlInicio, medido } = camara;
    useEffect(() => {
        capa.current?.setElegida(elegida);
        if (!medido) return;
        if (elegida) {
            habiaElegida.current = true;
            volarA(CAJAS[elegida]);
            // Elegida desde la leyenda: la ola de saltos sale del nombre.
            const z = ZONAS.find((x) => x.id === elegida)!;
            if (Date.now() - ultimoToque.current > 300) {
                capa.current?.saltar(z.id, z.etiqueta.x + DX, z.etiqueta.y + DY);
            }
        } else if (habiaElegida.current) {
            habiaElegida.current = false;
            volverAlInicio();
        }
    }, [elegida, medido, volarA, volverAlInicio]);

    // "My Primals": la camara va hasta el Primal y la capa lo marca con un
    // anillo. Va despues del efecto de la region: si cambian juntos, este vuelo
    // reemplaza al de la region entera.
    useEffect(() => {
        capa.current?.enfocar(enfocado);
        if (!enfocado || !medido) return;
        const p = capa.current?.posicion(enfocado);
        if (!p) return;
        const lado = 60;
        volarA({ x0: p.x - lado, y0: p.y - lado, x1: p.x + lado, y1: p.y + lado });
    }, [enfocado, medido, volarA, clavePoblacion]);

    // El Primal bajo un punto de la pantalla.
    const primalEn = (p: { x: number; y: number }) => {
        const m = camara.aMundo(p);
        return capa.current?.enPunto(m.x, m.y) ?? null;
    };
    const mirar = (z: Zona, e: React.PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        const p = camara.local(e);
        const m = primalEn(p);
        capa.current?.setResaltado(m?.tokenId ?? null);
        setPrimal(m ? { tokenId: m.tokenId, mio: m.mio, ...p } : null);
        setEncima({ id: z.id, ...p });
    };

    // Un arrastre termina con un click sobre la region donde se solto: ese
    // click no tiene que elegirla.
    const elegir = (z: Zona, e?: React.MouseEvent) => {
        if (camara.arrastro()) return;
        if (e) {
            ultimoToque.current = Date.now();
            const local = camara.local(e);
            const p = camara.aMundo(local);
            const n = ++contador.current;
            setOndas((o) => [...o, { n, x: p.x - DX, y: p.y - DY, color: z.color }]);
            setTimeout(() => setOndas((o) => o.filter((x) => x.n !== n)), 1500);
            capa.current?.saltar(z.id, p.x, p.y);
            // La camara se va a mover: el cartel quedaria flotando en otro lado.
            setPrimal(null);
            capa.current?.setResaltado(null);
            // En el celular no hay mouse: tocar un Primal de la region ya
            // elegida (la camara no se mueve) muestra su numero un rato.
            const tactil = (e.nativeEvent as PointerEvent).pointerType !== 'mouse';
            const m = tactil && z.id === elegida ? primalEn(local) : null;
            if (m) {
                capa.current?.setResaltado(m.tokenId);
                setPrimal({ tokenId: m.tokenId, mio: m.mio, ...local });
                setTimeout(() => {
                    setPrimal((v) => (v?.tokenId === m.tokenId ? null : v));
                    capa.current?.setResaltado(null);
                }, 2000);
            }
        }
        alElegir(z.days);
    };

    const conCartel = encima && zonas.find((z) => z.id === encima.id);

    return (
        <div
            ref={caja}
            className="absolute inset-0 overflow-hidden touch-none bg-darkblue"
            {...camara.eventos}
            onPointerLeave={() => {
                setEncima(null);
                setPrimal(null);
                capa.current?.setResaltado(null);
            }}
        >
            {/* Tres capas con la misma camara: el mapa (que recibe los toques),
                los Primals en un canvas, y arriba las ondas y los nombres. El
                viewBox y --k los escribe la camara (useCamara). */}
            <svg
                ref={svg}
                viewBox={`0 0 ${ANCHO} ${ALTO}`}
                className="mapa-aparece absolute block select-none cursor-grab active:cursor-grabbing"
                style={ESTILO_FIJO}
            >
                <style>{CSS}</style>
                <defs>
                    <image
                        id="lineas"
                        href="/images/staking/lineas.png"
                        width={LINEAS.ancho}
                        height={LINEAS.alto}
                    />
                    {/* Toda la tierra junta: las lineas y los lagos se dibujan
                        una sola vez, recortados a las cuatro regiones. */}
                    <clipPath id="tierra">
                        {zonas.map((z) => (
                            <path key={z.id} d={FORMAS[z.id]} />
                        ))}
                    </clipPath>
                </defs>

                <g transform={`translate(${DX} ${DY})`}>
                    {/* El mar: franjas cada vez mas claras hacia la costa. */}
                    <rect x={-DX} y={-DY} width={ANCHO} height={ALTO} fill="#090050" />
                    {FONDO.map((f, i) => (
                        <path key={i} d={f.d} fill={f.color} fillRule="evenodd" />
                    ))}

                    {/* Las regiones para tocar. */}
                    {zonas.map((z) => (
                        <path
                            key={z.id}
                            d={FORMAS[z.id]}
                            fill={z.color}
                            stroke="rgba(9,0,80,.7)"
                            strokeWidth={1.4}
                            vectorEffect="non-scaling-stroke"
                            role="button"
                            tabIndex={0}
                            aria-pressed={z.id === elegida}
                            aria-label={`${z.titulo}: stake ${z.days} days`}
                            className="cursor-pointer outline-none"
                            onClick={(e) => elegir(z, e)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    elegir(z);
                                }
                            }}
                            onFocus={() => setFoco(z.id)}
                            onBlur={() => setFoco(null)}
                            onPointerEnter={(e) => mirar(z, e)}
                            onPointerMove={(e) => mirar(z, e)}
                            onPointerLeave={() => setEncima((v) => (v?.id === z.id ? null : v))}
                        />
                    ))}

                    <g pointerEvents="none" clipPath="url(#tierra)">
                        <use href="#lineas" />
                        <path d={LAGOS} fill="#0a0570" fillOpacity={0.92} />
                    </g>
                </g>
            </svg>

            {/* Con una region elegida, las demas se oscurecen; sin ninguna, la
                del mouse se aclara un poco. Cada sombra es una capa aparte que
                se mueve como el mapa base y se funde con su opacidad: asi la
                GPU la anima sin repintar. La transicion es solo de opacidad
                (no transition-all): el transform lo escribe la camara en cada
                cuadro y no tiene que ir con retraso. */}
            {zonas.map((z) => {
                const activa = z.id === elegida;
                const marcada = z.id === encima?.id || z.id === foco;
                const opacidad = elegida ? (activa ? 0 : marcada ? 0.3 : 0.6) : marcada ? 0.12 : 0;
                return (
                    <svg
                        key={z.id}
                        ref={sombras[z.id]}
                        viewBox={`0 0 ${ANCHO} ${ALTO}`}
                        className="absolute block pointer-events-none"
                        style={{
                            ...ESTILO_FIJO,
                            willChange: 'transform, opacity',
                            // Nunca 0 del todo: invisible el navegador no la pinta, y la
                            // primera vez que aparecian se pintaban las cuatro en un
                            // mismo cuadro (el primer cambio de region se trababa).
                            opacity: Math.max(opacidad, 0.001),
                            transition: 'opacity 300ms',
                        }}
                    >
                        <path transform={`translate(${DX} ${DY})`} d={FORMAS[z.id]} fill={elegida ? '#090050' : '#fff'} />
                    </svg>
                );
            })}

            {/* El borde amarillo de la elegida, y uno mas fino en la del mouse:
                debajo de los Primals (si no, la linea les pasa por encima) y en
                su propia capa, que sigue al viewBox en cada cuadro como la de
                arriba: es liviana y asi no se repinta el mapa base. */}
            <svg ref={svgBordes} viewBox={`0 0 ${ANCHO} ${ALTO}`} className="absolute inset-0 block w-full h-full pointer-events-none">
                <g transform={`translate(${DX} ${DY})`}>
                    {zonas.map((z) => {
                        const activa = z.id === elegida;
                        const marcada = !elegida && (z.id === encima?.id || z.id === foco);
                        return (
                            <path
                                key={z.id}
                                d={FORMAS[z.id]}
                                fill="none"
                                stroke="#fdf468"
                                strokeWidth={activa ? 3.5 : 2}
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                                opacity={activa || marcada ? 1 : 0}
                                className="transition-all duration-300"
                            />
                        );
                    })}
                </g>
            </svg>

            <canvas ref={lienzo} className="absolute inset-0 w-full h-full pointer-events-none" />

            <svg ref={svgArriba} viewBox={`0 0 ${ANCHO} ${ALTO}`} className="absolute inset-0 block w-full h-full pointer-events-none">
                <g transform={`translate(${DX} ${DY})`}>
                    {/* La onda de cada toque. */}
                    {ondas.map((o) => (
                        <g key={o.n} style={enPantalla(o.x, o.y)}>
                            <circle r={80} fill={o.color} fillOpacity={0.45} stroke="#fff" strokeWidth={3} className="mapa-onda" />
                            <circle r={150} fill="none" stroke="#fdf468" strokeWidth={6} className="mapa-onda" />
                            <circle r={220} fill="none" stroke="#fdf468" strokeWidth={3} className="mapa-onda" style={{ animationDelay: '.15s' }} />
                        </g>
                    ))}

                    {/* Los nombres y el periodo de cada region. El de la
                        elegida crece con un rebote. */}
                    <g className="font-accent uppercase">
                        {zonas.map((z) => {
                            const activa = z.id === elegida;
                            return (
                                <g key={z.id} style={enPantallaEtiqueta(z.etiqueta.x, z.etiqueta.y)}>
                                    <g
                                        className="transition-all duration-300"
                                        style={{
                                            transformOrigin: '0px -8px',
                                            transform: activa ? 'scale(1.3)' : 'scale(1)',
                                            transitionTimingFunction: 'cubic-bezier(.2,.9,.3,1.4)',
                                            opacity: elegida && !activa ? 0.55 : 1,
                                        }}
                                    >
                                        <text
                                            textAnchor="middle"
                                            fontSize={z.id === 'varnoss' ? 20 : 24}
                                            letterSpacing={2.5}
                                            fill={activa ? '#fdf468' : '#fff'}
                                            strokeWidth={5}
                                            {...BORDE_TEXTO}
                                        >
                                            {z.nombre}
                                        </text>
                                        <text y={24} textAnchor="middle" fontSize={13} letterSpacing={1} fill="#fdf468" strokeWidth={4} {...BORDE_TEXTO} style={{ opacity: OPACIDAD_DETALLE }}>
                                            {z.days} days · {fog(z.periodo.perDay * z.days)} FOG
                                        </text>
                                    </g>
                                </g>
                            );
                        })}
                    </g>
                </g>
            </svg>

            {/* El cartelito del Primal o de la region bajo el mouse. */}
            {primal ? (
                <div
                    className="animate-aparece pointer-events-none absolute z-10 -translate-x-1/2 translate-y-[-150%] bg-yellow text-darkblue h-8 flex items-center font-accent uppercase text-sm leading-none px-3 pb-[0.38em] rounded-lg whitespace-nowrap shadow-lg shadow-darkblue/60"
                    style={{ left: primal.x, top: primal.y }}
                >
                    #{primal.tokenId}
                    {primal.mio && <span className="opacity-70 ml-2">yours</span>}
                </div>
            ) : (
                conCartel &&
                conCartel.id !== elegida && (
                    <div
                        className="animate-aparece pointer-events-none absolute z-10 -translate-x-1/2 translate-y-[-135%] bg-yellow text-darkblue h-8 flex items-center font-accent uppercase text-sm leading-none px-3 pb-[0.38em] rounded-lg whitespace-nowrap shadow-lg shadow-darkblue/60"
                        style={{ left: encima.x, top: encima.y }}
                    >
                        {conCartel.nombre} {conCartel.days}d
                        <span className="opacity-70 ml-2">
                            {(conCartel.periodo.training ?? 0).toLocaleString('en-US')} staking
                        </span>
                    </div>
                )
            )}

            <div className="absolute left-4 bottom-4 sm:left-8 lg:left-16 xl:left-30 flex flex-col gap-1.5">
                {[
                    // En el celular el zoom es con los dedos: queda solo el
                    // de ver el mapa entero.
                    { texto: '+', label: 'Zoom in', accion: () => camara.zoom(1.4), soloCompu: true },
                    { texto: '−', label: 'Zoom out', accion: () => camara.zoom(1 / 1.4), soloCompu: true },
                    { texto: '⤢', label: 'Show the whole map', accion: camara.verTodo, soloCompu: false },
                ].map((b) => (
                    <button
                        key={b.label}
                        onClick={b.accion}
                        aria-label={b.label}
                        title={b.label}
                        className={`${b.soloCompu ? 'hidden sm:grid' : 'grid'} size-9 place-items-center bg-darkblue/90 rounded-lg shadow-lg shadow-darkblue/60 text-lightblue hover:text-yellow text-xl leading-none cursor-pointer active:scale-97 transition-all duration-300`}
                    >
                        {b.texto}
                    </button>
                ))}
            </div>
        </div>
    );
}

// La camara del mapa: el centro en coordenadas del SVG y la escala en pixeles
// de pantalla por unidad. Va de "se ve el mapa entero" (contener) a 4 veces
// "el mapa cubre la pantalla" (cubrir), que es la vista normal. Todo vive en
// refs y se escribe directo en el <svg>: mover la camara no re-renderiza.
function useCamara(
    caja: React.RefObject<HTMLDivElement | null>,
    // El mapa base, caro de pintar: mientras la camara se mueve se corre y
    // escala con un transform de CSS (lo hace la GPU sin volver a pintarlo) y
    // recien cuando se queda quieta se repinta con el viewBox nuevo. Sin esto,
    // pintar el mapa en cada cuadro era lo que trababa las animaciones.
    fijos: React.RefObject<SVGSVGElement | null>[],
    // Lo liviano (nombres, bordes, ondas): sigue al viewBox en cada cuadro.
    vivos: React.RefObject<SVGSVGElement | null>[],
    // Para lo que no es SVG y se mueve con la camara (el canvas de Primals).
    alMover: (v: Vista, w: number, h: number) => void
) {
    const alMoverRef = useRef(alMover);
    alMoverRef.current = alMover;
    const [medido, setMedido] = useState(false);
    const tam = useRef({ w: ANCHO, h: ALTO });
    const vista = useRef<Vista | null>(null);
    const punteros = useRef(new Map<number, { x: number; y: number }>());
    const movido = useRef(0);
    // Cuando termino el ultimo arrastre: el click que llega justo despues no
    // elige la region donde se solto.
    const finArrastre = useRef(0);
    // El vuelo en curso (requestAnimationFrame); tocar el mapa lo corta.
    const vuelo = useRef(0);

    const contener = () => Math.min(tam.current.w / ANCHO, tam.current.h / ALTO);
    const cubrir = () => Math.max(tam.current.w / ANCHO, tam.current.h / ALTO);
    const inicio = (): Vista => ({ cx: ANCHO / 2, cy: ALTO / 2, escala: cubrir() });

    // Mantiene la escala en rango y el mapa cerca de la pantalla. Deja un
    // margen de mar para poder encuadrar una region de la orilla al lado del
    // panel; fuera del mapa el fondo es del mismo azul que el mar.
    const ajustar = (v: Vista): Vista => {
        const escala = Math.min(Math.max(v.escala, contener()), cubrir() * 4);
        const fijar = (c: number, pantalla: number, total: number) => {
            const medio = pantalla / escala / 2;
            const margen = (pantalla * 0.3) / escala;
            const desde = medio - margen;
            const hasta = total - medio + margen;
            return desde > hasta ? total / 2 : Math.min(Math.max(c, desde), hasta);
        };
        return { escala, cx: fijar(v.cx, tam.current.w, ANCHO), cy: fijar(v.cy, tam.current.h, ALTO) };
    };

    const actual = () => vista.current ?? ajustar(inicio());

    // `margen`: las capas fijas son mas grandes que la pantalla (ver
    // SOBRANTE), y su viewBox tambien.
    const viewBoxDe = (a: Vista, margen = 1) => {
        const w = tam.current.w * margen;
        const h = tam.current.h * margen;
        return `${a.cx - w / a.escala / 2} ${a.cy - h / a.escala / 2} ${w / a.escala} ${h / a.escala}`;
    };

    // La vista con la que esta pintado el mapa base, y el repintado pendiente.
    const pintada = useRef<Vista | null>(null);
    const asentar = useRef(0);
    const pintar = (a: Vista) => {
        clearTimeout(asentar.current);
        pintada.current = a;
        for (const svg of fijos) {
            svg.current?.setAttribute('viewBox', viewBoxDe(a, 1 + 2 * SOBRANTE));
            if (svg.current) svg.current.style.transform = '';
        }
    };
    const repintar = () => {
        if (vista.current) pintar(vista.current);
    };

    const aplicar = (v: Vista, { ya = false } = {}) => {
        const a = ajustar(v);
        vista.current = a;
        const { w, h } = tam.current;
        for (const svg of vivos) {
            svg.current?.setAttribute('viewBox', viewBoxDe(a));
            svg.current?.style.setProperty('--k', String(a.escala));
        }
        let b = pintada.current;
        if (!b || ya) {
            repintar();
        } else {
            // Si lo pintado ya no cubre la pantalla (alejarse rapido con la
            // rueda, arrastrar lejos) o se veria muy borroso (acercarse
            // mucho), no se puede esperar a que la camara se quede quieta: se
            // repinta en este cuadro. Al alejarse se pinta de mas, para que
            // los cuadros siguientes no tengan que volver a hacerlo.
            const lado = 1 + 2 * SOBRANTE;
            const cubre =
                a.cx - w / a.escala / 2 >= b.cx - (w * lado) / b.escala / 2 &&
                a.cx + w / a.escala / 2 <= b.cx + (w * lado) / b.escala / 2 &&
                a.cy - h / a.escala / 2 >= b.cy - (h * lado) / b.escala / 2 &&
                a.cy + h / a.escala / 2 <= b.cy + (h * lado) / b.escala / 2;
            if (!cubre) {
                pintar({ cx: a.cx, cy: a.cy, escala: a.escala < b.escala ? a.escala / 1.6 : a.escala });
                b = pintada.current!;
            } else if (a.escala / b.escala > 2.5) {
                pintar(a);
                b = a;
            }
            // De como esta pintado a como se tiene que ver, alrededor del
            // centro de la pantalla.
            const s = a.escala / b.escala;
            const tx = (b.cx - a.cx) * a.escala;
            const ty = (b.cy - a.cy) * a.escala;
            for (const svg of fijos) {
                if (svg.current) svg.current.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
            }
            clearTimeout(asentar.current);
            asentar.current = window.setTimeout(repintar, 150);
        }
        alMoverRef.current(a, w, h);
    };

    const cortarVuelo = () => {
        cancelAnimationFrame(vuelo.current);
        objetivo.current = null;
    };

    // Lleva la camara a otra vista con una curva suave. La escala se
    // interpola en logaritmo para que acercarse se sienta parejo.
    const volar = (destino: Vista, ms = 900) => {
        cortarVuelo();
        const desde = actual();
        const hasta = ajustar(destino);
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return aplicar(hasta);
        // El mapa base se pinta una vez con una vista que abarca el origen y el
        // destino: durante el vuelo solo se escala, sin bordes sin pintar.
        const { w, h } = tam.current;
        const borde = (v: Vista) => [v.cx - w / v.escala / 2, v.cy - h / v.escala / 2, v.cx + w / v.escala / 2, v.cy + h / v.escala / 2];
        const [a0, a1, a2, a3] = borde(desde);
        const [b0, b1, b2, b3] = borde(hasta);
        const x0 = Math.min(a0, b0), y0 = Math.min(a1, b1), x1 = Math.max(a2, b2), y1 = Math.max(a3, b3);
        const lado = 1 + 2 * SOBRANTE;
        // Si lo ya pintado abarca todo el vuelo (acercarse a una region que ya
        // se ve), no hace falta: repintar al arrancar trababa el primer cuadro.
        const p = pintada.current;
        const cubre =
            p &&
            x0 >= p.cx - (w * lado) / p.escala / 2 &&
            x1 <= p.cx + (w * lado) / p.escala / 2 &&
            y0 >= p.cy - (h * lado) / p.escala / 2 &&
            y1 <= p.cy + (h * lado) / p.escala / 2;
        if (!cubre) {
            pintar({
                cx: (x0 + x1) / 2,
                cy: (y0 + y1) / 2,
                escala: Math.min(desde.escala, hasta.escala, (w * lado) / (x1 - x0), (h * lado) / (y1 - y0)),
            });
            aplicar(desde);
        }
        const t0 = performance.now();
        const paso = (ahora: number) => {
            const t = Math.min(1, (ahora - t0) / ms);
            const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            aplicar({
                cx: desde.cx + (hasta.cx - desde.cx) * e,
                cy: desde.cy + (hasta.cy - desde.cy) * e,
                escala: Math.exp(Math.log(desde.escala) + (Math.log(hasta.escala) - Math.log(desde.escala)) * e),
            });
            if (t < 1) vuelo.current = requestAnimationFrame(paso);
        };
        vuelo.current = requestAnimationFrame(paso);
    };

    // Las funciones que usa el mapa en efectos: estables entre renders.
    const volarRef = useRef(volar);
    volarRef.current = volar;

    // Encuadra un rectangulo del mapa en la parte libre de la pantalla.
    const volarA = useCallback((c: Caja) => {
        const { w, h } = tam.current;
        const l = libre(w, h);
        const escala = Math.min(
            ((l.x1 - l.x0) / (c.x1 - c.x0)) * 0.85,
            ((l.y1 - l.y0) / (c.y1 - c.y0)) * 0.85,
            cubrir() * 2.5
        );
        volarRef.current({
            escala,
            cx: (c.x0 + c.x1) / 2 - ((l.x0 + l.x1) / 2 - w / 2) / escala,
            cy: (c.y0 + c.y1) / 2 - ((l.y0 + l.y1) / 2 - h / 2) / escala,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const volverAlInicio = useCallback(() => volarRef.current(inicio(), 800), []); // eslint-disable-line react-hooks/exhaustive-deps

    // Mide la caja que envuelve al SVG (un ResizeObserver sobre el <svg> mismo
    // mide lo que dibuja, no su tamano en la pagina). La primera vez arranca
    // viendo el mapa entero y baja hasta la vista normal.
    useLayoutEffect(() => {
        const el = caja.current;
        if (!el) return;
        let primera = true;
        let espera = 0;
        const obs = new ResizeObserver(([e]) => {
            const { width, height } = e.contentRect;
            if (!width || !height) return;
            tam.current = { w: width, h: height };
            if (primera) {
                primera = false;
                aplicar({ cx: ANCHO / 2, cy: ALTO / 2, escala: contener() * 0.9 });
                espera = window.setTimeout(() => {
                    if (vista.current && vista.current.escala < cubrir()) volarRef.current(inicio(), 1400);
                }, 350);
                setMedido(true);
            } else {
                aplicar(actual(), { ya: true });
            }
        });
        obs.observe(el);
        return () => {
            obs.disconnect();
            clearTimeout(espera);
            clearTimeout(asentar.current);
            cancelAnimationFrame(vuelo.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [caja]);

    // La vista que resulta de acercar o alejar `desde` dejando quieto el
    // punto (px, py) de la pantalla.
    const conZoom = (desde: Vista, factor: number, px = tam.current.w / 2, py = tam.current.h / 2) => {
        const { w, h } = tam.current;
        const escala = Math.min(Math.max(desde.escala * factor, contener()), cubrir() * 4);
        return ajustar({
            escala,
            cx: desde.cx + (px - w / 2) * (1 / desde.escala - 1 / escala),
            cy: desde.cy + (py - h / 2) * (1 / desde.escala - 1 / escala),
        });
    };
    // El pellizco sigue a los dedos sin demora.
    const zoomEn = (factor: number, px?: number, py?: number) => aplicar(conZoom(actual(), factor, px, py));

    // La rueda. Un touchpad (o el pellizco del touchpad, que llega como rueda
    // con ctrl) manda muchos eventos chicos: se siguen al instante, cualquier
    // demora se siente como que el mapa va detras de los dedos. Un mouse manda
    // saltos de a ~100: esos se animan en ~120 ms para no ir a los saltos.
    // En los dos casos el punto del mapa bajo el cursor queda clavado ahi: la
    // escala es lo unico que se anima y el centro se calcula a partir de ese
    // punto en cada cuadro.
    type Ancla = { px: number; py: number; wx: number; wy: number };
    const objetivo = useRef<{ escala: number; ancla: Ancla } | null>(null);
    const anclada = (escala: number, { px, py, wx, wy }: Ancla) => {
        const { w, h } = tam.current;
        const e = Math.min(Math.max(escala, contener()), cubrir() * 4);
        return { escala: e, cx: wx - (px - w / 2) / e, cy: wy - (py - h / 2) / e };
    };
    const seguir = () => {
        let antes = performance.now();
        const paso = (ahora: number) => {
            const o = objetivo.current;
            if (!o) return;
            const a = actual();
            const k = 1 - Math.exp(-(ahora - antes) / 40);
            antes = ahora;
            const escala = Math.exp(Math.log(a.escala) + (Math.log(o.escala) - Math.log(a.escala)) * k);
            if (Math.abs(escala / o.escala - 1) < 0.003) {
                objetivo.current = null;
                aplicar(anclada(o.escala, o.ancla));
                return;
            }
            aplicar(anclada(escala, o.ancla));
            vuelo.current = requestAnimationFrame(paso);
        };
        vuelo.current = requestAnimationFrame(paso);
    };
    const rueda = (e: React.WheelEvent) => {
        const p = local(e);
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        const m = aMundo(p);
        const ancla = { px: p.x, py: p.y, wx: m.x, wy: m.y };
        const enCurso = objetivo.current;
        const base = enCurso?.escala ?? actual().escala;
        const escala = Math.min(Math.max(base * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), contener()), cubrir() * 4);
        if (Math.abs(dy) < 50 || e.ctrlKey) {
            // Touchpad: directo.
            cortarVuelo();
            aplicar(anclada(escala, ancla));
            return;
        }
        if (enCurso) {
            objetivo.current = { escala, ancla };
            return;
        }
        cortarVuelo();
        objetivo.current = { escala, ancla };
        seguir();
    };

    const local = (e: { clientX: number; clientY: number }) => {
        const r = caja.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // De un punto de la pantalla a coordenadas del SVG.
    const aMundo = (p: { x: number; y: number }) => {
        const a = actual();
        return {
            x: a.cx + (p.x - tam.current.w / 2) / a.escala,
            y: a.cy + (p.y - tam.current.h / 2) / a.escala,
        };
    };
    const soltar = (e: React.PointerEvent) => {
        punteros.current.delete(e.pointerId);
        if (movido.current > 6) finArrastre.current = Date.now();
    };

    const eventos = {
        onWheel: rueda,
        onPointerDown: (e: React.PointerEvent) => {
            cortarVuelo();
            if (punteros.current.size === 0) movido.current = 0;
            punteros.current.set(e.pointerId, local(e));
        },
        onPointerMove: (e: React.PointerEvent) => {
            const antes = punteros.current.get(e.pointerId);
            if (!antes) return;
            const ahora = local(e);
            const otros = [...punteros.current.entries()].filter(([id]) => id !== e.pointerId);
            punteros.current.set(e.pointerId, ahora);
            if (otros.length === 1) {
                // Pellizco: la escala cambia igual que la distancia entre los
                // dedos, alrededor del punto medio.
                const o = otros[0][1];
                const d0 = Math.hypot(antes.x - o.x, antes.y - o.y);
                const d1 = Math.hypot(ahora.x - o.x, ahora.y - o.y);
                movido.current += Math.abs(d1 - d0);
                if (d0 > 0) zoomEn(d1 / d0, (ahora.x + o.x) / 2, (ahora.y + o.y) / 2);
                return;
            }
            const dx = ahora.x - antes.x;
            const dy = ahora.y - antes.y;
            movido.current += Math.abs(dx) + Math.abs(dy);
            // Recien despues de unos pixeles es un arrastre. Capturar el
            // puntero antes haria que el click nunca llegue a la region.
            if (movido.current <= 6) return;
            if (!caja.current!.hasPointerCapture(e.pointerId)) {
                caja.current!.setPointerCapture(e.pointerId);
            }
            const a = actual();
            aplicar({ ...a, cx: a.cx - dx / a.escala, cy: a.cy - dy / a.escala });
        },
        onPointerUp: soltar,
        onPointerCancel: soltar,
    };

    return {
        medido,
        redibujar: () => aplicar(actual(), { ya: true }),
        eventos,
        local,
        aMundo,
        volarA,
        volverAlInicio,
        arrastro: () => movido.current > 6 || Date.now() - finArrastre.current < 300,
        zoom: (factor: number) => volar(conZoom(actual(), factor), 300),
        verTodo: () => volar({ cx: ANCHO / 2, cy: ALTO / 2, escala: contener() }, 700),
    };
}
