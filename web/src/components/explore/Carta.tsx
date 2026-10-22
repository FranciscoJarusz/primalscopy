import CartaPrimal from '@/components/shared/CartaPrimal';
import { urlFicha } from '@/lib/explore';
import type { Zona } from '@/lib/zonas';

export default function Carta({ id, rank, zona }: { id: number; rank: number | null; zona?: Zona }) {
    return (
        <CartaPrimal
            tokenId={String(id)}
            href={urlFicha(id)}
            insignia={
                zona && (
                    <span
                        title={`Training in ${zona.nombre}`}
                        className="absolute top-2 left-2 h-5 inline-flex items-center rounded-md px-2 pb-[0.38em] font-accent uppercase text-xs text-white leading-none"
                        style={{ backgroundColor: zona.color }}
                    >
                        {zona.nombre}
                    </span>
                )
            }
        >
            <div className="w-full flex items-center justify-between gap-2 px-1">
                <span className="font-accent text-lg text-yellow pb-1">#{id}</span>
                {rank && <span className="text-xs text-lightblue/60">Rank {rank}</span>}
            </div>
        </CartaPrimal>
    );
}
