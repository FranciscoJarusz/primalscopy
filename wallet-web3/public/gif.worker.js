/*! gif.js worker proxy */
/* eslint-disable */
(function(){
  var cdn = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js';
  try {
    importScripts(cdn);
  } catch (e) {
    self.onmessage = function(){
      postMessage({ type: 'error', message: 'No se pudo cargar gif.worker desde CDN: ' + String(e) });
    };
  }
})();
