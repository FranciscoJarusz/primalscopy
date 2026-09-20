// gif.js no publica tipos y no existe un @types para el. El proyecto de Next
// convivia con esto porque tiene apagada la verificacion de TypeScript en el
// build; aca preferimos declarar lo poco que usamos y no apagar nada.
declare module "gif.js/dist/gif.js" {
  interface OpcionesGif {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
    transparent?: string | number | null;
    background?: string;
    repeat?: number;
    dither?: boolean | string;
  }

  interface OpcionesCuadro {
    delay?: number;
    copy?: boolean;
    dispose?: number;
  }

  export default class GIF {
    constructor(opciones?: OpcionesGif);
    addFrame(
      imagen: CanvasImageSource | CanvasRenderingContext2D | ImageData,
      opciones?: OpcionesCuadro,
    ): void;
    on(evento: "finished", cb: (blob: Blob) => void): void;
    on(evento: "progress", cb: (progreso: number) => void): void;
    on(evento: "abort" | "start", cb: () => void): void;
    render(): void;
    abort(): void;
  }
}
