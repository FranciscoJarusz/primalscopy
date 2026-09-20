import PrimalImage from "../shared/PrimalImage";
import { ape, nameOf } from "../../lib/raffles/format";
import type { Item, Actions } from "../../lib/raffles/contrato";

/// Los raffles ya sorteados: que salio, quien lo gano y cuanto pago el pozo.
export default function Results({
  items,
  yo,
  ocupado,
  acciones,
}: {
  items: Item[];
  yo: string;
  ocupado: boolean;
  acciones: Actions;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-2xl font-semibold">Results</h2>
        <span className="text-sm text-blue-200/60">{items.length} drawn</span>
      </div>
      <p className="text-blue-200/70 text-sm mb-5">
        Every prize, the wallet that won it and what the pot paid out.
      </p>

      <div className="bg-white/5 border border-white/10 rounded-xl divide-y divide-white/10">
        {items.map(({ id, r }) => {
          const gane = r.ganador.toLowerCase() === yo.toLowerCase();

          return (
            <div key={id} className="flex flex-wrap items-center gap-4 p-4">
              <PrimalImage
                tokenId={r.tokenId}
                className="w-14 h-14 rounded-lg shrink-0"
              />

              <div className="min-w-[150px]">
                <div className="font-semibold">
                  Primal Cult #{String(r.tokenId)}
                </div>
                <div className="text-sm text-blue-200/60 tabular-nums">
                  {String(r.ticketsSold)} tickets sold
                </div>
              </div>

              <div className="flex-1 min-w-[160px]">
                <div className="text-xs uppercase tracking-wide text-blue-200/50">
                  Winner
                </div>
                <div className="font-semibold text-purple-300">
                  {nameOf(r.ganador)}
                </div>
              </div>

              <div className="text-right min-w-[110px]">
                <div className="text-xs uppercase tracking-wide text-blue-200/50">
                  Pot
                </div>
                <div className="font-semibold tabular-nums">
                  {ape(r.aRepartir)} APE
                </div>
              </div>

              {gane && !r.nftRetirado ? (
                <button
                  disabled={ocupado}
                  onClick={() => acciones.retirarNFT(id)}
                  className="rounded-xl bg-yellow-300 hover:bg-yellow-200 disabled:opacity-30 px-5 py-2 font-bold text-black transition-colors duration-200"
                >
                  Claim my NFT
                </button>
              ) : (
                <span className="text-xs font-bold px-3 py-1 rounded-full border border-white/20 text-white/50">
                  {r.nftRetirado ? "CLAIMED" : "AWARDED"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
