import { ape } from "../../lib/raffles/format";
import type { Account } from "../../lib/raffles/accounts";

/// Lo que va a la derecha del header mientras esto sea una demo local: elegir
/// con que cuenta de anvil estas mirando la pagina.
///
/// Cuando haya wallet de verdad, este componente se reemplaza por el boton de
/// conectar y el header no cambia.
export default function SelectorCuenta({
  cuentas,
  indice,
  setIndice,
  saldo,
  claim,
  ocupado,
  onRetirar,
}: {
  cuentas: Account[];
  indice: number;
  setIndice: (i: number) => void;
  saldo: bigint;
  claim: bigint;
  ocupado: boolean;
  onRetirar: () => void;
}) {
  return (
    <>
      {claim > 0n && (
        <button
          disabled={ocupado}
          onClick={onRetirar}
          className="rounded-lg bg-yellow-300 hover:bg-yellow-200 disabled:opacity-30 cursor-pointer px-3 sm:px-4 py-2 text-sm font-bold text-black transition-colors duration-200 whitespace-nowrap"
        >
          {/* En pantallas chicas no entra el monto: alcanza con el verbo. */}
          Claim<span className="hidden sm:inline"> {ape(claim)} APE</span>
        </button>
      )}

      <div className="flex items-center gap-2 sm:gap-3 rounded-lg bg-white/5 border border-white/10 px-2 sm:px-3 py-1.5">
        <select
          value={indice}
          onChange={(e) => setIndice(Number(e.target.value))}
          className="bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer"
        >
          {cuentas.map((c, i) => (
            <option key={c.nombre} value={i} className="bg-[#090746]">
              {c.nombre}
            </option>
          ))}
        </select>
        {/* El saldo se cae primero: en un telefono lo que importa es poder
            cambiar de cuenta, y el numero se ve igual en la pagina. */}
        <span className="hidden sm:inline text-sm text-blue-200 tabular-nums border-l border-white/10 pl-3">
          {ape(saldo)} APE
        </span>
      </div>
    </>
  );
}
