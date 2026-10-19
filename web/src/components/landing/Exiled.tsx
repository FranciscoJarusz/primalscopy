import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BACKEND_URL } from '@/lib/backend';
import { miniaturaPrimal } from '@/lib/staking';

const TOQUES = 20;
const REINICIO_MS = 3000;
const CORRUPCION_MS = 2600;
const SALIDA_MS = 700;
const GLIFOS = '▓▒░█#@$%&¤§╳';
const FUENTE = 'https://fonts.googleapis.com/css2?family=Grenze+Gotisch:wght@500;600&display=swap';
const IDS = Array.from({ length: 20 }, (_, i) => String(1382 + i));
const POEMA = ['they are twenty.', 'they remember you.', 'now they rot in code.', 'and code does not forget.'];
const RESPUESTA_VALIDA = 'the master code is valid. you did what was required. this does not mean you won.';

const CSS = `
.exiled-tiembla { animation: exiled-tiembla .12s steps(2) infinite; }
.exiled-rojo { color: #ff1a1a !important; text-shadow: 2px 0 rgba(0,255,255,.5), -2px 0 rgba(255,0,0,.8); }
html.exiled-corrupto body { animation: exiled-rgb .22s steps(2) infinite; }
@keyframes exiled-tiembla { 0% { transform: translate(1px,-1px); } 50% { transform: translate(-2px,1px); } 100% { transform: translate(1px,1px); } }
@keyframes exiled-rgb {
  0% { filter: drop-shadow(4px 0 0 rgba(255,0,0,.75)) drop-shadow(-4px 0 0 rgba(0,255,255,.5)); }
  50% { filter: hue-rotate(-40deg) saturate(2.5) drop-shadow(-5px 0 0 rgba(255,0,0,.8)); transform: translateX(3px); }
  100% { filter: contrast(1.6) drop-shadow(3px 0 0 rgba(255,0,0,.7)); transform: translateX(-2px); }
}
.exiled-velo { background: repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0 2px, transparent 2px 4px), rgba(200,0,0,.0); animation: exiled-velo ${CORRUPCION_MS}ms ease-in forwards; }
@keyframes exiled-velo { to { background-color: rgba(200,0,0,.85); } }
.exiled-ruido { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E"); animation: exiled-ruido .3s steps(3) infinite; }
@keyframes exiled-ruido { 0% { background-position: 0 0; } 33% { background-position: -40px 25px; } 66% { background-position: 30px -50px; } }
.exiled-gotica { font-family: 'Grenze Gotisch', serif; font-weight: 600; letter-spacing: .02em; }
.exiled-calavera { animation: exiled-salto 2.4s steps(1) infinite; }
@keyframes exiled-salto { 0%, 88%, 100% { transform: none; filter: none; } 90% { transform: translate(-6px, 2px) skewX(8deg); filter: hue-rotate(160deg); } 93% { transform: translate(5px,-3px); } }
.exiled-linea { opacity: 0; animation: exiled-aparece .5s forwards; }
@keyframes exiled-aparece { to { opacity: 1; } }
.exiled-primal img { filter: grayscale(1) contrast(1.3); }
.exiled-primal::after { content: ''; position: absolute; inset: 0; background: #e00; mix-blend-mode: multiply; }
@media (prefers-reduced-motion: reduce) {
  .exiled-tiembla, html.exiled-corrupto body, .exiled-ruido, .exiled-calavera { animation: none !important; }
}
`;

type Fase = 'quieto' | 'corrupcion' | 'toma' | 'saliendo';

export default function Exiled() {
    const [fase, setFase] = useState<Fase>('quieto');
    const [codigo, setCodigo] = useState('');
    const [respuesta, setRespuesta] = useState<{ texto: string; valida: boolean } | null>(null);
    const [probando, setProbando] = useState(false);
    const faseRef = useRef<Fase>('quieto');
    faseRef.current = fase;
    const textos = useRef<{ nodo: Text; original: string }[]>([]);

    const numero = () => document.getElementById('primals-count');

    const restaurarNumero = () => {
        const n = numero();
        if (!n) return;
        n.textContent = '2,712';
        n.classList.remove('exiled-tiembla', 'exiled-rojo');
    };

    const corromperTextos = () => {
        const raiz = document.querySelector('main') ?? document.body;
        const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
        const nodos: { nodo: Text; original: string }[] = [];
        while (walker.nextNode() && nodos.length < 80) {
            const nodo = walker.currentNode as Text;
            if ((nodo.textContent ?? '').trim().length > 3) nodos.push({ nodo, original: nodo.textContent ?? '' });
        }
        textos.current = nodos;
    };

    const restaurarTextos = () => {
        for (const { nodo, original } of textos.current) nodo.textContent = original;
        textos.current = [];
    };

    useEffect(() => {
        if (fase !== 'corrupcion') return;
        const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.documentElement.classList.add('exiled-corrupto');
        corromperTextos();
        const intervalo = reducido
            ? 0
            : window.setInterval(() => {
                  for (const { nodo, original } of textos.current) {
                      if (Math.random() < 0.5) continue;
                      nodo.textContent = [...original]
                          .map((c) => (c !== ' ' && Math.random() < 0.35 ? GLIFOS[Math.floor(Math.random() * GLIFOS.length)] : c))
                          .join('');
                  }
              }, 90);
        const fin = window.setTimeout(() => setFase('toma'), CORRUPCION_MS);
        return () => {
            window.clearInterval(intervalo);
            window.clearTimeout(fin);
        };
    }, [fase]);

    useEffect(() => {
        if (fase !== 'toma') return;
        document.documentElement.classList.remove('exiled-corrupto');
        restaurarTextos();
        const alTeclado = (e: KeyboardEvent) => e.key === 'Escape' && setFase('saliendo');
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, [fase]);

    useEffect(() => {
        if (fase !== 'toma' && fase !== 'saliendo') return;
        const html = document.documentElement;
        const antes = html.style.overflow;
        html.style.overflow = 'hidden';
        return () => {
            html.style.overflow = antes;
        };
    }, [fase === 'toma' || fase === 'saliendo']);

    useEffect(() => {
        if (fase !== 'saliendo') return;
        const fin = window.setTimeout(() => {
            restaurarNumero();
            setCodigo('');
            setRespuesta(null);
            setFase('quieto');
        }, SALIDA_MS);
        return () => window.clearTimeout(fin);
    }, [fase]);

    useEffect(() => {
        const tarjeta = document.querySelector<HTMLElement>('[data-exiled]');
        if (!tarjeta) return;
        let toques = 0;
        let reinicio = 0;

        const alTocar = () => {
            if (faseRef.current !== 'quieto') return;
            const n = numero();
            if (!n) return;
            toques++;
            window.clearTimeout(reinicio);
            reinicio = window.setTimeout(() => {
                toques = 0;
                restaurarNumero();
            }, REINICIO_MS);

            if (toques >= 10 && toques < 16) {
                const roto = [...'2,712'].map((c) => (c !== ',' && Math.random() < 0.3 ? GLIFOS[Math.floor(Math.random() * 4)] : c)).join('');
                n.textContent = roto;
                window.setTimeout(() => {
                    if (faseRef.current === 'quieto' && toques < 16) n.textContent = '2,712';
                }, 140);
            }
            if (toques >= 16) {
                n.classList.add('exiled-tiembla', 'exiled-rojo');
                n.textContent = (2712 - Math.round(((toques - 15) / (TOQUES - 15)) * 20)).toLocaleString('en-US');
            }
            if (toques >= TOQUES) {
                toques = 0;
                window.clearTimeout(reinicio);
                n.textContent = '2,692';
                if (!document.querySelector(`link[href="${FUENTE}"]`)) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = FUENTE;
                    document.head.appendChild(link);
                }
                IDS.forEach((id) => {
                    new Image().src = miniaturaPrimal(id, 192);
                });
                setFase('corrupcion');
            }
        };

        tarjeta.addEventListener('click', alTocar);
        return () => {
            tarjeta.removeEventListener('click', alTocar);
            window.clearTimeout(reinicio);
        };
    }, []);

    const probar = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!codigo.trim() || probando) return;
            setProbando(true);
            setRespuesta(null);
            try {
                const r = await fetch(`${BACKEND_URL}/exiled/code`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ code: codigo }),
                });
                const datos = await r.json().catch(() => ({}));
                if (datos.valid) setRespuesta({ texto: RESPUESTA_VALIDA, valida: true });
                else setRespuesta({ texto: datos.error ?? 'ACCESS DENIED', valida: false });
            } catch {
                setRespuesta({ texto: 'the beacon is silent.', valida: false });
            }
            setProbando(false);
        },
        [codigo, probando]
    );

    return (
        <>
            <style>{CSS}</style>
            {fase === 'corrupcion' &&
                createPortal(<div className="fixed inset-0 z-90 pointer-events-none exiled-velo" aria-hidden="true" />, document.body)}
            {(fase === 'toma' || fase === 'saliendo') &&
                createPortal(
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="The Exiled Twenty"
                        className={`fixed inset-x-0 top-0 h-svh z-90 overflow-hidden bg-[#b30000] text-white transition-all duration-300 ${
                            fase === 'saliendo' ? 'opacity-0 scale-105' : 'opacity-100'
                        }`}
                    >
                        <div className="exiled-ruido absolute inset-0 pointer-events-none mix-blend-multiply" aria-hidden="true" />
                        <button
                            type="button"
                            onClick={() => setFase('saliendo')}
                            aria-label="Leave"
                            className="fixed top-4 right-5 z-10 text-white/70 hover:text-white text-3xl leading-none cursor-pointer transition-all duration-300"
                        >
                            ×
                        </button>
                        <div className="relative h-full flex flex-col items-center justify-center gap-[2.2svh] px-4 py-[4svh] text-center">
                            <img
                                src="/images/exiled/skull.webp"
                                alt="The Exiled Twenty"
                                className="exiled-calavera size-[min(13svh,12rem)] sm:size-[min(17svh,12rem)] [image-rendering:pixelated] drop-shadow-[0_0_30px_rgba(0,0,0,.6)]"
                            />
                            <div className="exiled-gotica flex flex-col text-[clamp(1.1rem,3.5svh,2.25rem)] leading-[1.3]">
                                {POEMA.map((linea, i) => (
                                    <span key={linea} className="exiled-linea" style={{ animationDelay: `${0.4 + i * 0.7}s` }}>
                                        {linea}
                                    </span>
                                ))}
                            </div>
                            <p
                                className="exiled-gotica exiled-linea text-[clamp(.95rem,2.4svh,1.5rem)] text-white/85"
                                style={{ animationDelay: `${0.4 + POEMA.length * 0.7}s` }}
                            >
                                not gone — only locked — only watching. T.E.T.
                            </p>
                            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 sm:gap-2 max-w-3xl">
                                {IDS.map((id, i) => (
                                    <figure
                                        key={id}
                                        className="exiled-linea flex flex-col items-center gap-0.5"
                                        style={{ animationDelay: `${3.6 + i * 0.06}s` }}
                                    >
                                        <div className="exiled-primal relative size-[min(5svh,4rem)] sm:size-[min(6.5svh,4rem)] overflow-hidden rounded-md ring-1 ring-black/40">
                                            <img src={miniaturaPrimal(id, 192)} alt={`Primal #${id}`} className="size-full object-cover" />
                                        </div>
                                        <figcaption className="text-[10px] font-mono text-white/70">#{id}</figcaption>
                                    </figure>
                                ))}
                            </div>
                            <form
                                onSubmit={probar}
                                className="exiled-linea flex flex-col items-center gap-[1.2svh] w-full max-w-sm"
                                style={{ animationDelay: '5s' }}
                            >
                                <input
                                    value={codigo}
                                    onChange={(e) => setCodigo(e.target.value)}
                                    placeholder="master code"
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-label="Master code"
                                    className="w-full bg-black/70 text-[#ff4d4d] placeholder-[#ff4d4d]/40 font-mono uppercase tracking-[0.3em] text-center rounded-md px-3 py-2 ring-1 ring-black focus:outline-none focus:ring-2 focus:ring-white/60"
                                />
                                <button
                                    type="submit"
                                    disabled={probando}
                                    className="font-mono uppercase tracking-[0.3em] text-sm bg-black text-white rounded-md px-5 py-1.5 cursor-pointer hover:bg-white hover:text-black transition-all duration-300 disabled:opacity-50"
                                >
                                    {probando ? '...' : 'Enter'}
                                </button>
                                {respuesta && (
                                    <p
                                        key={respuesta.texto + Date.now()}
                                        className={`exiled-linea ${
                                            respuesta.valida
                                                ? 'exiled-gotica text-xl sm:text-2xl text-white'
                                                : 'font-mono uppercase tracking-[0.3em] text-black bg-white/90 px-3 py-1 rounded-sm exiled-tiembla'
                                        }`}
                                    >
                                        {respuesta.texto}
                                    </p>
                                )}
                            </form>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
