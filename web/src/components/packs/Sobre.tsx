import { IMAGEN_PACK, MARCA } from '@/lib/packs';

export default function Sobre({
    quieto = false,
    className = '',
}: {
    quieto?: boolean;
    className?: string;
}) {
    return (
        <div className={className}>
            <img
                src={IMAGEN_PACK}
                alt={`${MARCA.nombre} pack`}
                draggable={false}
                className={`w-full h-full object-contain drop-shadow-[0_30px_40px_rgb(0_0_0/0.8)] ${quieto ? '' : 'mw-flota'}`}
            />
        </div>
    );
}
