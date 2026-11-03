import { lazy, Suspense, useEffect, useState } from 'react';
import type { Dato } from '@/components/cultomizer/WalletButton';
import { EVENTO_ABRIR_CANJE } from '@/lib/promo';
import { EVENTO_WALLET_LISTA, walletLista } from '@/lib/walletLista';
import AvatarWallet from '@/components/cultomizer/AvatarWallet';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import IconoLogout from '@/components/shared/IconoLogout';
import { FiChevronDown } from 'react-icons/fi';

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

function leerRecordada(): { address: string; primals?: string; saldo?: string } | null {
    try {
        return JSON.parse(localStorage.getItem('primal_wallet_recordada') || 'null');
    } catch {
        return null;
    }
}

function Recordada({ dato }: { dato?: Dato }) {
    const [r] = useState(leerRecordada);
    if (!r?.address) return null;
    const valor = (dato === 'saldo' ? r.saldo : r.primals) ?? '—';
    const unidad = dato === 'saldo' ? APECHAIN.moneda : valor === '1' ? 'Primal' : 'Primals';
    return (
        <div className="flex items-center gap-2 sm:gap-3" aria-busy="true">
            <div className="flex items-center gap-2 bg-darkblue rounded-full p-1 pr-3">
                <AvatarWallet direccion={r.address} size={32} redondo />
                <span className="font-accent uppercase text-lightblue tabular-nums pb-1.5">
                    {valor}
                    <span className="hidden sm:inline"> {unidad}</span>
                </span>
                <FiChevronDown aria-hidden="true" className="w-4 h-4 -ml-1 text-lightblue" strokeWidth={3} />
            </div>
            <span aria-hidden="true" className="hidden lg:block w-px h-6 bg-lightblue/20" />
            <button
                disabled
                aria-label="Log out"
                className="hidden lg:flex items-center gap-1.5 font-accent uppercase text-lightblue"
            >
                <IconoLogout />
                <span className="pb-1.5 hidden min-[1300px]:inline">Log out</span>
            </button>
        </div>
    );
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
        <Suspense fallback={abrir ? boton : <Recordada dato={dato} />}>
            <WalletReown dato={dato} abrir={abrir} />
        </Suspense>
    );
}
