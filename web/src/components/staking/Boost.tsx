import { useEffect, useState } from 'react';
import { ICONO_FOG_CHICO, type Boost as BoostConfig } from '@/lib/staking';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

const restante = (ms: number) => {
    if (ms >= DIA) {
        const d = Math.floor(ms / DIA);
        const h = Math.floor((ms % DIA) / HORA);
        return h ? `${d}d ${h}h left` : `${d}d left`;
    }
    const h = Math.floor(ms / HORA);
    const m = Math.max(1, Math.floor((ms % HORA) / 60000));
    return h ? `${h}h ${m}m left` : `${m}m left`;
};

export default function Boost({ boost }: { boost: BoostConfig }) {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setAhora(Date.now()), 30000);
        return () => clearInterval(id);
    }, []);

    const falta = Date.parse(boost.endsAt) - ahora;
    if (falta <= 0) return null;

    return (
        <div
            className="pointer-events-auto animate-aparece bg-yellow text-darkblue rounded-xl shadow-lg shadow-darkblue/60 flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 max-w-80"
            role="status"
        >
            <div className="relative size-9 shrink-0 grid place-items-center rounded-lg bg-darkblue">
                <img src={ICONO_FOG_CHICO} alt="" className="size-7 object-contain" />
                <b className="absolute -bottom-1.5 -right-1.5 rounded-full bg-darkblue text-yellow ring-1 ring-yellow px-1 text-[10px] leading-4 font-semibold">
                    x{boost.multiplier}
                </b>
            </div>
            <div className="min-w-0 flex flex-col justify-center gap-0.5 text-xs leading-none">
                <div className="font-accent uppercase truncate leading-tight">
                    {boost.title}
                </div>
                <div className="flex items-center gap-1.5 text-darkblue/75 leading-tight min-w-0">
                    <span className="size-1.5 shrink-0 rounded-full bg-darkblue animate-pulse" />
                    <span className="truncate">
                        x{boost.multiplier} FOG · {restante(falta)}
                    </span>
                </div>
            </div>
        </div>
    );
}
