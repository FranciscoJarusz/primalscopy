// "En vivo": los ultimos premios de las ruletas, uno por vez, en /staking. Es
// lo que da ganas de abrir una key. Sin el consuelo de FOG (eso lo filtra el
// backend). Solo en esta pagina: en el resto del sitio distraeria.
import { useEffect, useState } from 'react';
import { nombreWallet, useApodos } from '@/lib/nicknames';
import {
    colorRareza,
    imagenPremio,
    leerRecientes,
    type PremioRuleta,
    type Premio,
} from '@/lib/staking';

type Reciente = {
    id: string;
    wallet: string;
    item: string;
    prize: PremioRuleta;
    chance: number;
    at: string;
};

const CADA = 8000; // cuanto se ve cada premio
const REFRESCO = 30000; // cada cuanto se piden los nuevos

const hace = (iso: string) => {
    const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

export default function Recientes({ catalogo }: { catalogo: Premio[] }) {
    const [lista, setLista] = useState<Reciente[]>([]);
    const apodos = useApodos();
    const [i, setI] = useState(0);

    useEffect(() => {
        const pedir = () =>
            leerRecientes()
                .then(setLista)
                .catch(() => {});
        pedir();
        const id = setInterval(pedir, REFRESCO);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (lista.length < 2) return;
        const id = setInterval(() => setI((n) => (n + 1) % lista.length), CADA);
        return () => clearInterval(id);
    }, [lista.length]);

    if (lista.length === 0) return null;
    const w = lista[i % lista.length];
    const imagen = imagenPremio(w.prize);
    const color = colorRareza(w.chance);
    const nombre = nombreWallet(w.wallet, apodos);
    const key = catalogo.find((c) => c.id === w.item)?.label ?? w.item;

    return (
        <div
            // key: cada premio nuevo entra con la animacion de aparecer.
            key={w.id}
            className="pointer-events-auto animate-aparece bg-darkblue/95 rounded-xl shadow-lg shadow-darkblue/60 flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 max-w-80"
            aria-live="polite"
        >
            <div
                className="size-9 shrink-0 rounded-lg overflow-hidden bg-blue/60 border-2"
                style={{ borderColor: color }}
            >
                {imagen && <img src={imagen} alt="" className="w-full h-full object-contain" />}
            </div>
            {/* Las dos lineas centradas en alto al lado de la imagen; el
                puntito "en vivo" centrado con su linea (con align-middle
                quedaba mas abajo que el texto). */}
            <div className="min-w-0 flex flex-col justify-center gap-0.5 text-xs leading-none">
                <div className="text-lightblue truncate leading-tight">
                    <span className="text-white font-semibold">{nombre}</span> won{' '}
                    <span className="font-semibold" style={{ color }}>
                        {w.prize.label}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-lightblue/50 leading-tight min-w-0">
                    <span className="size-1.5 shrink-0 rounded-full bg-green-400 animate-pulse" />
                    <span className="truncate">
                        {key} · {hace(w.at)}
                    </span>
                </div>
            </div>
        </div>
    );
}
