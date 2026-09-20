/// Cuantos tickets se vendieron sobre el cupo, con la barra.
export default function ProgressBar({
  vendidos,
  cupo,
}: {
  vendidos: number;
  cupo: number;
}) {
  const pct = cupo > 0 ? (vendidos / cupo) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-blue-200 tabular-nums">
          <span className="text-white font-semibold text-base">{vendidos}</span>{" "}
          / {cupo} tickets
        </span>
        <span className="text-blue-200/60 tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
