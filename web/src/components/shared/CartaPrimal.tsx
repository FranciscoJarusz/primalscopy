import { useState, type ReactNode } from 'react';
import { miniaturaPrimal } from '@/lib/staking';

const gifDe = (tokenId: string) => `https://ipfs.primalcult.xyz/images/${tokenId}.gif`;

export function ImagenPrimal({
    tokenId,
    estatica,
    gif,
    encima,
    alt = '',
    className = '',
    children,
}: {
    tokenId: string;
    estatica?: string;
    gif?: string | false;
    encima?: boolean;
    alt?: string;
    className?: string;
    children?: ReactNode;
}) {
    const [propio, setPropio] = useState(false);
    const [gifListo, setGifListo] = useState(false);
    const animado = encima ?? propio;
    return (
        <div
            onMouseEnter={encima === undefined ? () => setPropio(true) : undefined}
            onMouseLeave={encima === undefined ? () => setPropio(false) : undefined}
            className={`relative w-full aspect-square overflow-hidden bg-blue ${className}`}
        >
            <img
                src={estatica ?? miniaturaPrimal(tokenId, 384)}
                alt={alt}
                loading="lazy"
                className="w-full h-full object-cover"
            />
            {animado && gif !== false && (
                <img
                    src={gif ?? gifDe(tokenId)}
                    alt=""
                    onLoad={() => setGifListo(true)}
                    className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 ${
                        gifListo ? 'opacity-100' : 'opacity-0'
                    }`}
                />
            )}
            {children}
        </div>
    );
}

const clase =
    'shadow-lg shadow-darkblue/50 bg-darkblue rounded-xl sm:rounded-2xl group p-2 pb-3 sm:p-3 sm:pb-4 flex flex-col items-center gap-2 sm:gap-3 cursor-pointer outline-none ring-yellow hover:ring-2 focus-visible:ring-2 hover:-translate-y-1 active:scale-97 transition-all duration-300';

export default function CartaPrimal({
    tokenId,
    href,
    onClick,
    title,
    estatica,
    gif,
    alt,
    insignia,
    children,
}: {
    tokenId: string;
    href?: string;
    onClick?: () => void;
    title?: string;
    estatica?: string;
    gif?: string | false;
    alt?: string;
    insignia?: ReactNode;
    children?: ReactNode;
}) {
    const [encima, setEncima] = useState(false);
    const eventos = {
        onMouseEnter: () => setEncima(true),
        onMouseLeave: () => setEncima(false),
        title,
        className: clase,
    };
    const contenido = (
        <>
            <ImagenPrimal
                tokenId={tokenId}
                estatica={estatica}
                gif={gif}
                encima={encima}
                alt={alt ?? `Primal Cult #${tokenId}`}
                className="rounded-lg"
            >
                {insignia}
            </ImagenPrimal>
            {children}
        </>
    );
    return href ? (
        <a href={href} {...eventos}>
            {contenido}
        </a>
    ) : (
        <button type="button" onClick={onClick} {...eventos}>
            {contenido}
        </button>
    );
}
