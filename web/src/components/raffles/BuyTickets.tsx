import { useState } from "react";
import { ape } from "../../lib/raffles/format";

/// El selector de cantidad mas el boton de comprar. Lo usan el destacado y las
/// tarjetas chicas, con la unica diferencia del tamano y del texto del boton.
export default function BuyTickets({
  restantes,
  precio,
  ocupado,
  onComprar,
  compacto = false,
}: {
  restantes: number;
  precio: bigint;
  ocupado: boolean;
  onComprar: (cantidad: number) => void;
  compacto?: boolean;
}) {
  const [cantidad, setCantidad] = useState(1);
  const tope = restantes || 1;

  return (
    <div className="flex gap-2 items-center">
      <input
        type="number"
        min={1}
        max={tope}
        value={cantidad}
        onChange={(e) =>
          setCantidad(Math.max(1, Math.min(tope, Number(e.target.value))))
        }
        className={`bg-white/10 border border-white/20 rounded-lg px-2 text-center focus:outline-none focus:border-blue-500 ${
          compacto ? "w-14 py-2" : "w-16 py-3"
        }`}
      />
      <button
        disabled={ocupado || restantes === 0}
        onClick={() => onComprar(cantidad)}
        className={`flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 cursor-pointer rounded-lg font-semibold transition-all duration-200 ${
          compacto ? "px-4 py-2" : "px-4 py-3"
        }`}
      >
        {restantes === 0
          ? compacto
            ? "Max reached"
            : "You hold the max (5)"
          : compacto
            ? "Buy tickets"
            : `Buy for ${ape(precio * BigInt(cantidad))} APE`}
      </button>
    </div>
  );
}
