// La miniatura animada de un trait: el mismo GIF en WebP, que el backend
// genera y guarda la primera vez que se pide (ver backend/lib/traitThumbs.js).
//
//   chica (default)  256 px, liviana: para las grillas.
//   grande           640 px sin perdida: para previews que se ven grandes,
//                    como las opciones del Forge.
//   grilla           500 px sin perdida, el arte en su tamaño real: la
//                    grilla del customizer.
//   preview          1000 px sin perdida, con los pixeles intactos: las capas
//                    del preview del customizer.
//
// Las exportaciones siguen usando el GIF original. `version` sirve para
// saltear la cache del navegador cuando el trait se reemplaza (el panel de
// admin pasa la fecha del archivo).
export type TamanoMiniatura = 'chica' | 'grande' | 'grilla' | 'preview';

export function miniaturaDeTrait(
    url: string,
    {
        version,
        grande = false,
        tamano = grande ? 'grande' : 'chica',
    }: { version?: string | number; grande?: boolean; tamano?: TamanoMiniatura } = {}
) {
    const mini = url.replace('/assets/traits/', '/assets/thumbs/');
    const params = new URLSearchParams();
    if (tamano !== 'chica') params.set('t', tamano);
    if (version !== undefined) params.set('v', String(version));
    const query = params.toString();
    return query ? `${mini}?${query}` : mini;
}
