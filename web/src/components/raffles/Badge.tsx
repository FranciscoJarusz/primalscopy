import { SELLING, DRAWING, CLOSED, EXPIRED } from "@/lib/raffles/contrato";

const MAPA: Record<number, [string, string]> = {
  [SELLING]: ["Selling", "bg-green-500/20 text-green-300 border-green-500/40"],
  [DRAWING]: [
    "Drawing",
    "bg-yellow-400/20 text-yellow-200 border-yellow-400/40",
  ],
  [CLOSED]: ["Closed", "bg-blue-500/20 text-blue-200 border-blue-500/40"],
  [EXPIRED]: ["Expired", "bg-white/10 text-white/60 border-white/20"],
};

export default function Badge({ estado }: { estado: number }) {
  const [txt, clase] = MAPA[estado] ?? MAPA[EXPIRED]!;
  return (
    <span
      className={`text-xs font-bold px-3 py-1 rounded-full border ${clase}`}
    >
      {txt}
    </span>
  );
}
