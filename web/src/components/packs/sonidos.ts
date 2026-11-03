import type { Sonido } from './escena3d';

const CLAVE = 'primal_packs_sonido';
const RUTA = '/packs/sonidos/';

const ARCHIVOS = {
    rasgar: ['rasgar-1', 'rasgar-2'],
    abanico: ['abanico'],
    deslizar: ['deslizar-1', 'deslizar-2', 'deslizar-3', 'deslizar-4'],
    apoyar: ['apoyar-1', 'apoyar-2', 'apoyar-3'],
    energia: ['energia'],
    viento: ['viento'],
    golpeSeco: ['golpe-seco'],
    hielo: ['hielo'],
    tierra: ['tierra'],
    tierra2: ['tierra-2'],
    explosion: ['explosion'],
    rayo: ['rayo'],
    destello: ['destello'],
    coro: ['fondo-coro'],
};
type Muestra = keyof typeof ARCHIVOS;

const FONDO_VOL = 0.22;
const FONDO_CORTE = 700;

let ctx: AudioContext | null = null;
let salida: GainNode;
let eco: GainNode;
const buffers: Partial<Record<Muestra, AudioBuffer[]>> = {};
const alRevesDe: Partial<Record<Muestra, AudioBuffer>> = {};
let carga: {
    fuente: AudioBufferSourceNode;
    filtro: BiquadFilterNode;
    vol: GainNode;
    sub: OscillatorNode;
    volSub: GainNode;
} | null = null;
let cama: {
    fuente: AudioBufferSourceNode;
    filtro: BiquadFilterNode;
    vol: GainNode;
} | null = null;
let quiereFondo = false;
let activo = leerPreferencia();

function leerPreferencia() {
    try {
        return localStorage.getItem(CLAVE) !== 'no';
    } catch {
        return true;
    }
}

export const sonidoActivo = () => activo;

export function activarSonido(si: boolean) {
    activo = si;
    try {
        localStorage.setItem(CLAVE, si ? 'si' : 'no');
    } catch {}
    if (!si) cargar(0);
    actualizarFondo();
}

function impulso(c: AudioContext, segundos: number) {
    const largo = Math.floor(c.sampleRate * segundos);
    const buffer = c.createBuffer(2, largo, c.sampleRate);
    for (let canal = 0; canal < 2; canal++) {
        const datos = buffer.getChannelData(canal);
        for (let i = 0; i < largo; i++)
            datos[i] = (Math.random() * 2 - 1) * (1 - i / largo) ** 3;
    }
    return buffer;
}

function alReves(c: AudioContext, b: AudioBuffer) {
    const r = c.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let canal = 0; canal < b.numberOfChannels; canal++)
        r.getChannelData(canal).set(
            b.getChannelData(canal).slice().reverse()
        );
    return r;
}

async function precargar(c: AudioContext) {
    await Promise.all(
        (Object.keys(ARCHIVOS) as Muestra[]).map(async (m) => {
            const lista = await Promise.all(
                ARCHIVOS[m].map(async (nombre) => {
                    const r = await fetch(`${RUTA}${nombre}.mp3`);
                    return c.decodeAudioData(await r.arrayBuffer());
                })
            );
            buffers[m] = lista;
        })
    );
    for (const m of ['tierra', 'explosion'] as const)
        if (buffers[m]) alRevesDe[m] = alReves(c, buffers[m][0]);
    actualizarFondo();
}

export function despertar() {
    try {
        if (!ctx) {
            ctx = new AudioContext();
            const compresor = ctx.createDynamicsCompressor();
            compresor.threshold.value = -12;
            compresor.ratio.value = 3;
            compresor.connect(ctx.destination);
            salida = ctx.createGain();
            salida.gain.value = 0.8;
            salida.connect(compresor);
            const sala = ctx.createConvolver();
            sala.buffer = impulso(ctx, 2.2);
            eco = ctx.createGain();
            eco.connect(sala).connect(salida);
            precargar(ctx).catch(() => {});
        }
        if (ctx.state === 'suspended') ctx.resume().then(actualizarFondo);
    } catch {
        ctx = null;
    }
}

function listo() {
    return activo && ctx && ctx.state === 'running' ? ctx : null;
}

function conectar(nodo: AudioNode, mojado: number) {
    nodo.connect(salida);
    if (mojado > 0) {
        const envio = ctx!.createGain();
        envio.gain.value = mojado;
        nodo.connect(envio).connect(eco);
    }
}

const azar = (min: number, max: number) => min + Math.random() * (max - min);

function tocar(
    c: AudioContext,
    m: Muestra | AudioBuffer,
    t: number,
    { vol = 1, tono = 1, variar = 0.04, mojado = 0, desde = 0 } = {}
) {
    const lista = typeof m === 'string' ? buffers[m] : [m];
    if (!lista?.length) return;
    const fuente = c.createBufferSource();
    fuente.buffer = lista[Math.floor(Math.random() * lista.length)];
    fuente.playbackRate.value = tono * azar(1 - variar, 1 + variar);
    const env = c.createGain();
    env.gain.value = vol;
    conectar(fuente.connect(env), mojado);
    fuente.start(Math.max(t, c.currentTime), desde);
}

function alRevesHasta(
    c: AudioContext,
    m: 'tierra' | 'explosion',
    pico: number,
    impacto: number,
    vol: number
) {
    const b = alRevesDe[m];
    if (!b) return;
    const momento = b.duration - pico;
    const inicio = impacto - momento;
    tocar(c, b, Math.max(inicio, c.currentTime), {
        vol,
        variar: 0,
        mojado: 0.3,
        desde: Math.max(0, -inicio + c.currentTime),
    });
}

function golpe(
    c: AudioContext,
    t: number,
    { desde = 110, hasta = 38, duracion = 0.6, vol = 0.5 } = {}
) {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(desde, t);
    osc.frequency.exponentialRampToValueAtTime(hasta, t + duracion * 0.6);
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    conectar(osc.connect(env), 0);
    osc.start(t);
    osc.stop(t + duracion + 0.05);
}

function retumbo(c: AudioContext, t: number, duracion: number, vol: number) {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(32, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + duracion);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + duracion * 0.97);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    conectar(osc.connect(env), 0);
    osc.start(t);
    osc.stop(t + duracion + 0.05);
}

export function fondo(si: boolean) {
    quiereFondo = si;
    actualizarFondo();
}

function actualizarFondo() {
    const c = listo();
    if (quiereFondo && c && !cama) {
        const buffer = buffers.coro?.[0];
        if (!buffer) return;
        const fuente = c.createBufferSource();
        fuente.buffer = buffer;
        fuente.loop = true;
        const filtro = c.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = FONDO_CORTE;
        const vol = c.createGain();
        vol.gain.setValueAtTime(0.0001, c.currentTime);
        vol.gain.exponentialRampToValueAtTime(FONDO_VOL, c.currentTime + 2.5);
        conectar(fuente.connect(filtro).connect(vol), 0.15);
        fuente.start(c.currentTime, azar(0, buffer.duration));
        cama = { fuente, filtro, vol };
    } else if ((!quiereFondo || !c) && cama && ctx) {
        const z = cama;
        cama = null;
        z.vol.gain.cancelScheduledValues(ctx.currentTime);
        z.vol.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
        z.fuente.stop(ctx.currentTime + 2);
    }
}

function florecer(
    c: AudioContext,
    t: number,
    { sube = 0.3, dura = 3, corte = 6000, vol = 0.5 } = {}
) {
    if (!cama) return;
    const { filtro, vol: g } = cama;
    for (const p of [filtro.frequency, g.gain]) p.cancelScheduledValues(t);
    filtro.frequency.setValueAtTime(filtro.frequency.value, t - sube);
    filtro.frequency.exponentialRampToValueAtTime(corte, t);
    filtro.frequency.setTargetAtTime(FONDO_CORTE, t + 0.4, dura / 3);
    g.gain.setValueAtTime(g.gain.value, t - sube);
    g.gain.linearRampToValueAtTime(vol, t);
    g.gain.setTargetAtTime(FONDO_VOL, t + 0.4, dura / 3);
}

export function cargar(p: number) {
    const c = listo();
    if (!c || p <= 0) {
        if (carga && ctx) {
            const z = carga;
            carga = null;
            z.vol.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
            z.volSub.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
            z.fuente.stop(ctx.currentTime + 0.3);
            z.sub.stop(ctx.currentTime + 0.3);
        }
        return;
    }
    const t = c.currentTime;
    if (!carga) {
        const buffer = buffers.energia?.[0];
        if (!buffer) return;
        const fuente = c.createBufferSource();
        fuente.buffer = buffer;
        fuente.loop = true;
        const filtro = c.createBiquadFilter();
        filtro.type = 'lowpass';
        const vol = c.createGain();
        vol.gain.value = 0.0001;
        conectar(fuente.connect(filtro).connect(vol), 0.25);
        fuente.start(t, azar(0, buffer.duration));
        const sub = c.createOscillator();
        sub.type = 'sine';
        const volSub = c.createGain();
        volSub.gain.value = 0.0001;
        conectar(sub.connect(volSub), 0);
        sub.start(t);
        carga = { fuente, filtro, vol, sub, volSub };
    }
    carga.fuente.playbackRate.setTargetAtTime(0.6 + 0.5 * p, t, 0.05);
    carga.filtro.frequency.setTargetAtTime(300 + 6000 * p * p, t, 0.05);
    carga.vol.gain.setTargetAtTime(0.08 + 0.5 * p, t, 0.05);
    carga.sub.frequency.setTargetAtTime(34 + 30 * p, t, 0.05);
    carga.volSub.gain.setTargetAtTime(0.4 * p * p, t, 0.05);
}

export function sonar(nombre: Sonido) {
    const c = listo();
    if (!c) return;
    const t = c.currentTime + 0.01;
    switch (nombre) {
        case 'rasgar':
            cargar(0);
            tocar(c, 'rasgar', t, { vol: 1, mojado: 0.1 });
            golpe(c, t, { desde: 140, hasta: 38, duracion: 0.7, vol: 0.55 });
            florecer(c, t + 0.05, { sube: 0.05, dura: 2, corte: 2500, vol: 0.35 });
            break;
        case 'subir':
            tocar(c, 'abanico', t, { vol: 0.75, mojado: 0.1 });
            tocar(c, 'viento', t, { vol: 0.3, mojado: 0.2 });
            break;
        case 'salir':
            tocar(c, 'deslizar', t, { vol: 0.55, tono: 1.1, variar: 0.08 });
            break;
        case 'inicio-common':
        case 'inicio-uncommon':
            tocar(c, 'deslizar', t, { vol: 0.5, variar: 0.08 });
            break;
        case 'inicio-rare':
            tocar(c, 'viento', t, { vol: 0.35, tono: 1.15, mojado: 0.2 });
            tocar(c, 'deslizar', t + 0.25, { vol: 0.6, variar: 0.08 });
            break;
        case 'inicio-epic':
            alRevesHasta(c, 'tierra', 0.47, t + 1.24, 0.6);
            retumbo(c, t, 1.24, 0.35);
            tocar(c, 'deslizar', t + 0.99, { vol: 0.6 });
            break;
        case 'inicio-legendary':
            tocar(c, 'deslizar', t, { vol: 0.5, tono: 0.9 });
            tocar(c, 'viento', t + 0.3, { vol: 0.4, tono: 0.8, mojado: 0.3 });
            alRevesHasta(c, 'tierra', 0.47, t + 2.6, 0.55);
            alRevesHasta(c, 'explosion', 0.19, t + 2.6, 0.6);
            retumbo(c, t + 0.4, 2.2, 0.5);
            florecer(c, t + 2.6, { sube: 2.2, dura: 0.1, corte: 1800, vol: 0.32 });
            break;
        case 'impacto-common':
            tocar(c, 'apoyar', t, { vol: 0.8 });
            tocar(c, 'golpeSeco', t, { vol: 0.25, variar: 0.08 });
            break;
        case 'impacto-uncommon':
            tocar(c, 'apoyar', t, { vol: 0.8 });
            tocar(c, 'golpeSeco', t, { vol: 0.45, tono: 0.9 });
            golpe(c, t, { vol: 0.3, duracion: 0.4 });
            break;
        case 'impacto-rare':
            tocar(c, 'apoyar', t, { vol: 0.85 });
            tocar(c, 'hielo', t, { vol: 0.55, variar: 0, mojado: 0.35 });
            golpe(c, t, { vol: 0.45 });
            florecer(c, t, { sube: 0.1, dura: 1.5, corte: 2000, vol: 0.3 });
            break;
        case 'impacto-epic':
            golpe(c, t, { desde: 130, hasta: 34, duracion: 0.9, vol: 0.7 });
            tocar(c, 'tierra', t, { vol: 0.75, variar: 0, mojado: 0.25 });
            tocar(c, 'hielo', t, { vol: 0.4, tono: 0.85, mojado: 0.4 });
            tocar(c, 'destello', t + 0.02, { vol: 0.35, mojado: 0.4 });
            florecer(c, t, { sube: 0.15, dura: 3, corte: 4500, vol: 0.45 });
            break;
        case 'inicio-chosen':
            tocar(c, 'viento', t, { vol: 0.5, tono: 0.6, mojado: 0.5 });
            retumbo(c, t + 0.3, 2.8, 0.55);
            tocar(c, 'energia', t + 0.8, { vol: 0.35, tono: 0.7, mojado: 0.5 });
            tocar(c, 'destello', t + 1.2, { vol: 0.2, tono: 0.6, mojado: 0.7 });
            alRevesHasta(c, 'tierra', 0.47, t + 3.1, 0.55);
            alRevesHasta(c, 'explosion', 0.19, t + 3.1, 0.6);
            florecer(c, t + 3.1, { sube: 2.4, dura: 0.1, corte: 1600, vol: 0.34 });
            break;
        case 'impacto-chosen':
            golpe(c, t, { desde: 180, hasta: 24, duracion: 2, vol: 1 });
            tocar(c, 'explosion', t, { vol: 0.9, variar: 0, mojado: 0.35 });
            tocar(c, 'tierra2', t, { vol: 0.65, variar: 0, mojado: 0.3 });
            tocar(c, 'rayo', t, { vol: 0.5, variar: 0, mojado: 0.4 });
            tocar(c, 'destello', t + 0.03, { vol: 0.6, variar: 0, mojado: 0.5 });
            tocar(c, 'destello', t + 0.35, { vol: 0.45, tono: 1.25, variar: 0, mojado: 0.6 });
            florecer(c, t, { sube: 0.05, dura: 6, corte: 9000, vol: 0.8 });
            break;
        case 'impacto-legendary':
            golpe(c, t, { desde: 160, hasta: 28, duracion: 1.6, vol: 0.9 });
            tocar(c, 'explosion', t, { vol: 0.85, variar: 0, mojado: 0.3 });
            tocar(c, 'tierra2', t, { vol: 0.6, variar: 0, mojado: 0.3 });
            tocar(c, 'rayo', t, { vol: 0.4, variar: 0, mojado: 0.4 });
            tocar(c, 'destello', t + 0.03, { vol: 0.5, variar: 0, mojado: 0.5 });
            florecer(c, t, { sube: 0.05, dura: 5, corte: 9000, vol: 0.7 });
            break;
    }
}

export function sonarResumen() {
    const c = listo();
    if (!c) return;
    const t = c.currentTime + 0.3;
    golpe(c, t, { vol: 0.3, duracion: 0.6 });
    florecer(c, t, { sube: 0.3, dura: 2.5, corte: 3000, vol: 0.4 });
}
