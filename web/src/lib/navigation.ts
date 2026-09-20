// Equivalentes de lo que en Next daba `next/navigation`.
//
// La diferencia de fondo: Next trae un router de cliente que cambia de pantalla
// sin recargar. Astro no — cada pantalla es un documento propio. Para este sitio
// da igual (son pantallas independientes, no una app de una sola vista), y a
// cambio cada una carga solo su JavaScript.
//
// Se escriben como funciones y no como hooks donde se puede, para no obligar a
// que todo lo que navegue sea un componente de React.

import { useEffect, useState } from "react";

/// Ir a otra pantalla. Reemplaza a `router.push(...)`.
export function goTo(url: string) {
  window.location.href = url;
}

/// Ir sin dejar la pantalla actual en el historial: el boton "atras" del
/// navegador saltea esta. Reemplaza a `router.replace(...)`.
export function replaceWith(url: string) {
  window.location.replace(url);
}

/// Los parametros de la URL (`?id=123`). Reemplaza a `useSearchParams()`.
///
/// Se leen de entrada, no despues del primer render: asi quien los usa no tiene
/// que contemplar un estado "todavia no se". En el servidor no hay URL del
/// navegador, asi que ahi devuelve vacio — para una isla `client:only`, que es
/// donde se usa, eso no llega a pintarse nunca.
export function useSearchParams(): URLSearchParams {
  const [params] = useState(() =>
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search),
  );

  return params;
}

/// Un parametro suelto de la URL, que es el caso habitual.
export function useSearchParam(nombre: string): string | null {
  return useSearchParams().get(nombre);
}

/// La ruta actual, sin dominio ni parametros. Reemplaza a `usePathname()`.
export function usePathname(): string | null {
  const [ruta, setRuta] = useState<string | null>(null);

  useEffect(() => {
    setRuta(window.location.pathname);
  }, []);

  return ruta;
}
