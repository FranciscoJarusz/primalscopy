import { lazy, Suspense, useEffect, useState } from 'react';
import type { Dato } from '@/components/cultomizer/WalletButton';
import { EVENTO_ABRIR_CANJE } from '@/lib/promo';
import { EVENTO_WALLET_LISTA, walletLista } from '@/lib/walletLista';

// Reown pesa ~1,7 MB. Se baja solo si hace falta: la wallet ya estaba
// conectada, otra isla de la pagina ya lo cargo, o tocan "Connect Wallet".
const cargar = () => import('@/components/shared/WalletReown');
const WalletReown = lazy(cargar);

function conectadaAntes() {
    try {
        return (
            !!localStorage.getItem('primal_wallet_recordada') ||
            localStorage.getItem('@appkit/connection_status') === 'connected'
        );
    } catch {
        return false;
    }
}

export default function WalletIsland({ dato }: { dato?: Dato }) {
    const [completa, setCompleta] = useState(() => walletLista() || conectadaAntes());
    const [abrir, setAbrir] = useState(false);

    useEffect(() => {
        if (completa) return;
        const activar = () => setCompleta(true);
        const conectar = () => {
            setAbrir(true);
            setCompleta(true);
        };
        window.addEventListener(EVENTO_WALLET_LISTA, activar);
        window.addEventListener(EVENTO_ABRIR_CANJE, conectar);
        return () => {
            window.removeEventListener(EVENTO_WALLET_LISTA, activar);
            window.removeEventListener(EVENTO_ABRIR_CANJE, conectar);
        };
    }, [completa]);

    const boton = (
        <button
            onClick={() => {
                setAbrir(true);
                setCompleta(true);
            }}
            onPointerEnter={cargar}
            onFocus={cargar}
            disabled={completa}
            className="bg-lightblue text-darkblue uppercase text-base sm:text-lg font-accent px-3 sm:px-4 pt-0.5 pb-1.5 rounded-[10px] cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300"
        >
            <span className="grid">
                <span className={`col-start-1 row-start-1 ${completa ? 'invisible' : ''}`}>
                    Connect<span className="hidden sm:inline"> Wallet</span>
                </span>
                <span className={`col-start-1 row-start-1 ${completa ? '' : 'invisible'}`}>Connecting...</span>
            </span>
        </button>
    );

    if (!completa) return boton;
    return (
        <Suspense fallback={abrir ? boton : null}>
            <WalletReown dato={dato} abrir={abrir} />
        </Suspense>
    );
}
