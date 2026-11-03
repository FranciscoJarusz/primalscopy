import { RAREZAS, type CartaPack } from '@/lib/packs';

const AURA: Record<CartaPack['rareza'], string> = {
    common: '',
    uncommon: '',
    rare: 'shadow-[0_0_14px_-4px_rgb(220_215_183/0.5)]',
    epic: 'shadow-[0_0_22px_-4px_rgb(174_163_93/0.8)]',
    legendary: 'mw-legendaria',
    chosen: 'mw-legendaria ring-2 ring-[#ffe27a]',
};
export function Dorso({ className = '' }: { className?: string }) {
    return (
        <div className={`@container w-full h-full ${className}`}>
            <div className="relative w-full h-full rounded-[6cqw] bg-black border border-mw-champagne/40">
                <div className="absolute inset-[5cqw] mw-marco rounded-[3cqw] flex items-center justify-center mw-rayos">
                    <div className="mw-logo mw-brass w-[38%] aspect-274/352" />
                </div>
            </div>
        </div>
    );
}

export function Frente({
    carta,
    chica = false,
}: {
    carta: CartaPack;
    chica?: boolean;
}) {
    return (
        <div
            className={`relative w-full h-full rounded-[5%/3.6%] overflow-hidden bg-black ${AURA[carta.rareza]}`}
        >
            <img
                src={chica ? carta.miniatura : carta.imagen}
                alt={carta.nombre}
                loading="lazy"
                className="w-full h-full object-cover"
            />
        </div>
    );
}

const PASTILLA: Record<CartaPack['rareza'], string> = {
    common: 'bg-mw-fog',
    uncommon: 'bg-mw-mist/75',
    rare: 'bg-mw-mist',
    epic: 'bg-mw-champagne',
    legendary: 'mw-brass',
    chosen: 'mw-brass ring-2 ring-[#fff6c8]',
};

export function TituloCarta({ carta }: { carta: CartaPack }) {
    return (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-x-4 text-center [text-shadow:0_2px_14px_rgb(0_0_0/0.95)]">
            <span className="mw-titulo text-2xl sm:text-5xl leading-none text-mw-champagne">
                #{carta.id}
            </span>
            <span className="mw-titulo uppercase text-2xl sm:text-5xl leading-none text-mw-mist">
                {carta.nombre.replace(/^#\d+\s/, '')}
            </span>
            <span className="flex items-center gap-2 sm:gap-3 ml-2">
                {Array.from({ length: RAREZAS[carta.rareza].tier }, (_, i) => (
                    <span
                        key={i}
                        className="size-3 sm:size-5 rotate-45 bg-mw-mist shadow-[0_0_8px_rgb(0_0_0/0.9)]"
                    />
                ))}
            </span>
        </div>
    );
}

export function PastillaCarta({ carta }: { carta: CartaPack }) {
    return (
        <div
            className={`flex items-center gap-3 text-black rounded-full pl-5 pr-4 py-1.5 shadow-[0_6px_24px_rgb(0_0_0/0.6)] ${PASTILLA[carta.rareza]}`}
        >
            <span className="mw-etiqueta text-xs sm:text-sm">
                {RAREZAS[carta.rareza].nombre}
            </span>
            <span className="w-px self-stretch bg-black/25" />
            <span className="mw-titulo text-xl sm:text-2xl leading-none">
                +{RAREZAS[carta.rareza].puntos}
                <span className="text-xs sm:text-sm ml-1">PTS</span>
            </span>
        </div>
    );
}
