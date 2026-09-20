// src/lib/avatarPrimal.ts
//
// Qué Primal usamos como foto de perfil de cada wallet.
//
// La búsqueda de NFTs recorre la colección y es cara, así que el header no la
// repite: cuando el selector ya cargó los NFTs deja acá el primero, y el avatar
// lo lee de la memoria del navegador. Mientras eso no haya pasado, el avatar se
// dibuja a partir de la dirección y nadie ve un hueco.

const CLAVE = "primal-avatar";

export type PrimalGuardado = { tokenId: string; imageUrl?: string };

type Mapa = Record<string, PrimalGuardado>;

function leerMapa(): Mapa {
    if (typeof window === "undefined") return {};
    try {
        return JSON.parse(localStorage.getItem(CLAVE) || "{}") as Mapa;
    } catch {
        return {};
    }
}

/// El selector llama a esto cuando ya sabe qué Primals tiene la wallet.
export function recordarPrimal(direccion: string, primal: PrimalGuardado) {
    if (typeof window === "undefined" || !direccion) return;
    try {
        const mapa = leerMapa();
        mapa[direccion.toLowerCase()] = primal;
        localStorage.setItem(CLAVE, JSON.stringify(mapa));
        // El avatar puede estar montado en otra parte del arbol: este aviso es
        // la forma de que se entere sin pasar props por toda la aplicacion.
        window.dispatchEvent(new CustomEvent("primal-avatar-cambio"));
    } catch {
        // Si no se puede guardar (modo privado, sin espacio), el avatar
        // generado sigue funcionando: no vale la pena romper nada por esto.
    }
}

export function leerPrimal(direccion: string): PrimalGuardado | null {
    if (!direccion) return null;
    return leerMapa()[direccion.toLowerCase()] ?? null;
}

/// Si la wallet se desconecta no borramos nada: cuando vuelva, su foto ya está.
export function olvidarPrimal(direccion: string) {
    if (typeof window === "undefined" || !direccion) return;
    try {
        const mapa = leerMapa();
        delete mapa[direccion.toLowerCase()];
        localStorage.setItem(CLAVE, JSON.stringify(mapa));
        window.dispatchEvent(new CustomEvent("primal-avatar-cambio"));
    } catch {
        /* igual que arriba */
    }
}
