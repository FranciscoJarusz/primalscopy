import { ethers } from "ethers";
import PrimalImage from "@/components/shared/PrimalImage";
import Badge from "@/components/raffles/Badge";
import ProgressBar from "@/components/raffles/ProgressBar";
import BuyTickets from "@/components/raffles/BuyTickets";
import { countdown } from "@/lib/raffles/format";
import {
  SELLING,
  DRAWING,
  MAX_TICKETS,
  type Item,
  type Actions,
} from "@/lib/raffles/contrato";

/// Un raffle en la grilla de abiertos.
export default function RaffleCard({
  item,
  yo,
  ocupado,
  acciones,
}: {
  item: Item;
  yo: string;
  ocupado: boolean;
  acciones: Actions;
}) {
  const { id, r, mios } = item;
  const estado = Number(r.estado);
  const soyCreador = r.creator.toLowerCase() === yo.toLowerCase();
  const restantes = Math.max(0, MAX_TICKETS - mios);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden flex flex-col">
      <div className="relative">
        <PrimalImage tokenId={r.tokenId} className="w-full aspect-square" />
        <span className="absolute top-3 right-3">
          <Badge estado={estado} />
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Primal Cult #{String(r.tokenId)}</h3>
            <p className="text-sm text-blue-200">
              {ethers.formatEther(r.ticketPrice)} APE per ticket
            </p>
          </div>
          <span className="text-xs text-blue-200/50 whitespace-nowrap pt-1">
            {countdown(r.deadline)}
          </span>
        </div>

        <ProgressBar
          vendidos={Number(r.ticketsSold)}
          cupo={Number(r.ticketGoal)}
        />

        <div className="mt-auto">
          {estado === SELLING && !soyCreador && (
            <BuyTickets
              compacto
              restantes={restantes}
              precio={r.ticketPrice}
              ocupado={ocupado}
              onComprar={(cant) => acciones.comprar(id, cant, r.ticketPrice)}
            />
          )}

          {estado === SELLING && soyCreador && (
            <button
              disabled={ocupado}
              onClick={() => acciones.forzar(id)}
              className="w-full rounded-xl bg-yellow-300 hover:bg-yellow-200 disabled:opacity-30 cursor-pointer px-4 py-2 font-bold text-black transition-colors duration-200"
            >
              Draw now
            </button>
          )}

          {estado === DRAWING && (
            <button
              disabled={ocupado}
              onClick={() => acciones.sortear(id)}
              className="w-full rounded-xl bg-yellow-300 hover:bg-yellow-200 disabled:opacity-30 cursor-pointer px-4 py-2 font-bold text-black transition-colors duration-200"
            >
              ApeChain sends the number
            </button>
          )}

          {mios > 0 && (
            <p className="text-xs text-blue-200/60 mt-2">
              You hold {mios} ticket{mios > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
