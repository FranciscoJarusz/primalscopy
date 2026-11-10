import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IMAGEN_PACK, type ConfigPacks, type Nivel } from '@/lib/packs';

const packs = (n: number) => `${n} ${n === 1 ? 'Pack' : 'Packs'}`;

export default function PacksDesbloqueados({
    tier,
    config,
    onCerrar,
}: {
    tier: Nivel;
    config: ConfigPacks;
    onCerrar: () => void;
}) {
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [onCerrar]);

    const { tiers, extra } = config;
    const cantidad = tiers[tier];
    const masHolder = tiers.holder - tiers.none;
    const masStaker = tiers.staker - tiers.holder;
    const enlace = 'text-mw-champagne underline underline-offset-4 hover:text-mw-mist transition-all duration-300';

    const quien = {
        none: 'You are not eligible as a holder of Primal Cult',
        holder: 'You are a holder of Primal Cult without staked Primals',
        staker: 'You are a staked Primal Cult holder',
    }[tier];

    let siguiente: React.ReactNode = null;
    if (tier === 'none' && masHolder > 0)
        siguiente = (
            <>
                To receive {masHolder} more {masHolder === 1 ? 'pack' : 'packs'}, you need to own a{' '}
                <a href="https://opensea.io/collection/primalcult" target="_blank" rel="noopener" className={enlace}>
                    Primal Cult NFT
                </a>
                .
            </>
        );
    else if (tier === 'holder' && masStaker > 0)
        siguiente = (
            <>
                To receive {masStaker === 1 ? 'an extra pack' : `${masStaker} extra packs`}, stake your Primal Cult NFTs in{' '}
                <a href="/staking" className={enlace}>
                    Staking
                </a>
                .
            </>
        );
    else if (tier === 'staker')
        siguiente = (
            <>
                You will receive {cantidad} free {cantidad === 1 ? 'pack' : 'packs'} daily
                {extra ? `, with the chance to buy ${extra.max} more extras every 24 hours` : ''}.
            </>
        );

    return createPortal(
        <div
            onClick={onCerrar}
            data-lenis-prevent
            className="mw-texto fixed inset-0 z-70 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-aparece"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="packs-desbloqueados"
                onClick={(e) => e.stopPropagation()}
                className="mw-marco relative w-full max-w-lg rounded-xl bg-black px-6 py-8 sm:px-10 sm:py-10 flex flex-col items-center gap-6 text-center text-mw-mist"
            >
                <button
                    type="button"
                    onClick={onCerrar}
                    aria-label="Close"
                    className="absolute top-3 right-4 text-3xl leading-none text-mw-fog hover:text-mw-champagne cursor-pointer transition-all duration-300"
                >
                    ×
                </button>
                <h2 id="packs-desbloqueados" className="mw-titulo uppercase text-4xl sm:text-5xl leading-none mw-brass-texto">
                    Packs unlocked!
                </h2>
                <div className="relative h-40 sm:h-48 w-full flex items-end justify-center mw-rayos rounded-lg">
                    {Array.from({ length: cantidad }, (_, i) => {
                        const centro = (cantidad - 1) / 2;
                        const giro = (i - centro) * 9;
                        return (
                            <img
                                key={i}
                                src={IMAGEN_PACK}
                                alt=""
                                aria-hidden="true"
                                className="h-36 sm:h-44 w-auto -mx-6 sm:-mx-7 origin-bottom drop-shadow-[0_12px_20px_rgb(0_0_0/0.8)]"
                                style={{ transform: `rotate(${giro}deg) translateY(${Math.abs(i - centro) * 6}px)`, zIndex: cantidad - Math.round(Math.abs(i - centro)) }}
                            />
                        );
                    })}
                </div>
                <p className="text-xl leading-snug">
                    {quien}, your free pack {cantidad === 1 ? 'allocation is' : 'allocations are'}:{' '}
                    <span className="mw-titulo text-mw-champagne whitespace-nowrap">{packs(cantidad)}</span>
                </p>
                {siguiente && <p className="text-lg text-mw-mist/75 leading-snug">{siguiente}</p>}
                <button
                    type="button"
                    onClick={onCerrar}
                    className="mw-boton-brillo mw-titulo uppercase text-black text-lg rounded-md px-9 py-3 tracking-wider cursor-pointer hover:scale-105 active:scale-97 transition-all duration-300"
                >
                    <span className="mw-boton-reflejo" aria-hidden="true" />
                    <span className="relative">Start ripping</span>
                </button>
            </div>
        </div>,
        document.body
    );
}
