import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

const DURACION = 1.8;

let lenis: Lenis | null = null;

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
            node.closest('[data-lenis-prevent], w3m-modal, appkit-modal') !==
            null,
    });

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
