declare module 'gif.js' {
  interface GifOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
  }

  interface GifAddFrameOptions {
    copy?: boolean;
    delay?: number;
  }

  export default class GIF {
    constructor(options?: GifOptions);
    addFrame(image: CanvasImageSource, options?: GifAddFrameOptions): void;
    on(event: 'finished', callback: (blob: Blob) => void): void;
    on(event: 'abort', callback: () => void): void;
    render(): void;
  }
}

declare module 'gif.js/dist/gif.js' {
  interface GifOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
  }

  interface GifAddFrameOptions {
    copy?: boolean;
    delay?: number;
  }

  export default class GIF {
    constructor(options?: GifOptions);
    addFrame(image: CanvasImageSource, options?: GifAddFrameOptions): void;
    on(event: 'finished', callback: (blob: Blob) => void): void;
    on(event: 'abort', callback: () => void): void;
    render(): void;
  }
}

declare module 'gifuct-js' {
  export function parseGIF(buffer: ArrayBuffer): unknown;
  export function decompressFrames(gif: unknown, buildImagePatches: boolean): unknown[];
}
