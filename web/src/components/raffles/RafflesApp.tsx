import FeaturedRaffle from "@/components/raffles/FeaturedRaffle";
import RaffleCard from "@/components/raffles/RaffleCard";
import Results from "@/components/raffles/Results";
import ExpiredRaffles from "@/components/raffles/ExpiredRaffles";
import { useRaffles } from "@/hooks/raffles/useRaffles";
import { SELLING, DRAWING, CLOSED, EXPIRED } from "@/lib/raffles/contrato";

/// El contenido de la pantalla de raffles. El header y el pie los pone el
/// layout, asi que aca solo van las secciones.
export default function RafflesApp() {
  const { cuenta, raffles, cargando, ocupado, aviso, acciones } = useRaffles();

  const abiertos = raffles.filter(
    (x) => Number(x.r.estado) === SELLING || Number(x.r.estado) === DRAWING,
  );
  // El destacado es el que mas se movio; el resto va a la grilla.
  const destacado = abiertos
    .slice()
    .sort((a, b) => Number(b.r.ticketsSold) - Number(a.r.ticketsSold))[0];
  const resto = abiertos.filter((x) => x !== destacado);
  const cerrados = raffles.filter((x) => Number(x.r.estado) === CLOSED);
  const expirados = raffles.filter((x) => Number(x.r.estado) === EXPIRED);

  return (
    <div className="flex flex-col gap-12">
      <div data-anim="intro" className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Primal Cult Raffles
          </h1>
          <span className="rounded-xl bg-yellow-300 px-4 py-1.5 text-sm font-bold text-black">
            Local demo
          </span>
        </div>
        <p className="text-blue-200 mt-3">
          Each raffle puts one Primal on the line. Buy tickets for a chance to
          win it — every ticket weighs exactly the same, and the winner is drawn
          on-chain by ApeChain's own random number generator. Nobody, not even
          the team, can pick it.
        </p>
      </div>

      {aviso && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border ${
            aviso.tipo === "ok"
              ? "bg-green-500/10 border-green-500/30 text-green-200"
              : "bg-red-500/10 border-red-500/30 text-red-200"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {cargando && (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <div className="text-blue-200 text-xl">Loading raffles...</div>
        </div>
      )}

      {!cargando && destacado && (
        <FeaturedRaffle
          item={destacado}
          yo={cuenta.dir}
          ocupado={ocupado}
          acciones={acciones}
        />
      )}

      {!cargando && resto.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-2xl font-semibold">Open raffles</h2>
            <span className="text-sm text-blue-200/60">
              {resto.length} more on the line
            </span>
          </div>
          <div data-anim-stagger="" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {resto.map((item) => (
              <RaffleCard
                key={item.id}
                item={item}
                yo={cuenta.dir}
                ocupado={ocupado}
                acciones={acciones}
              />
            ))}
          </div>
        </section>
      )}

      {!cargando && cerrados.length > 0 && (
        <Results
          items={cerrados}
          yo={cuenta.dir}
          ocupado={ocupado}
          acciones={acciones}
        />
      )}

      {!cargando && expirados.length > 0 && (
        <ExpiredRaffles
          items={expirados}
          ocupado={ocupado}
          acciones={acciones}
        />
      )}
    </div>
  );
}
