import type { CartaPack } from '@/lib/packs';

const ANCHO_CARTA = 640;
const ALTO_CARTA = 888;

const CHAMPAGNE = '#aea35d';

let logo: Promise<HTMLImageElement> | null = null;

const cargarImagen = (src: string) =>
    new Promise<HTMLImageElement>((ok, mal) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => ok(img);
        img.onerror = mal;
        img.src = src;
    });

export async function prepararTexturas() {
    logo ??= cargarImagen('/brand/logo-icon.svg');
    await Promise.all([
        logo,
        document.fonts.load('700 64px gardein'),
        document.fonts.load('400 32px acme-gothic-condensed'),
        document.fonts.load('700 32px acme-gothic-extrawide'),
    ]);
}

function lienzo(ancho: number, alto: number) {
    const c = document.createElement('canvas');
    c.width = ancho;
    c.height = alto;
    return [c, c.getContext('2d')!] as const;
}

function dorado(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#ece3a8');
    g.addColorStop(0.3, CHAMPAGNE);
    g.addColorStop(0.62, '#6f6224');
    g.addColorStop(1, '#c9bb6c');
    return g;
}

async function logoTenido(
    ancho: number,
    relleno: (ctx: CanvasRenderingContext2D) => string | CanvasGradient
) {
    const img = await logo!;
    const alto = (ancho * 352) / 274;
    const [c, ctx] = lienzo(ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = relleno(ctx);
    ctx.fillRect(0, 0, ancho, alto);
    return c;
}

function rectRedondo(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function rayos(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radio: number,
    color: string
) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 40) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * radio, cy + Math.sin(a) * radio);
        ctx.stroke();
    }
    ctx.restore();
}

export interface MapaDistancia {
    ancho: number;
    alto: number;
    datos: Float32Array;
}

function mapaDistancia(img: ImageData, W: number, H: number): MapaDistancia {
    const ancho = 220;
    const alto = Math.round((ancho * H) / W);
    const d = new Float32Array(ancho * alto);
    for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
            const px = Math.floor(((x + 0.5) / ancho) * W);
            const py = Math.floor(((y + 0.5) / alto) * H);
            const borde =
                x === 0 || y === 0 || x === ancho - 1 || y === alto - 1;
            d[y * ancho + x] =
                !borde && img.data[(py * W + px) * 4 + 3] > 127 ? 1e9 : 0;
        }
    }
    const D = Math.SQRT2;
    const ver = (x: number, y: number) =>
        x < 0 || y < 0 || x >= ancho || y >= alto ? 0 : d[y * ancho + x];
    for (let y = 0; y < alto; y++)
        for (let x = 0; x < ancho; x++) {
            const k = y * ancho + x;
            d[k] = Math.min(
                d[k],
                ver(x - 1, y) + 1,
                ver(x, y - 1) + 1,
                ver(x - 1, y - 1) + D,
                ver(x + 1, y - 1) + D
            );
        }
    for (let y = alto - 1; y >= 0; y--)
        for (let x = ancho - 1; x >= 0; x--) {
            const k = y * ancho + x;
            d[k] = Math.min(
                d[k],
                ver(x + 1, y) + 1,
                ver(x, y + 1) + 1,
                ver(x + 1, y + 1) + D,
                ver(x - 1, y + 1) + D
            );
        }
    for (let k = 0; k < d.length; k++) d[k] /= ancho;
    return { ancho, alto, datos: d };
}

function metalNegro(color: HTMLImageElement, metal: HTMLImageElement) {
    const [cc, cctx] = lienzo(metal.width, metal.height);
    cctx.drawImage(color, 0, 0, metal.width, metal.height);
    const c = cctx.getImageData(0, 0, metal.width, metal.height).data;
    const [mc, mctx] = lienzo(metal.width, metal.height);
    mctx.drawImage(metal, 0, 0);
    const m = mctx.getImageData(0, 0, metal.width, metal.height);
    for (let i = 0; i < c.length; i += 4) {
        const luz = (c[i] + c[i + 1] + c[i + 2]) / 3;
        const negro = Math.min(1, Math.max(0, (40 - luz) / 30));
        const v = m.data[i] * (1 - negro) + 255 * negro;
        m.data[i] = m.data[i + 1] = m.data[i + 2] = v;
    }
    mctx.putImageData(m, 0, 0);
    cc.width = 0;
    return mc;
}

let pack: Promise<{
    color: HTMLImageElement;
    metal: HTMLCanvasElement;
    brillo: HTMLImageElement;
    distancia: MapaDistancia;
}> | null = null;

export function texturasPack() {
    pack ??= Promise.all(
        ['color', 'metal', 'brillo'].map((n) => cargarImagen(`/packs/pack-${n}.webp`))
    )
        .then(([color, metal, brillo]) => {
            const ancho = 220;
            const alto = Math.round((ancho * color.height) / color.width);
            const [, ctx] = lienzo(ancho, alto);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(color, 0, 0, ancho, alto);
            const distancia = mapaDistancia(ctx.getImageData(0, 0, ancho, alto), ancho, alto);
            return { color, metal: metalNegro(color, metal), brillo, distancia };
        })
        .catch((e) => {
            pack = null;
            throw e;
        });
    return pack;
}

let dorso: Promise<HTMLCanvasElement> | null = null;

export function precalentar() {
    return prepararTexturas().then(() =>
        Promise.all([texturasPack(), texturaDorsoGuardada()])
    );
}

export function texturaDorsoGuardada() {
    dorso ??= texturaDorso();
    return dorso;
}

async function texturaDorso() {
    const W = ANCHO_CARTA;
    const H = ALTO_CARTA;
    const [c, ctx] = lienzo(W, H);
    ctx.fillStyle = '#000';
    rectRedondo(ctx, 0, 0, W, H, W * 0.05);
    ctx.fill();
    ctx.strokeStyle = 'rgba(174,163,93,0.5)';
    ctx.lineWidth = 3;
    rectRedondo(ctx, 2, 2, W - 4, H - 4, W * 0.05 - 2);
    ctx.stroke();
    ctx.save();
    rectRedondo(ctx, 30, 30, W - 60, H - 60, 18);
    ctx.clip();
    rayos(ctx, W / 2, H / 2, H, 'rgba(174,163,93,0.1)');
    ctx.restore();
    ctx.strokeStyle = dorado(ctx, 0, W);
    ctx.lineWidth = 3;
    rectRedondo(ctx, 30, 30, W - 60, H - 60, 18);
    ctx.stroke();
    rectRedondo(ctx, 40, 40, W - 80, H - 80, 12);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const icono = await logoTenido(W * 0.38, (x) => dorado(x, 0, W * 0.38));
    ctx.drawImage(icono, (W - icono.width) / 2, (H - icono.height) / 2);
    return c;
}

export async function texturaFrente(carta: CartaPack) {
    const W = ANCHO_CARTA;
    const H = ALTO_CARTA;
    const [c, ctx] = lienzo(W, H);
    const img = await cargarImagen(carta.imagen);
    rectRedondo(ctx, 0, 0, W, H, W * 0.05);
    ctx.clip();
    ctx.drawImage(img, 0, 0, W, H);
    return c;
}

export function texturaHalo() {
    const S = 256;
    const [c, ctx] = lienzo(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return c;
}
