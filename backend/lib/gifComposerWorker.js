// lib/gifComposerWorker.js
//
// El hilo aparte donde corre composeGif (ver composeGifInWorker en
// gifComposer.js). Recibe las rutas de las capas, devuelve el GIF y el primer
// cuadro, y termina.

const { parentPort, workerData } = require('worker_threads');
const { composeGif } = require('./gifComposer');

let firstFrame = null;
const gif = composeGif(workerData.layerPaths, {
    ...workerData.options,
    onFirstFrame: (rgba, size) => { firstFrame = { rgba, size }; }
});

parentPort.postMessage({ gif, firstFrame });
