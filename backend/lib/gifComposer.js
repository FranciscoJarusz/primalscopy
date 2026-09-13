// lib/gifComposer.js
//
// Compone las capas de traits en un GIF animado, del lado del servidor.
//
// Por que en el servidor y no aceptar el GIF que ya genera el navegador: si el
// backend aceptara una imagen subida, el dueño de un NFT podria poner
// cualquier cosa como imagen de su token — incluido contenido que despues
// aparece en los marketplaces a nombre de la coleccion. Generandolo aca, la
// salida solo puede ser una combinacion de los traits aprobados.
//
// La logica es la misma que hace el front con canvas, pero sobre buffers RGBA
// pelados para no depender de un canvas nativo. Cada capa mantiene su propio
// lienzo acumulado porque los frames de un GIF suelen ser parches parciales
// que dependen de lo que quedo dibujado antes (eso es el "disposal").

const fs = require('fs');
const { parseGIF, decompressFrames } = require('gifuct-js');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const SIZE = 2000;
const DEFAULT_DELAY = 70;

// --- Operaciones sobre buffers RGBA -----------------------------------------

function clearRect(buf, width, { left, top, width: w, height: h }) {
    for (let y = top; y < top + h; y++) {
        const start = (y * width + left) * 4;
        buf.fill(0, start, start + w * 4);
    }
}

// Pega el parche de un frame sobre el lienzo de su capa. Los pixeles
// totalmente transparentes del parche no borran lo que habia debajo: en un GIF
// la transparencia significa "no toques este pixel", no "pintalo vacio".
function drawPatch(dst, dstWidth, patch, dims) {
    const { left, top, width: w, height: h } = dims;
    for (let y = 0; y < h; y++) {
        const dstRow = ((top + y) * dstWidth + left) * 4;
        const srcRow = y * w * 4;
        for (let x = 0; x < w; x++) {
            const s = srcRow + x * 4;
            if (patch[s + 3] === 0) continue;
            const d = dstRow + x * 4;
            dst[d] = patch[s];
            dst[d + 1] = patch[s + 1];
            dst[d + 2] = patch[s + 2];
            dst[d + 3] = patch[s + 3];
        }
    }
}

// Alpha compositing clasico ("source-over"): la capa de arriba sobre lo que ya
// hay. Los traits vienen con bordes suavizados, asi que no alcanza con copiar.
function compositeOver(base, top) {
    for (let i = 0; i < base.length; i += 4) {
        const alpha = top[i + 3];
        if (alpha === 0) continue;
        if (alpha === 255) {
            base[i] = top[i];
            base[i + 1] = top[i + 1];
            base[i + 2] = top[i + 2];
            base[i + 3] = 255;
            continue;
        }
        const a = alpha / 255;
        const inv = 1 - a;
        base[i] = Math.round(top[i] * a + base[i] * inv);
        base[i + 1] = Math.round(top[i + 1] * a + base[i + 1] * inv);
        base[i + 2] = Math.round(top[i + 2] * a + base[i + 2] * inv);
        base[i + 3] = Math.round(alpha + base[i + 3] * inv);
    }
}

// --- Carga de capas ---------------------------------------------------------

function loadLayer(filePath) {
    const buf = fs.readFileSync(filePath);
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gif = parseGIF(arrayBuffer);
    const frames = decompressFrames(gif, true);
    if (frames.length === 0) throw new Error(`El GIF no tiene frames: ${filePath}`);
    return { frames, width: gif.lsd.width, height: gif.lsd.height };
}

// Devuelve, para una capa, el lienzo acumulado en cada indice de frame. Se
// precalcula una vez por capa en vez de rehacerlo en cada frame de salida.
function renderLayerFrames(layer) {
    const { frames, width, height } = layer;
    const canvas = new Uint8ClampedArray(width * height * 4);
    const rendered = [];
    let pending = null; // disposal del frame anterior, se aplica antes del siguiente

    for (const frame of frames) {
        if (pending) {
            // 2 = "restore to background": se borra el area que ocupo el frame
            // anterior. 3 ("restore to previous") es raro y se trata igual, que
            // es lo que hace tambien el front.
            if (pending.disposalType === 2 || pending.disposalType === 3) {
                clearRect(canvas, width, pending.dims);
            }
            pending = null;
        }

        drawPatch(canvas, width, frame.patch, frame.dims);
        rendered.push(canvas.slice());
        pending = { dims: frame.dims, disposalType: frame.disposalType };
    }

    return rendered;
}

// --- API --------------------------------------------------------------------

/**
 * Compone las capas (en orden, de atras hacia adelante) en un GIF animado.
 * Devuelve un Buffer listo para escribir a disco.
 */
function composeGif(layerPaths, { size = SIZE, quality = 10 } = {}) {
    if (!Array.isArray(layerPaths) || layerPaths.length === 0) {
        throw new Error('No hay capas para componer.');
    }

    const layers = layerPaths.map(loadLayer);

    // Todas las capas son del mismo tamaño en esta coleccion, pero si alguna
    // difiere conviene enterarse por un error claro y no por una imagen torcida.
    for (let i = 0; i < layers.length; i++) {
        if (layers[i].width !== size || layers[i].height !== size) {
            throw new Error(`La capa ${layerPaths[i]} es ${layers[i].width}x${layers[i].height}, se esperaba ${size}x${size}.`);
        }
    }

    const renderedByLayer = layers.map(renderLayerFrames);

    // Las capas animadas tienen 6 frames y las estaticas 1. El resultado dura
    // lo que la mas larga, y las cortas se repiten en loop.
    const totalFrames = Math.max(...layers.map(l => l.frames.length));

    // El delay sale de la primera capa animada que haya; si son todas estaticas
    // el valor no importa porque hay un solo frame.
    const animated = layers.find(l => l.frames.length > 1);
    const delay = animated ? (animated.frames[0].delay || DEFAULT_DELAY) : DEFAULT_DELAY;

    // Primero se componen todos los frames, porque para comprimir bien hace
    // falta comparar cada uno con el anterior.
    const pixelCount = size * size * 4;
    const composed = [];
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const output = new Uint8ClampedArray(pixelCount);
        for (let i = 0; i < layers.length; i++) {
            const rendered = renderedByLayer[i];
            compositeOver(output, rendered[frameIndex % rendered.length]);
        }
        composed.push(output);
    }

    // Una paleta global para todos los frames. Se calcula sobre un muestreo de
    // todos y no solo del primero: los efectos glitch meten colores que
    // aparecen recien en algun frame del medio.
    const palette = buildPalette(composed);
    // Un indice extra, fuera de la paleta real, marca "este pixel no cambio".
    const transparentIndex = palette.length;
    const paletteWithTransparent = palette.concat([[0, 0, 0]]);

    const encoder = GIFEncoder();
    let previous = null;

    for (const frame of composed) {
        const indexed = applyPalette(frame, palette, 'rgb565');

        // Todo lo que no cambio respecto del frame anterior se marca
        // transparente y, con dispose 1, el visor deja lo que ya habia. En
        // estas animaciones solo cambia entre el 1% y el 4% de los pixeles por
        // frame, asi que esto reduce el archivo a menos de la mitad.
        if (previous) {
            for (let p = 0; p < indexed.length; p++) {
                const o = p * 4;
                if (frame[o] === previous[o] && frame[o + 1] === previous[o + 1] && frame[o + 2] === previous[o + 2]) {
                    indexed[p] = transparentIndex;
                }
            }
        }

        encoder.writeFrame(indexed, size, size, {
            palette: paletteWithTransparent,
            delay,
            transparent: true,
            transparentIndex,
            dispose: 1
        });
        previous = frame;
    }

    encoder.finish();
    return Buffer.from(encoder.bytes());
}

// 255 y no 256: hay que dejar libre un indice para marcar los pixeles que no
// cambian entre frames.
function buildPalette(frames) {
    if (frames.length === 1) return quantize(frames[0], 255, { format: 'rgb565' });

    // Un pixel de cada 4 por frame alcanza para no perder colores y evita
    // cuantizar 24 millones de pixeles.
    const perFrame = Math.floor(frames[0].length / 4 / 4);
    const sample = new Uint8ClampedArray(perFrame * frames.length * 4);
    let at = 0;
    for (const frame of frames) {
        for (let p = 0; p < perFrame; p++) {
            const src = p * 4 * 4;
            sample[at++] = frame[src];
            sample[at++] = frame[src + 1];
            sample[at++] = frame[src + 2];
            sample[at++] = frame[src + 3];
        }
    }
    return quantize(sample, 255, { format: 'rgb565' });
}

// Las piezas internas se exportan para poder medirlas por separado desde los
// tests y los scripts de calibracion del encoder.
module.exports = { composeGif, SIZE, loadLayer, renderLayerFrames, compositeOver };
