import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

const DURACION = 1.8;

let lenis: Lenis | null = null;
let listaPuede = false;

function puedeScrollear(lista: HTMLElement, dy: number) {
    if (dy > 0) return lista.scrollTop + lista.clientHeight < lista.scrollHeight - 1;
    if (dy < 0) return lista.scrollTop > 0;
    return true;
}

function offsetHeader() {
    const header = document.querySelector<HTMLElement>('[data-header]');
    return header ? -(header.offsetHeight + 32) : 0;
}

export function initLenis() {
    if (lenis) return lenis;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        return null;

    lenis = new Lenis({
        duration: DURACION,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        autoRaf: true,
        prevent: (node) =>
            node.closest('w3m-modal, appkit-modal') !== null ||
            (listaPuede && node.closest('[data-scroll-propio]') !== null),
    });

    // La rueda dentro de una lista con scroll propio (data-scroll-propio) frena
    // a la pagina: si no, la inercia de DURACION la seguia bajando mientras la
    // lista tambien bajaba.
    document.addEventListener(
        'wheel',
        (e) => {
            const lista = (e.target as HTMLElement).closest?.<HTMLElement>('[data-scroll-propio]');
            listaPuede = Boolean(lista && puedeScrollear(lista, e.deltaY));
            if (listaPuede && lenis?.isScrolling) {
                lenis.scrollTo(lenis.animatedScroll, { immediate: true });
            }
        },
        { capture: true, passive: true }
    );

    document.addEventListener('click', (e: MouseEvent) => {
        const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
            'a[href^="#"]'
        );
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href === '#') return;

        const destino = document.querySelector<HTMLElement>(href);
        if (!destino) return;

        e.preventDefault();
        lenis?.scrollTo(destino, {
            duration: DURACION,
            offset: offsetHeader(),
        });
        history.pushState(null, '', href);
    });

    return lenis;
}

export function scrollToTop() {
    if (lenis) lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
}
