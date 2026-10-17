// Los Primals que estan entrenando, de todas las wallets, dispersos en su
// region del mapa de staking. Pueden ser cientos (la coleccion tiene 2712),
// asi que no van en el SVG: se dibujan en un <canvas> encima, que con cientos
// de imagenes rinde mucho mejor durante los zooms. Esta clase no usa React: el
// Mapa le pasa la camara, los datos y la region elegida, y ella se redibuja.
//
// Donde se para cada uno: los lugares de cada region salen de un muestreo de
// "mejor candidato" (Mitchell) con semilla fija. Cada lugar nuevo es, entre
// varios candidatos al azar, el mas lejano a los que ya habia: asi, para
// cualquier cantidad, los primeros N lugares quedan repartidos parejo. El
// i-esimo Primal que entro a entrenar va al lugar i (el backend los manda en
// ese orden), y el que llega despues no mueve a los que ya estaban.

import { FORMAS, LAGOS } from './mapaDatos';

export type Vista = { cx: number; cy: number; escala: number };
export type RegionPrimals = {
    id: string;
    color: string;
    // Donde va el nombre de la region, en coordenadas del mundo, y cuanto
    // ocupa: ahi no se para nadie.
    etiqueta: { x: number; y: number };
    anchoEtiqueta: number;
    ids: string[];
};
export type Marcador = { tokenId: string; region: string; mio: boolean; x: number; y: number; r: number };

const DX = 110;
const DY = 90;

// --- Geometria ---------------------------------------------------------------

type Poligono = number[]; // x0, y0, x1, y1, ...

function poligonos(d: string): Poligono[] {
    return d
        .split('M')
        .filter((s) => s.trim())
        .map((s) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number));
}

function semilla(texto: string) {
    let n = 0;
    for (const c of texto) n = (Math.imul(n, 31) + c.charCodeAt(0)) | 0;
    return () => {
        n = (n + 0x6d2b79f5) | 0;
        let t = Math.imul(n ^ (n >>> 15), 1 | n);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const CELDA = 40;
// La mascara de cada region: un pixel cada MASCARA unidades del mundo.
const MASCARA = 2;
// Cuanto se aleja un Primal de la costa y de los lagos.
const MARGEN = 9;

// Los lugares de una region, en coordenadas del mundo. Se extienden a pedido
// y siempre dan la misma secuencia.
class Lugares {
    private caja = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    private azar: () => number;
    // Los puntos ya puestos, por celda de la grilla (indices en `puntos`).
    private grilla: number[][] = [];
    private columnas = 0;
    private filas = 0;
    readonly puntos: { x: number; y: number }[] = [];
    readonly area: number;

    constructor(id: string, etiqueta: { x: number; y: number }, anchoEtiqueta: number) {
        for (const p of poligonos(FORMAS[id])) {
            for (let i = 0; i < p.length; i += 2) {
                this.caja.x0 = Math.min(this.caja.x0, p[i]);
                this.caja.x1 = Math.max(this.caja.x1, p[i]);
                this.caja.y0 = Math.min(this.caja.y0, p[i + 1]);
                this.caja.y1 = Math.max(this.caja.y1, p[i + 1]);
            }
        }
        this.azar = semilla(id);

        // Donde se puede parar un Primal, dibujado una vez en una mascara: la
        // region, menos los lagos, menos una franja a lo largo de la costa y
        // de los lagos (el trazo grueso), menos el nombre. Probar contra los
        // poligonos (cientos de vertices) cada candidato trababa la carga.
        const c = this.caja;
        this.ancho = Math.ceil((c.x1 - c.x0) / MASCARA) + 1;
        this.alto = Math.ceil((c.y1 - c.y0) / MASCARA) + 1;
        const lienzo = document.createElement('canvas');
        lienzo.width = this.ancho;
        lienzo.height = this.alto;
        const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
        ctx.setTransform(1 / MASCARA, 0, 0, 1 / MASCARA, -c.x0 / MASCARA, -c.y0 / MASCARA);
        const region = new Path2D(FORMAS[id]);
        const lagos = new Path2D(LAGOS);
        ctx.fillStyle = '#fff';
        ctx.fill(region, 'evenodd');
        ctx.fillStyle = ctx.strokeStyle = '#000';
        ctx.fill(lagos, 'evenodd');
        ctx.lineWidth = MARGEN * 2;
        ctx.lineJoin = 'round';
        ctx.stroke(region);
        ctx.stroke(lagos);
        ctx.fillRect(etiqueta.x - anchoEtiqueta / 2, etiqueta.y - 40, anchoEtiqueta, 72);
        const datos = ctx.getImageData(0, 0, this.ancho, this.alto).data;
        this.mascara = new Uint8Array(this.ancho * this.alto);
        let validos = 0;
        for (let i = 0; i < this.mascara.length; i++) {
            if (datos[i * 4] > 127) {
                this.mascara[i] = 1;
                validos++;
            }
        }
        this.area = validos * MASCARA * MASCARA;
        this.columnas = Math.ceil((c.x1 - c.x0) / CELDA) + 1;
        this.filas = Math.ceil((c.y1 - c.y0) / CELDA) + 1;
        this.grilla = Array.from({ length: this.columnas * this.filas }, () => []);
    }

    private ancho: number;
    private alto: number;
    private mascara: Uint8Array;

    private enCaja(azar: () => number) {
        return {
            x: this.caja.x0 + azar() * (this.caja.x1 - this.caja.x0),
            y: this.caja.y0 + azar() * (this.caja.y1 - this.caja.y0),
        };
    }

    private valido({ x, y }: { x: number; y: number }) {
        const i = Math.round((x - this.caja.x0) / MASCARA);
        const j = Math.round((y - this.caja.y0) / MASCARA);
        return i >= 0 && j >= 0 && i < this.ancho && j < this.alto && this.mascara[j * this.ancho + i] === 1;
    }

    // La distancia al punto ya puesto mas cercano. Corta apenas encuentra uno
    // a menos de `limite`: ese candidato ya perdio contra el mejor que habia.
    // Con pocos puntos (que estan lejos) conviene recorrerlos todos; con
    // muchos, buscar en anillos de la grilla alrededor del candidato.
    private distancia(x: number, y: number, limite: number) {
        let mejor = Infinity;
        const tope = limite > 0 ? limite * limite : -1;
        const cerca = (k: number) => {
            const p = this.puntos[k];
            const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
            if (d < mejor) mejor = d;
            return mejor <= tope;
        };
        if (this.puntos.length < 80) {
            for (let k = 0; k < this.puntos.length; k++) if (cerca(k)) break;
            return Math.sqrt(mejor);
        }
        const gx = Math.floor((x - this.caja.x0) / CELDA);
        const gy = Math.floor((y - this.caja.y0) / CELDA);
        const celda = (i: number, j: number) => {
            if (i < 0 || j < 0 || i >= this.columnas || j >= this.filas) return false;
            for (const k of this.grilla[j * this.columnas + i]) if (cerca(k)) return true;
            return false;
        };
        for (let a = 0; a < Math.max(this.columnas, this.filas); a++) {
            if ((a - 1) * CELDA * ((a - 1) * CELDA) > mejor) break;
            // Solo el borde del anillo a.
            for (let i = -a; i <= a; i++) {
                if (celda(gx + i, gy - a) || (a > 0 && celda(gx + i, gy + a))) return Math.sqrt(mejor);
            }
            for (let j = -a + 1; j <= a - 1; j++) {
                if (celda(gx - a, gy + j) || celda(gx + a, gy + j)) return Math.sqrt(mejor);
            }
        }
        return Math.sqrt(mejor);
    }

    hasta(n: number) {
        while (this.puntos.length < n) {
            let elegido: { x: number; y: number } | null = null;
            let lejos = -1;
            for (let c = 0, intentos = 0; c < 20 && intentos < 600; intentos++) {
                const p = this.enCaja(this.azar);
                if (!this.valido(p)) continue;
                c++;
                const d = this.distancia(p.x, p.y, lejos);
                if (d > lejos) {
                    lejos = d;
                    elegido = p;
                }
            }
            if (!elegido) break;
            const i = Math.floor((elegido.x - this.caja.x0) / CELDA);
            const j = Math.floor((elegido.y - this.caja.y0) / CELDA);
            this.grilla[j * this.columnas + i].push(this.puntos.length);
            this.puntos.push(elegido);
        }
        return this.puntos;
    }
}

const lugaresPorRegion = new Map<string, Lugares>();
function lugares(r: RegionPrimals) {
    let l = lugaresPorRegion.get(r.id);
    if (!l) {
        l = new Lugares(r.id, r.etiqueta, r.anchoEtiqueta);
        lugaresPorRegion.set(r.id, l);
    }
    return l;
}

// --- Dibujo ------------------------------------------------------------------

type Sprite = { img: HTMLImageElement; listo: boolean };

// Los tamaños en pixeles a los que se hornea cada miniatura. En cada cuadro se
// usa el mas chico que alcance: achicar 600 imagenes de 96 px a 20 en cada
// cuadro del zoom trababa.
const NIVELES = [24, 48, 104];

// Una hoja por tamaño (y otra para los de la wallet, con borde amarillo) con
// todas las miniaturas ya recortadas en circulo. Dibujar de una sola hoja es
// mucho mas rapido que de cientos de canvas sueltos: la GPU no cambia de
// textura en cada Primal.
class Atlas {
    private canvas = document.createElement('canvas');
    private ctx: CanvasRenderingContext2D;
    private celda: number;
    private columnas = 32;
    private lugar = new Map<string, number>();

    constructor(
        private lado: number,
        private mio: boolean
    ) {
        // Un pixel de aire entre celdas para que al achicar no se mezclen.
        this.celda = lado + 2;
        this.canvas.width = this.columnas * this.celda;
        this.canvas.height = this.celda * 4;
        this.ctx = this.canvas.getContext('2d')!;
    }

    tiene(tokenId: string) {
        return this.lugar.has(tokenId);
    }

    hornear(tokenId: string, img: HTMLImageElement) {
        const n = this.lugar.size;
        const filas = Math.floor(n / this.columnas) + 1;
        if (filas * this.celda > this.canvas.height) {
            // Se llena: una hoja del doble de alto con lo que ya habia.
            const vieja = this.canvas;
            this.canvas = document.createElement('canvas');
            this.canvas.width = vieja.width;
            this.canvas.height = vieja.height * 2;
            this.ctx = this.canvas.getContext('2d')!;
            this.ctx.drawImage(vieja, 0, 0);
        }
        const x = (n % this.columnas) * this.celda + 1;
        const y = Math.floor(n / this.columnas) * this.celda + 1;
        const { ctx, lado, mio } = this;
        const borde = Math.max(1.5, (lado * (mio ? 7 : 4.5)) / 104);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + lado / 2, y + lado / 2, lado / 2 - borde / 2, 0, Math.PI * 2);
        ctx.save();
        ctx.clip();
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, lado, lado);
        ctx.restore();
        ctx.lineWidth = borde;
        ctx.strokeStyle = mio ? '#fdf468' : '#090050';
        ctx.stroke();
        ctx.restore();
        this.lugar.set(tokenId, n);
    }

    dibujar(destino: CanvasRenderingContext2D, tokenId: string, x: number, y: number, tam: number) {
        const n = this.lugar.get(tokenId);
        if (n === undefined) return false;
        const sx = (n % this.columnas) * this.celda + 1;
        const sy = Math.floor(n / this.columnas) * this.celda + 1;
        destino.drawImage(this.canvas, sx, sy, this.lado, this.lado, x, y, tam, tam);
        return true;
    }
}

// Los de la wallet pasean: cada tanto dan un saltito con un paso para un
// lado, y en el siguiente vuelven. Cada uno a su ritmo, sacado de su numero,
// para que no salten todos juntos. Solo ellos: animar cientos tendria al
// canvas redibujando sin parar, y ademas ayuda a encontrar los propios.
const SALTITO = 560;
function ritmo(tokenId: string) {
    let h = 0;
    for (const c of tokenId) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    h >>>= 0;
    return { periodo: 2400 + (h % 1800), fase: (h >>> 8) % 4000, lado: h & 1 ? 1 : -1 };
}

// Donde esta un Primal de la wallet en su paseo: corrimiento y altura, en
// radios.
function paseo(tokenId: string, ahora: number) {
    const { periodo, fase, lado } = ritmo(tokenId);
    const n = Math.floor((ahora + fase) / periodo);
    const t = (ahora + fase) % periodo;
    const lugar = (i: number) => (((i % 2) + 2) % 2) * lado * 0.9;
    if (t >= SALTITO) return { dx: lugar(n), dy: 0, espera: periodo - t };
    const p = t / SALTITO;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { dx: lugar(n - 1) + (lugar(n) - lugar(n - 1)) * e, dy: Math.sin(Math.PI * p) * 0.9, espera: 0 };
}

// El radio de los puntitos del mapa general, en pixeles de pantalla.
const PUNTO = 3.5;
const PUNTO_MIO = 5;

// Lo que en el resto del sitio es transition-all duration-300, aca a mano.
const DURACION = 300;
const suave = (t: number) => 1 - Math.pow(1 - t, 3);

// Rebote con un poco de pasada, para que "caigan" al mapa.
const rebote = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export class CapaPrimals {
    private ctx: CanvasRenderingContext2D;
    private vista: Vista = { cx: 0, cy: 0, escala: 1 };
    private w = 1;
    private h = 1;
    private dpr = 1;
    private marcadores: Marcador[] = [];
    private sprites = new Map<string, Sprite>();
    private atlas = new Map<string, Atlas>();
    private elegida: string | null = null;
    private resaltado: string | null = null;
    // Animaciones: cuando aparece cada uno y la ola de saltos de la region
    // elegida.
    private aparicion = new Map<string, number>();
    private ola: { region: string; x: number; y: number; t0: number } | null = null;
    private cuadro = 0;
    private quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // El proximo saltito de un Primal de la wallet: entre saltos no se
    // redibuja nada.
    private latido = 0;

    constructor(
        private canvas: HTMLCanvasElement,
        private url: (tokenId: string) => string
    ) {
        this.ctx = canvas.getContext('2d')!;
    }

    setDatos(regiones: RegionPrimals[], mios: Set<string>) {
        const ahora = performance.now();
        const antes = new Set(this.marcadores.map((m) => m.tokenId));
        const primeraVez = antes.size === 0;
        this.marcadores = regiones.flatMap((r) => {
            if (!r.ids.length) return [];
            const l = lugares(r);
            const puntos = l.hasta(r.ids.length);
            // Mas chicos cuantos mas haya en la region, para que entren sin
            // taparse; con tope, para que pocos no queden enormes.
            const radio = Math.min(13, Math.max(6, 0.42 * Math.sqrt(l.area / r.ids.length)));
            return r.ids.slice(0, puntos.length).map((tokenId, i) => ({
                tokenId,
                region: r.id,
                mio: mios.has(tokenId),
                x: puntos[i].x + DX,
                y: puntos[i].y + DY,
                r: radio,
            }));
        });
        // Los de la wallet arriba de todo.
        this.marcadores.sort((a, b) => Number(a.mio) - Number(b.mio));
        let n = 0;
        for (const m of this.marcadores) {
            if (antes.has(m.tokenId)) continue;
            // Al cargar caen todos de a poco; despues, solo los nuevos.
            this.aparicion.set(m.tokenId, ahora + (primeraVez ? 600 + Math.min(n++ * 6, 1400) : 0));
        }
        this.animar();
    }

    private sprite(tokenId: string) {
        let s = this.sprites.get(tokenId);
        if (!s) {
            const img = new Image();
            s = { img, listo: false };
            const sprite = s;
            img.decoding = 'async';
            // Se decodifica fuera del hilo principal antes de usarla: si no,
            // el primer drawImage la decodifica ahi, y al entrar a una region
            // eran cientos juntas.
            img.onload = async () => {
                await img.decode().catch(() => {});
                sprite.listo = true;
                this.pedir();
                this.precocinar();
            };
            img.src = this.url(tokenId);
            this.sprites.set(tokenId, s);
        }
        return s;
    }

    setVista(vista: Vista, w: number, h: number) {
        this.vista = vista;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (w !== this.w || h !== this.h || dpr !== this.dpr) {
            this.w = w;
            this.h = h;
            this.dpr = dpr;
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(h * dpr);
        }
        this.dibujar(performance.now());
    }

    setElegida(region: string | null) {
        if (region === this.elegida) return;
        // Se funde en 300 ms, igual que la sombra de su region (Mapa.tsx).
        this.atenuado = { antes: this.elegida, t0: performance.now() };
        this.elegida = region;
        this.animar();
    }

    private atenuado: { antes: string | null; t0: number } = { antes: null, t0: -Infinity };
    // Cuanto se ve la foto de los Primals de una region: 1 en la elegida, 0 en
    // las demas, y en el medio mientras se funde.
    private fotos(region: string, ahora: number) {
        const de = (elegida: string | null) => (elegida === region ? 1 : 0);
        const t = Math.min(1, (ahora - this.atenuado.t0) / DURACION);
        return de(this.atenuado.antes) + (de(this.elegida) - de(this.atenuado.antes)) * suave(t);
    }

    private opacidad(region: string, ahora: number) {
        const de = (elegida: string | null) => (elegida && elegida !== region ? 0.35 : 1);
        const t = Math.min(1, (ahora - this.atenuado.t0) / DURACION);
        return de(this.atenuado.antes) + (de(this.elegida) - de(this.atenuado.antes)) * suave(t);
    }

    // Cuanto crece cada Primal al pasarle el mouse: va y vuelve en 300 ms.
    private crecer = new Map<string, { desde: number; hasta: number; t0: number }>();
    private tamano(tokenId: string, ahora: number) {
        const c = this.crecer.get(tokenId);
        if (!c) return 1;
        const t = Math.min(1, (ahora - c.t0) / DURACION);
        if (t >= 1 && c.hasta === 1) this.crecer.delete(tokenId);
        return c.desde + (c.hasta - c.desde) * suave(t);
    }

    // Los Primals de la region saltan en ola desde donde se toco.
    saltar(region: string, x: number, y: number) {
        if (this.quieto) return;
        this.ola = { region, x, y, t0: performance.now() };
        this.animar();
    }

    setResaltado(tokenId: string | null) {
        if (tokenId === this.resaltado) return;
        const ahora = performance.now();
        if (this.resaltado) {
            this.crecer.set(this.resaltado, { desde: this.tamano(this.resaltado, ahora), hasta: 1, t0: ahora });
        }
        if (tokenId) this.crecer.set(tokenId, { desde: this.tamano(tokenId, ahora), hasta: 1.5, t0: ahora });
        this.resaltado = tokenId;
        this.animar();
    }

    // Donde esta un Primal, en coordenadas del SVG.
    posicion(tokenId: string) {
        const m = this.marcadores.find((x) => x.tokenId === tokenId);
        return m ? { x: m.x, y: m.y } : null;
    }

    // El Primal que se esta mirando con "My Primals": un anillo amarillo que
    // late un rato y despues queda quieto.
    private foco: { tokenId: string; t0: number } | null = null;
    enfocar(tokenId: string | null) {
        if ((this.foco?.tokenId ?? null) === tokenId) return;
        this.foco = tokenId ? { tokenId, t0: performance.now() } : null;
        this.animar();
    }

    // El Primal bajo un punto del SVG, si hay uno.
    enPunto(x: number, y: number): Marcador | null {
        for (let i = this.marcadores.length - 1; i >= 0; i--) {
            const m = this.marcadores[i];
            // Fuera de la region elegida es un puntito: se lo agarra con un
            // poco de margen, pero no con el tamaño de la foto.
            const radio = m.region === this.elegida ? m.r : Math.min(m.r, (PUNTO_MIO * 1.6) / this.vista.escala);
            if (Math.hypot(m.x - x, m.y - y) <= radio) return m;
        }
        return null;
    }

    destruir() {
        cancelAnimationFrame(this.cuadro);
        clearTimeout(this.latido);
        for (const s of this.sprites.values()) s.img.onload = null;
    }

    private hoja(nivel: number, mio: boolean) {
        const clave = `${nivel}${mio ? 'm' : ''}`;
        let a = this.atlas.get(clave);
        if (!a) {
            a = new Atlas(nivel, mio);
            this.atlas.set(clave, a);
        }
        return a;
    }

    // En los ratos libres hornea los tamaños chicos de todos, para que el
    // primer zoom no tenga que hacerlo.
    private cocinando = false;
    private precocinar() {
        if (this.cocinando) return;
        this.cocinando = true;
        const libre = window.requestIdleCallback ?? ((fn: IdleRequestCallback) => setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 50));
        const tanda = (plazo: IdleDeadline) => {
            for (const nivel of NIVELES.slice(0, 2)) {
                for (const m of this.marcadores) {
                    if (m.region !== this.elegida) continue;
                    if (plazo.timeRemaining() < 2) return void libre(tanda);
                    const s = this.sprites.get(m.tokenId);
                    const atlas = this.hoja(nivel, m.mio);
                    if (s?.listo && !atlas.tiene(m.tokenId)) atlas.hornear(m.tokenId, s.img);
                }
            }
            this.cocinando = false;
        };
        libre(tanda);
    }

    // Un redibujo en el proximo cuadro (varias imagenes que cargan juntas
    // cuentan como uno).
    private pedido = false;
    private pedir() {
        if (this.pedido) return;
        this.pedido = true;
        requestAnimationFrame((t) => {
            this.pedido = false;
            this.unaVez(t);
        });
    }

    // Un dibujo por cuadro como mucho: durante un vuelo la camara ya dibuja
    // (setVista) y la animacion del hover o del apagado lo repetia.
    private ultimo = { cuando: -Infinity, sigue: false };
    private unaVez(ahora: number) {
        if (performance.now() - this.ultimo.cuando < 8) return this.ultimo.sigue;
        return this.dibujar(ahora);
    }

    // Mientras haya algo animandose, un cuadro tras otro.
    private animar() {
        cancelAnimationFrame(this.cuadro);
        const paso = (t: number) => {
            const sigue = this.unaVez(t);
            if (sigue) this.cuadro = requestAnimationFrame(paso);
        };
        this.cuadro = requestAnimationFrame(paso);
    }

    // Devuelve si queda alguna animacion en curso.
    private dibujar(ahora: number) {
        const sigue = this.dibujarYa(ahora);
        this.ultimo = { cuando: performance.now(), sigue };
        return sigue;
    }

    private dibujarYa(ahora: number) {
        const { ctx, vista, w, h, dpr } = this;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // De coordenadas del SVG a pixeles del canvas.
        const k = vista.escala * dpr;
        ctx.setTransform(k, 0, 0, k, (w / 2 - vista.cx * vista.escala) * dpr, (h / 2 - vista.cy * vista.escala) * dpr);
        const x0 = vista.cx - w / 2 / vista.escala, x1 = vista.cx + w / 2 / vista.escala;
        const y0 = vista.cy - h / 2 / vista.escala, y1 = vista.cy + h / 2 / vista.escala;

        let sigue = false;
        // Hornear cuesta: unos milisegundos por cuadro como mucho, y los que
        // faltan se ven en otro tamaño (o como punto) hasta el siguiente. Al
        // cargar eran 600 en un solo cuadro.
        const horno = performance.now() + 4;
        // Y pocos por cuadro: subir cada foto a la GPU no cuenta en esos 4 ms
        // (se paga al mostrar el cuadro), y con las fotos ya decodificadas
        // entraban decenas juntas y ese cuadro se alargaba.
        let hornoCupo = 12;
        let faltan = false;
        let proximo = Infinity;
        if (ahora - this.atenuado.t0 < DURACION) sigue = true;
        const ola = this.ola;
        // El que esta bajo el mouse, arriba de sus vecinos: crece sobre ellos.
        const arriba = this.marcadores.find((m) => m.tokenId === this.resaltado);
        const orden = arriba ? [...this.marcadores.filter((m) => m !== arriba), arriba] : this.marcadores;
        const puntos = new Map<string, { mio: boolean; alfa: number; lista: { x: number; y: number; r: number }[] }>();
        let ultimo: { x: number; y: number; r: number; mio: boolean; alfa: number } | null = null;
        for (const m of orden) {
            if (m.x + m.r * 2 < x0 || m.x - m.r * 2 > x1 || m.y + m.r * 3 < y0 || m.y - m.r * 2 > y1) continue;

            // Aparicion: crece desde cero con un rebote.
            let escala = 1;
            const desde = this.aparicion.get(m.tokenId);
            if (desde !== undefined && !this.quieto) {
                const t = (ahora - desde) / 450;
                if (t >= 1) this.aparicion.delete(m.tokenId);
                else {
                    sigue = true;
                    escala = t <= 0 ? 0 : rebote(t);
                }
            }
            if (escala <= 0) continue;

            // La ola: cada uno salta cuando le llega, segun su distancia al
            // toque.
            let salto = 0;
            if (ola && ola.region === m.region) {
                const t = (ahora - ola.t0 - Math.hypot(m.x - ola.x, m.y - ola.y) * 0.9) / 420;
                if (t < 1) sigue = true;
                if (t > 0 && t < 1) salto = Math.sin(Math.PI * t) * m.r * 1.1;
            }

            const c = this.crecer.get(m.tokenId);
            if (c && ahora - c.t0 < DURACION) sigue = true;
            const r = m.r * escala * this.tamano(m.tokenId, ahora) * (m.mio ? 1.3 : 1);
            let x = m.x;
            if (m.mio && !this.quieto) {
                const p = paseo(m.tokenId, ahora);
                x += p.dx * m.r;
                salto += p.dy * m.r;
                proximo = Math.min(proximo, p.espera);
            }
            const y = m.y - salto;
            const alfa = this.opacidad(m.region, ahora);
            // En el mapa general es un puntito de tamaño fijo en pantalla; en
            // la region elegida, su foto. Al elegirla, el punto crece hasta la
            // foto (y al revés al cerrar).
            const fotos = this.fotos(m.region, ahora);
            const crece = escala * this.tamano(m.tokenId, ahora);
            const rPunto = Math.min(r, ((m.mio ? PUNTO_MIO : PUNTO) * crece) / vista.escala);
            const rFoto = rPunto + (r - rPunto) * fotos;
            let foto = false;
            if (fotos > 0) {
                // Las fotos se piden recien aca, con la region elegida.
                const s = this.sprite(m.tokenId);
                if (s.listo) {
                    const nivel = NIVELES.find((n) => n >= rFoto * 2 * k) ?? NIVELES[NIVELES.length - 1];
                    const atlas = this.hoja(nivel, m.mio);
                    if (!atlas.tiene(m.tokenId) && hornoCupo > 0 && performance.now() < horno) {
                        hornoCupo--;
                        atlas.hornear(m.tokenId, s.img);
                    }
                    ctx.globalAlpha = alfa * fotos;
                    foto = atlas.dibujar(ctx, m.tokenId, x - rFoto, y - rFoto, rFoto * 2);
                    if (!foto) {
                        faltan = true;
                        // Mientras no este el del tamaño justo, otro ya horneado.
                        for (const n of NIVELES) {
                            if (this.hoja(n, m.mio).dibujar(ctx, m.tokenId, x - rFoto, y - rFoto, rFoto * 2)) {
                                foto = true;
                                break;
                            }
                        }
                    }
                }
            }
            // El punto: mientras no hay foto (o mientras se funde con ella).
            const alfaPunto = foto ? alfa * (1 - fotos) : alfa;
            if (alfaPunto > 0.01) {
                const punto = { x, y, r: foto ? rFoto : rPunto };
                if (m === arriba) ultimo = { ...punto, mio: m.mio, alfa: alfaPunto };
                else {
                    const clave = `${m.mio ? 'm' : 'o'}${alfaPunto.toFixed(2)}`;
                    let tanda = puntos.get(clave);
                    if (!tanda) puntos.set(clave, (tanda = { mio: m.mio, alfa: alfaPunto, lista: [] }));
                    tanda.lista.push(punto);
                }
            }
        }

        // Los puntos van por tandas del mismo color y opacidad: un solo fill
        // por tanda en vez de uno por Primal.
        const borde = 1.2 / vista.escala;
        const pintarPuntos = (mio: boolean, alfa: number, lista: { x: number; y: number; r: number }[]) => {
            ctx.globalAlpha = alfa;
            ctx.beginPath();
            for (const p of lista) {
                ctx.moveTo(p.x + p.r, p.y);
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            }
            ctx.fillStyle = mio ? '#fdf468' : '#c3c8e0';
            ctx.fill();
            ctx.lineWidth = borde;
            ctx.strokeStyle = '#090050';
            ctx.stroke();
        };
        // Los de otros primero, los de la wallet arriba.
        for (const t of [...puntos.values()].sort((a, b) => Number(a.mio) - Number(b.mio))) {
            pintarPuntos(t.mio, t.alfa, t.lista);
        }
        if (ultimo) pintarPuntos(ultimo.mio, ultimo.alfa, [ultimo]);

        // El anillo del Primal enfocado: late 2,4 s (tres latidos) y queda.
        const f = this.foco && this.marcadores.find((m) => m.tokenId === this.foco!.tokenId);
        if (f && this.foco) {
            const t = (ahora - this.foco.t0) / 800;
            const late = !this.quieto && t < 3;
            if (late) sigue = true;
            const pulso = late ? Math.sin(Math.PI * (t % 1)) : 0;
            const base = f.r * 1.3 * (this.elegida === f.region ? 1 : 0.6);
            ctx.globalAlpha = 1;
            ctx.beginPath();
            // Sigue al Primal si esta paseando.
            const pp = f.mio && !this.quieto ? paseo(f.tokenId, ahora) : { dx: 0, dy: 0 };
            ctx.arc(f.x + pp.dx * f.r, f.y - pp.dy * f.r, base * 1.35 + (pulso * 10) / vista.escala, 0, Math.PI * 2);
            ctx.lineWidth = 3 / vista.escala;
            ctx.strokeStyle = '#fdf468';
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (!sigue && ola) this.ola = null;
        if (faltan && !sigue) this.pedir();
        // Mientras alguno de la wallet salta, cuadro a cuadro; si no, se
        // despierta para el proximo saltito.
        clearTimeout(this.latido);
        if (!sigue && proximo === 0) this.pedir();
        else if (!sigue && proximo < Infinity) this.latido = window.setTimeout(() => this.pedir(), proximo);
        return sigue;
    }
}
