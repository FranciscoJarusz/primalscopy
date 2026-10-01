// Animaciones de entrada y de scroll, para cualquier pagina. Se activan con
// atributos en el HTML, asi cada seccion no tiene que traer su propio script:
//
//   data-anim="intro"          sus hijos entran escalonados apenas aparece
//   data-anim="reveal"         sube con fade al entrar en pantalla
//   data-anim="reveal-left"    entra desde la izquierda
//   data-anim="reveal-right"   entra desde la derecha
//   data-anim="fade"           solo fade, sin moverse. Para lo que esta al
//                              final de la pagina (el footer): si entrara
//                              desde abajo, mientras anima estiraria la
//                              pagina y apareceria la scrollbar un instante
//   data-anim-stagger          sus hijos aparecen de a uno al entrar en pantalla
//                              (tambien los que se agreguen despues, como una
//                              lista de NFTs que termina de cargar)
//   data-parallax="-60"        se desplaza esos px mientras cruza la pantalla
//
// Casi todas las pantallas son islas de React (client:only) que arman su HTML
// despues de cargar la pagina, y lo cambian segun el estado. Por eso no alcanza
// con buscar los atributos una vez: un MutationObserver anima todo lo que
// aparece despues. Su callback corre antes de que el navegador pinte, asi que
// lo nuevo nunca se ve un instante antes de esconderse para animarse.
//
// Para lo que ya esta en el HTML de entrada, BaseLayout pone la clase
// `anim-pendiente` en <html> y el CSS lo esconde hasta que GSAP toma el
// control. Si el JS fallara, BaseLayout la saca sola: nada queda invisible.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

// De donde arranca cada tipo de reveal. Los de costado solo con pantalla
// ancha: ahi las dos columnas de una seccion estan una al lado de la otra. En
// celular estan apiladas, y entrar de costado no tiene sentido.
const COLUMNAS = '(min-width: 1024px)';
function desde(tipo: string): gsap.TweenVars {
    const lado = window.matchMedia(COLUMNAS).matches;
    if (tipo === 'reveal-left') return lado ? { x: -60 } : { y: 48 };
    if (tipo === 'reveal-right') return lado ? { x: 60 } : { y: 48 };
    if (tipo === 'fade') return {};
    return { y: 48 };
}
const TIPOS = ['reveal', 'reveal-left', 'reveal-right', 'fade'];

const EASE = 'power3.out';

// Mientras GSAP anima, la transicion CSS del elemento (muchos botones tienen
// transition-all) perseguiria cada valor con su propio atraso: el elemento
// aparece y recien despues se mueve. Se apaga durante la animacion.
const INICIO: gsap.TweenVars = { autoAlpha: 0, transition: 'none' };

// Al terminar se borra todo lo que GSAP escribio en el elemento, para que el
// CSS vuelva a mandar. Sin esto quedan inline "scale: none" y "transition:
// none", y se pierden el hover:scale-102 y el active:scale-97 de Tailwind.
const FIN: gsap.TweenVars = {
    autoAlpha: 1,
    clearProps: 'transform,translate,rotate,scale,opacity,visibility,transition',
};

// Lo ya animado (o en camino): no se vuelve a tocar.
const tomados = new WeakSet<Element>();
// El ScrollTrigger de cada parallax, para matarlo si React lo saca del DOM.
const triggers = new Map<Element, ScrollTrigger>();

function nuevos<T extends Element>(lista: Iterable<T>) {
    const out: T[] = [];
    for (const el of lista) {
        if (tomados.has(el)) continue;
        tomados.add(el);
        out.push(el);
    }
    return out;
}

// Anima lo que entra en pantalla. Se usa IntersectionObserver y no
// ScrollTrigger: el observer avisa tambien por lo que YA esta visible cuando
// empieza a mirar (una portada, el footer de una pagina corta), y
// ScrollTrigger con eso fallaba y lo dejaba invisible hasta scrollear. Cada
// aviso trae todo lo que entro en el mismo frame: se anima junto y escalonado,
// en el orden de la pagina (dos columnas, una fila de tarjetas).
//
// El margen de abajo hace que arranque un poco despues de asomar, no con el
// primer pixel. Lo que queda pegado al final de la pagina (el footer) puede no
// cruzar nunca ese margen, porque no hay mas scroll: para eso esta alFondo().
function observador(hacia: gsap.TweenVars) {
    const mirando = new Set<Element>();
    const animar = (elementos: Element[]) => {
        const lote = [...elementos].sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        );
        for (const el of lote) {
            io.unobserve(el);
            mirando.delete(el);
        }
        if (lote.length) gsap.to(lote, { ...hacia, overwrite: true });
    };
    const io = new IntersectionObserver(
        (entradas) => animar(entradas.filter((e) => e.isIntersecting).map((e) => e.target)),
        { rootMargin: '0px 0px -40px 0px' }
    );
    return {
        // Cerca del final de la pagina, todo lo que asoma ya entro: queda tan
        // poco scroll que quizas nunca cruce el margen (en una pantalla
        // grande, el footer asoma 76px y la pagina scrollea 8).
        alFondo() {
            const fondo = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 100;
            if (!fondo) return;
            animar([...mirando].filter((el) => el.getBoundingClientRect().top < window.innerHeight));
        },
        observar(elementos: Element[]) {
            for (const el of elementos) {
                mirando.add(el);
                io.observe(el);
            }
        },
        // Lo que React saco de la pagina antes de que entrara en pantalla.
        soltar() {
            for (const el of mirando) {
                if (el.isConnected) continue;
                io.unobserve(el);
                mirando.delete(el);
            }
        },
    };
}

let reveal: ReturnType<typeof observador>;
let escalonado: ReturnType<typeof observador>;

function alFondo() {
    reveal.alFondo();
    escalonado.alFondo();
}

function animar() {
    for (const grupo of nuevos(document.querySelectorAll('[data-anim="intro"]'))) {
        // El estado inicial va con set y no como el "from" de un fromTo: con
        // delay, fromTo no lo aplica hasta que el delay termina, y el hero se
        // veia entero ~100 ms (ya sin anim-pendiente) antes de esconderse.
        gsap.set(grupo.children, { ...INICIO, y: 40 });
        gsap.to(grupo.children, {
            ...FIN,
            y: 0,
            duration: 0.9,
            ease: EASE,
            stagger: 0.12,
            delay: 0.1,
        });
    }

    const selector = TIPOS.map((t) => `[data-anim="${t}"]`).join(',');
    const reveals = nuevos(document.querySelectorAll<HTMLElement>(selector));
    for (const el of reveals) {
        gsap.set(el, { ...INICIO, ...desde(el.dataset.anim!) });
    }
    reveal.observar(reveals);

    // Los hijos, no el grupo: asi tambien entran los que se agreguen despues.
    const hijos = nuevos(document.querySelectorAll('[data-anim-stagger] > *'));
    gsap.set(hijos, { ...INICIO, y: 32 });
    escalonado.observar(hijos);

    for (const el of nuevos(document.querySelectorAll<HTMLElement>('[data-parallax]'))) {
        const tween = gsap.to(el, {
            y: () => Number(el.dataset.parallax) || 0,
            ease: 'none',
            scrollTrigger: {
                trigger: el,
                start: 'top bottom',
                end: 'bottom top',
                scrub: true,
                invalidateOnRefresh: true,
            },
        });
        if (tween.scrollTrigger) triggers.set(el, tween.scrollTrigger);
    }
}

// Lo que React saco de la pagina: si no, queda midiendo elementos que ya no
// existen.
function limpiar() {
    reveal.soltar();
    escalonado.soltar();
    for (const [el, trigger] of triggers) {
        if (!el.isConnected) {
            trigger.kill();
            triggers.delete(el);
        }
    }
}

export function initAnimaciones(lenis: Lenis | null) {
    const listo = () =>
        document.documentElement.classList.remove('anim-pendiente');

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Lenis mueve el scroll por su cuenta: ScrollTrigger tiene que
        // enterarse en cada frame o los disparos llegan tarde.
        const sync = () => ScrollTrigger.update();
        lenis?.on('scroll', sync);

        reveal = observador({ ...FIN, x: 0, y: 0, duration: 0.9, ease: EASE, stagger: 0.12 });
        escalonado = observador({ ...FIN, y: 0, duration: 0.7, ease: 'power2.out', stagger: 0.08 });
        animar();
        listo();
        requestAnimationFrame(alFondo);
        window.addEventListener('scroll', alFondo, { passive: true });

        const observer = new MutationObserver(animar);
        observer.observe(document.body, { childList: true, subtree: true });

        // Si cambia el alto de la pagina (termino de cargar una lista, se
        // abrio un panel), cambia donde empieza cada animacion. Se mira el
        // alto y no cada cambio del DOM: un contador que cambia de texto cada
        // segundo no tiene por que recalcular todo. Agrupado, porque React
        // hace muchos cambios seguidos.
        let refresco: number | undefined;
        const resize = new ResizeObserver(() => {
            clearTimeout(refresco);
            refresco = window.setTimeout(() => {
                limpiar();
                ScrollTrigger.refresh();
                alFondo();
            }, 200);
        });
        resize.observe(document.body);

        return () => {
            observer.disconnect();
            resize.disconnect();
            window.removeEventListener('scroll', alFondo);
            lenis?.off('scroll', sync);
        };
    });

    // Con "reducir movimiento" no se anima nada, pero igual hay que mostrarlo.
    listo();

    // Las imagenes que terminan de cargar corren el alto de la pagina.
    if (document.readyState === 'complete') ScrollTrigger.refresh();
    else window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}
