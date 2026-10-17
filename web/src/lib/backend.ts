// Donde esta el backend (Express en Railway). Un solo lugar para todo el sitio.
//
// BACKEND_URL es la API (/api/...). BACKEND_BASE_URL es la raiz del server,
// de donde salen los archivos (traits, miniaturas, imagenes del feed): se
// deduce de la API salvo que alguna vez se sirvan desde otro lado.
export const BACKEND_URL: string =
    import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';

export const BACKEND_BASE_URL: string =
    import.meta.env.PUBLIC_BACKEND_BASE_URL || BACKEND_URL.replace(/\/api\/?$/, '');
