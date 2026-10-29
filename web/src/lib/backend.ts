// Donde esta el backend (Express en Railway). Un solo lugar para todo el sitio.
//
// BACKEND_URL es la API (/api/...). BACKEND_BASE_URL es la raiz del server,
// de donde salen los archivos (traits, miniaturas, imagenes del feed): se
// deduce de la API salvo que alguna vez se sirvan desde otro lado.
export const BACKEND_URL: string =
    import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';

export const BACKEND_BASE_URL: string =
    import.meta.env.PUBLIC_BACKEND_BASE_URL || BACKEND_URL.replace(/\/api\/?$/, '');

/// El origen publico del sitio: https salvo en localhost (detras del tunel o de
/// Vercel el pedido llega por http, y X no carga imagenes por http).
export function origenPublico(url: URL): string {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return local ? url.origin : `https://${url.host}`;
}

/// BACKEND_URL absoluta, para pedirle al backend desde el servidor: con el
/// tunel (.\dev.ps1 share) es relativa (/backend/api).
export function backendAbsoluto(url: URL): string {
    return BACKEND_URL.startsWith('/') ? new URL(BACKEND_URL, origenPublico(url)).href : BACKEND_URL;
}
