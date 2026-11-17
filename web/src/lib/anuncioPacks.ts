import { configCompartida, type TemaPacks } from '@/lib/packs';

// Lo que anuncia los packs (barra, boton del hero, item del menu) lleva
// data-si-packs y se muestra solo con data-packs en <html>; lo que tiene
// data-no-packs se oculta en ese momento (ver global.css). BaseLayout lo pone
// antes de pintar si la ultima visita vio el juego abierto, para que la barra
// no aparezca tarde y empuje la pagina; aca se confirma con el backend.
// Con data-packs-cult (temporada actual con tema del sitio) se ve lo marcado
// con data-tema-cult y se oculta lo de data-tema-mudwater, y al reves.

const CACHE = 'primal_packs_estado';
const TEMA = 'primal_packs_tema';
const VIDA_MS = 5 * 60 * 1000;

const cerradoDe = (tema: TemaPacks) =>
    tema === 'cult' ? 'primal_anuncio_packs_cerrado' : 'primal_anuncio_mudwater_cerrado';

type Estado = { status: string; theme: TemaPacks };

async function estado(): Promise<Estado | null> {
    try {
        const guardado = JSON.parse(sessionStorage.getItem(CACHE) ?? 'null');
        if (guardado?.theme && Date.now() - guardado.at < VIDA_MS) return guardado;
    } catch {}
    try {
        const config = await configCompartida({ actual: true });
        const actual: Estado = { status: config.status, theme: config.theme === 'cult' ? 'cult' : 'mudwater' };
        try {
            sessionStorage.setItem(CACHE, JSON.stringify({ ...actual, at: Date.now() }));
        } catch {}
        return actual;
    } catch {
        return null;
    }
}

const ABIERTO = 'primal_packs_abierto';

function leer(clave: string) {
    try {
        return localStorage.getItem(clave);
    } catch {
        return null;
    }
}

function rutas(tema: TemaPacks) {
    for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-packs-ruta]'))
        a.href = tema === 'cult' ? '/packs' : '/mudwater';
}

export async function iniciarAnuncioPacks() {
    const html = document.documentElement;
    let tema: TemaPacks = leer(TEMA) === 'cult' ? 'cult' : 'mudwater';
    rutas(tema);
    for (const boton of document.querySelectorAll('[data-anuncio-cerrar]'))
        boton.addEventListener('click', () => {
            try {
                localStorage.setItem(cerradoDe(tema), '1');
            } catch {}
            html.setAttribute('data-anuncio-cerrado', '');
        });
    const actual = await estado();
    if (actual === null) return;
    tema = actual.theme;
    html.toggleAttribute('data-packs', actual.status === 'open');
    html.toggleAttribute('data-packs-cult', tema === 'cult');
    html.toggleAttribute('data-anuncio-cerrado', leer(cerradoDe(tema)) === '1');
    rutas(tema);
    try {
        if (actual.status === 'open') localStorage.setItem(ABIERTO, '1');
        else localStorage.removeItem(ABIERTO);
        localStorage.setItem(TEMA, tema);
    } catch {}
}
