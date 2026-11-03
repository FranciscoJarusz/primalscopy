import { ORDEN_RAREZAS, RAREZAS, type CartaPack } from '@/lib/packs';
import { Frente } from './Carta';
import { CSS } from './cssMudwater';

export default function PackCompartido({
    cartas,
    puntos,
    apodo,
}: {
    cartas: CartaPack[];
    puntos: number;
    apodo: string | null;
}) {
    const ordenadas = [...cartas].sort(
        (a, b) => ORDEN_RAREZAS.indexOf(a.rareza) - ORDEN_RAREZAS.indexOf(b.rareza)
    );
    const conteo = ORDEN_RAREZAS.map(
        (r) => [r, cartas.filter((c) => c.rareza === r).length] as const
    ).filter(([, n]) => n);

    return (
        <div className="flex flex-col items-center gap-8 py-6 sm:py-10 text-center">
            <style>{CSS}</style>
            <div className="flex flex-col items-center gap-3">
                <p className="mw-etiqueta text-xs sm:text-sm text-mw-champagne">
                    Primal Cult × Mudwater
                </p>
                <h1 className="mw-titulo uppercase text-3xl sm:text-5xl text-mw-mist">
                    {apodo ? `${apodo}'s pull` : 'A fresh pull'}
                </h1>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-5 w-[min(92vw,56rem)]">
                {ordenadas.map((c, i) => (
                    <div key={i} className="aspect-[1621/2250]">
                        <Frente carta={c} />
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mw-etiqueta text-xs sm:text-sm text-mw-mist">
                {conteo.map(([r, n]) => (
                    <span key={r} className="flex items-center gap-2">
                        <span className="size-2 rotate-45 bg-mw-champagne" />
                        {n} {RAREZAS[r].nombre}
                    </span>
                ))}
            </div>
            <p className="mw-titulo text-4xl sm:text-5xl mw-brass-texto">
                +{puntos} points
            </p>
            <a
                href="/mudwater"
                className="mw-boton-brillo mw-titulo uppercase text-black text-lg rounded-md px-9 py-3 tracking-wider hover:scale-105 active:scale-97 transition-all duration-300"
            >
                <span className="mw-boton-reflejo" aria-hidden="true" />
                <span className="relative">Rip your own packs</span>
            </a>
        </div>
    );
}
