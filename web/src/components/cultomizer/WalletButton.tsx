import { useAppKit } from '@reown/appkit/react';
import { useAccount, useBalance, useDisconnect, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import AvatarWallet from '@/components/cultomizer/AvatarWallet';
import {
    APECHAIN,
    NFT_ABI,
    NFT_CONTRACT_ADDRESS,
} from '@/lib/cultomizer/contracts';
import { version } from '@/stores/raffles/session';

const shortAddress = (dir: string) => dir.slice(0, 6) + '...' + dir.slice(-4);

export type Dato = 'saldo' | 'primals';

export default function WalletButton({ dato = 'primals' }: { dato?: Dato }) {
    const { open } = useAppKit();
    const { disconnect } = useDisconnect();
    const { isConnected, isConnecting, address } = useAccount();

    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);

    const conectada = montado && isConnected && !!address;
    useEffect(() => {
        document.documentElement.toggleAttribute('data-wallet', conectada);
    }, [conectada]);
    useEffect(() => {
        const salir = () => disconnect();
        window.addEventListener('primal:logout', salir);
        return () => window.removeEventListener('primal:logout', salir);
    }, [disconnect]);

    const { data: saldo, refetch: refetchSaldo } = useBalance({
        address,
        chainId: APECHAIN.id,
        query: {
            enabled: !!address && dato === 'saldo',
            refetchInterval: 30_000,
        },
    });

    const { data: primals } = useReadContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: APECHAIN.id,
        query: { enabled: !!address && dato === 'primals' },
    });

    const v = useStore(version);
    useEffect(() => {
        if (v > 0 && dato === 'saldo') refetchSaldo();
    }, [v, dato, refetchSaldo]);

    let valor = '—';
    let unidad: string = APECHAIN.moneda;
    if (dato === 'saldo' && saldo) {
        valor = Number(formatUnits(saldo.value, saldo.decimals)).toFixed(2);
    } else if (dato === 'primals') {
        if (primals !== undefined) valor = primals.toString();
        unidad = primals === 1n ? 'Primal' : 'Primals';
    }

    if (!montado || !isConnected || !address) {
        return (
            <button
                onClick={() => open()}
                disabled={!montado || isConnecting}
                className="bg-lightblue text-darkblue uppercase text-base sm:text-lg font-accent px-3 sm:px-4 pt-0.5 pb-1.5 rounded-[10px] cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300"
            >
                {montado && isConnecting ? 'Connecting...' : 'Connect'}
                <span className="hidden sm:inline"> Wallet</span>
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2 sm:gap-3">
            <button
                onClick={() => open()}
                title={address}
                aria-label={`Wallet ${shortAddress(address)}, ${valor} ${unidad}`}
                className="group flex items-center gap-2 bg-darkblue rounded-full p-1 pr-3 cursor-pointer ring-yellow hover:ring-2 transition-all duration-300"
            >
                <AvatarWallet direccion={address} size={32} redondo />
                <span className="font-accent uppercase text-lightblue group-hover:text-yellow tabular-nums pb-1.5 transition-colors duration-300">
                    {valor}
                    <span className="hidden sm:inline"> {unidad}</span>
                </span>
            </button>

            <span aria-hidden="true" className="hidden lg:block w-px h-6 bg-lightblue/20" />

            <button
                onClick={() => disconnect()}
                title="Disconnect wallet"
                className="hidden lg:flex items-center gap-1.5 cursor-pointer font-accent uppercase text-lightblue hover:text-yellow transition-all duration-300"
            >
                <IconoLogout />
                <span className="pb-1.5">Log out</span>
            </button>
        </div>
    );
}

function IconoLogout() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M21,7V17a5.006,5.006,0,0,1-5,5H12a1,1,0,0,1,0-2h4a3,3,0,0,0,3-3V7a3,3,0,0,0-3-3H12a1,1,0,0,1,0-2h4A5.006,5.006,0,0,1,21,7Zm-6.293,4.293-4-4A1,1,0,1,0,9.293,8.707L11.586,11H4a1,1,0,0,0,0,2h7.586L9.293,15.293a1,1,0,1,0,1.414,1.414l4-4A1,1,0,0,0,14.707,11.293Z" />
        </svg>
    );
}
