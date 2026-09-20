import { atom } from "nanostores";

/// Lo poco que la barra de arriba y el contenido de la pagina tienen que saber
/// el uno del otro.
///
/// Hacen falta porque el header vive en el layout y el contenido es otra isla:
/// son dos arboles de React distintos y no comparten estado por props.

/// Con que cuenta se esta mirando la pagina. Cuando haya wallet de verdad, esto
/// pasa a ser la direccion conectada.
export const accountIndex = atom(0);

/// Sube de a uno cada vez que una transaccion termina. Las dos islas lo miran
/// para volver a leer la cadena: si compras un ticket, el saldo del header
/// tiene que bajar aunque el boton este en la otra isla.
export const version = atom(0);

export function refresh() {
  version.set(version.get() + 1);
}
