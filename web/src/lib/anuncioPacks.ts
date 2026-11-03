import { configCompartida } from '@/lib/packs';

// Lo que anuncia los packs (barra, boton del hero, item del menu) lleva
// data-si-packs y se muestra solo con data-packs en <html>; lo que tiene
// data-no-packs se oculta en ese momento (ver global.css). BaseLayout lo pone
// antes de pintar si la ultima visita vio el juego abierto, para que la barra
// no aparezca tarde y empuje la pagina; aca se confirma con el backend.

const CACHE = 'primal_packs_estado';
const CERRADO = 'primal_anuncio_mudwater_cerrado';
const VIDA_MS = 5 * 60 * 1000;

async function estado(): Promise<string | null> {
    try {
        const guardado = JSON.parse(sessionStorage.getItem(CACHE) ?? 'null');
        if (guardado && Date.now() - guardado.at < VIDA_MS) return guardado.status;
    } catch {}
    try {
        const { status } = await configCompartida();
        try {
            sessionStorage.setItem(CACHE, JSON.stringify({ status, at: Date.now() }));
        } catch {}
        return status;
    } catch {
        return null;
    }
}

const ABIERTO = 'primal_packs_abierto';

export async function iniciarAnuncioPacks() {
    const html = document.documentElement;
    const status = await estado();
    if (status !== null) {
        html.toggleAttribute('data-packs', status === 'open');
        try {
            if (status === 'open') localStorage.setItem(ABIERTO, '1');
            else localStorage.removeItem(ABIERTO);
        } catch {}
    }
    for (const boton of document.querySelectorAll('[data-anuncio-cerrar]'))
        boton.addEventListener('click', () => {
            try {
                localStorage.setItem(CERRADO, '1');
            } catch {}
            html.setAttribute('data-anuncio-cerrado', '');
        });
}
