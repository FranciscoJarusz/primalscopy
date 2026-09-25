import { ethers } from "ethers";
import PrimalImage from "@/components/shared/PrimalImage";
import Badge from "@/components/raffles/Badge";
import ProgressBar from "@/components/raffles/ProgressBar";
import Ticket from "@/components/raffles/Ticket";
import BuyTickets from "@/components/raffles/BuyTickets";
import { countdown } from "@/lib/raffles/format";
import {
  SELLING,
  DRAWING,
  MAX_TICKETS,
  type Item,
  type Actions,
} from "@/lib/raffles/contrato";

/// El raffle con mas movimiento, arriba de todo: imagen grande a la izquierda y
/// el estado con la compra a la derecha.
export default function FeaturedRaffle({
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
    <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 relative rounded-xl overflow-hidden border border-white/10 aspect-square lg:aspect-auto lg:min-h-[540px]">
        <PrimalImage
          tokenId={r.tokenId}
          className="absolute inset-0 w-full h-full"
        />
        <span className="absolute top-4 left-4 rounded-full bg-yellow-300 px-3 py-1 text-xs font-bold text-black">
          FEATURED
        </span>
        <span className="absolute top-4 right-4 rounded-lg bg-black/70 backdrop-blur px-3 py-1.5 text-sm font-semibold">
          Primal Cult #{String(r.tokenId)}
        </span>
      </div>

      <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col gap-5">
        <Ticket />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">
              Primal Cult #{String(r.tokenId)}
            </h2>
            <p className="text-blue-200 mt-1">
              {ethers.formatEther(r.ticketPrice)} APE per ticket
            </p>
          </div>
          <Badge estado={estado} />
        </div>

        <ProgressBar
          vendidos={Number(r.ticketsSold)}
          cupo={Number(r.ticketGoal)}
        />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Dato titulo="Your tickets" valor={String(mios)} />
          <Dato titulo="Time" valor={countdown(r.deadline)} />
        </div>

        <div className="border-t border-white/10 pt-4 text-sm text-blue-200/70">
          The draw fires on its own the moment the last ticket sells. Every
          ticket has the same weight, so your odds above move as more people
          join.
        </div>

        {estado === SELLING && !soyCreador && (
          <div className="mt-auto">
            <BuyTickets
              restantes={restantes}
              precio={r.ticketPrice}
              ocupado={ocupado}
              onComprar={(cant) => acciones.comprar(id, cant, r.ticketPrice)}
            />
          </div>
        )}

        {estado === SELLING && soyCreador && (
          <div className="mt-auto space-y-3">
            <p className="text-sm text-blue-200/70">
              You created this raffle, so you cannot buy tickets in it.
            </p>
            <BotonAmarillo
              disabled={ocupado}
              onClick={() => acciones.forzar(id)}
            >
              Draw now without filling up
            </BotonAmarillo>
          </div>
        )}

        {estado === DRAWING && (
          <div className="mt-auto space-y-3">
            <p className="text-sm text-blue-200/70">
              Sales are closed. Waiting on ApeChain for the random number — on
              mainnet this takes a few blocks.
            </p>
            <BotonAmarillo
              disabled={ocupado}
              onClick={() => acciones.sortear(id)}
            >
              ApeChain sends the number
            </BotonAmarillo>
          </div>
        )}
      </div>
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-blue-200/50">
        {titulo}
      </div>
      <div className="text-xl font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

function BotonAmarillo({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl bg-yellow-300 hover:bg-yellow-200 disabled:opacity-30 px-5 py-3 font-bold text-black cursor-pointer transition-colors duration-200"
    >
      {children}
    </button>
  );
}
