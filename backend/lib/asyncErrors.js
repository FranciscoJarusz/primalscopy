// lib/asyncErrors.js
//
// Express 4 no espera a los handlers async: si uno tira despues de un await,
// el rechazo no llega a ningun manejador de errores. La request queda colgada
// y Node, con un rechazo sin atrapar, termina el proceso entero (es lo que
// hace por defecto desde Node 15). Un error en una sola ruta tiraba el backend
// y con el se iban los nonces del login y los limites de intentos.
//
// Esto hace lo que Express 5 ya trae: si un handler devuelve una promesa
// rechazada, el error sigue por next(err) como cualquier otro. Se carga una
// vez en server.js, antes de armar las rutas. No se pasa a Express 5 porque
// cambia la sintaxis de las rutas y como se lee el body.

const Layer = require('express/lib/router/layer');

const original = Layer.prototype.handle_request;

Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    // Los manejadores de errores (4 argumentos) siguen su camino de siempre.
    if (fn.length > 3) return original.call(this, req, res, next);

    let result;
    try {
        result = fn(req, res, next);
    } catch (err) {
        return next(err);
    }
    if (result && typeof result.then === 'function') {
        result.then(undefined, err => next(err || new Error('Handler rechazado sin error.')));
    }
};
