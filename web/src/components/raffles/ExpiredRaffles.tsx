import PrimalImage from "../shared/PrimalImage";
import type { Item, Actions } from "../../lib/raffles/contrato";

/// Los que nunca llegaron al cupo. Nadie gana y cada uno recupera lo suyo.
export default function ExpiredRaffles({
  items,
  ocupado,
  acciones,
}: {
  items: Item[];
  ocupado: boolean;
  acciones: Actions;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-5">Expired raffles</h2>

      <div className="bg-white/5 border border-white/10 rounded-xl divide-y divide-white/10">
        {items.map(({ id, r, mios }) => (
          <div key={id} className="flex flex-wrap items-center gap-4 p-4">
            <PrimalImage
              tokenId={r.tokenId}
              className="w-12 h-12 rounded-lg shrink-0"
            />

            <div className="flex-1 min-w-[180px]">
              <div className="font-semibold">
                Primal Cult #{String(r.tokenId)}
              </div>
              <div className="text-sm text-blue-200/60">
                Never filled up — everyone gets their APE back
              </div>
            </div>

            {mios > 0 && (
              <button
                disabled={ocupado}
                onClick={() => acciones.reembolso(id)}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-30 px-4 py-2 rounded-lg font-semibold transition-all duration-200"
              >
                Get my APE back
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
