import { useAppKit } from '@reown/appkit/react';
import { useAccount, useBalance, useDisconnect, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiEdit2, FiCreditCard } from 'react-icons/fi';
import AvatarWallet from '@/components/cultomizer/AvatarWallet';
import {
    APECHAIN,
    NFT_ABI,
    NFT_CONTRACT_ADDRESS,
} from '@/lib/cultomizer/contracts';
import { version } from '@/stores/raffles/session';
import { wagmiConfig } from '@/lib/cultomizer/wallet';
import { useWalletSession } from '@/hooks/cultomizer/useWalletSession';
import NicknameModal from '@/components/shared/NicknameModal';
import {
    leerNicknames,
    nicknameSalteado,
    saltearNickname,
} from '@/lib/nicknames';

const shortAddress = (dir: string) => dir.slice(0, 6) + '...' + dir.slice(-4);

// Cada pagina del sitio es una carga nueva: wagmi tarda unos cientos de ms en
// reconectarse y el saldo se vuelve a pedir a la cadena. Mientras tanto se
// muestra la ultima wallet conocida, en vez de "Connect Wallet" y "—".
type Recordada = { address: string; primals?: string; saldo?: string };
const CLAVE_RECORDADA = 'primal_wallet_recordada';

function leerRecordada(): Recordada | null {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_RECORDADA) || 'null');
    } catch {
        return null;
    }
}

function guardarRecordada(r: Recordada | null) {
    try {
        if (r) localStorage.setItem(CLAVE_RECORDADA, JSON.stringify(r));
        else localStorage.removeItem(CLAVE_RECORDADA);
    } catch {}
}

export type Dato = 'saldo' | 'primals';

export default function WalletButton({ dato = 'primals' }: { dato?: Dato }) {
    const { open } = useAppKit();
    const { disconnect } = useDisconnect();
    const { isConnected, isConnecting, address } = useAccount();

    const [montado, setMontado] = useState(false);
    const [recordada, setRecordada] = useState<Recordada | null>(null);
    const [resuelta, setResuelta] = useState(false);
    useEffect(() => {
        setMontado(true);
        setRecordada(leerRecordada());
        const limite = setTimeout(() => setResuelta(true), 4000);
        return () => clearTimeout(limite);
    }, []);

    // Se escucha el store de wagmi y no el status de useAccount: al reconectar,
    // AppKit pasa por 'connecting' y vuelve a 'disconnected' en el mismo
    // render, y React no llega a ver el paso intermedio.
    useEffect(
        () =>
            wagmiConfig.subscribe(
                (estado) => estado.status,
                (actual, antes) => {
                    if (actual === 'connected') setResuelta(true);
                    if (
                        actual === 'disconnected' &&
                        antes !== 'disconnected'
                    ) {
                        setResuelta(true);
                        setRecordada(null);
                        guardarRecordada(null);
                    }
                }
            ),
        []
    );

    const conectada = montado && isConnected && !!address;
    const direccion = conectada
        ? address
        : montado && !resuelta && recordada
          ? recordada.address
          : null;
    useEffect(() => {
        document.documentElement.toggleAttribute('data-wallet', !!direccion);
    }, [direccion]);
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
        query: { enabled: !!address },
    });

    const session = useWalletSession();
    const [nickname, setNickname] = useState<string | null | undefined>(undefined);
    const [modal, setModal] = useState(false);
    const [menu, setMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const holder = primals !== undefined && primals > 0n;

    useEffect(() => {
        setNickname(undefined);
        if (!address) return;
        let cancelado = false;
        leerNicknames().then((todos) => {
            if (!cancelado) setNickname(todos[address.toLowerCase()] ?? null);
        });
        return () => {
            cancelado = true;
        };
    }, [address]);

    useEffect(() => {
        if (address && holder && nickname === null && !nicknameSalteado(address)) {
            setModal(true);
        }
    }, [address, holder, nickname]);

    useEffect(() => {
        if (!menu) return;
        const fuera = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
        };
        const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
        document.addEventListener('click', fuera);
        window.addEventListener('keydown', tecla);
        return () => {
            document.removeEventListener('click', fuera);
            window.removeEventListener('keydown', tecla);
        };
    }, [menu]);

    const cerrarModal = () => {
        if (address && !nickname) saltearNickname(address);
        setModal(false);
    };

    const v = useStore(version);
    useEffect(() => {
        if (v > 0 && dato === 'saldo') refetchSaldo();
    }, [v, dato, refetchSaldo]);

    const saldoTexto = saldo
        ? Number(formatUnits(saldo.value, saldo.decimals)).toFixed(2)
        : undefined;
    const primalsTexto = primals?.toString();

    useEffect(() => {
        if (!conectada || !address) return;
        const previa = leerRecordada();
        const misma = previa?.address === address ? previa : null;
        guardarRecordada({
            address,
            primals: primalsTexto ?? misma?.primals,
            saldo: saldoTexto ?? misma?.saldo,
        });
    }, [conectada, address, primalsTexto, saldoTexto]);

    const deRecordada = recordada?.address === direccion ? recordada : null;
    let valor = '—';
    let unidad: string = APECHAIN.moneda;
    if (dato === 'saldo') {
        valor = saldoTexto ?? deRecordada?.saldo ?? '—';
    } else {
        valor = primalsTexto ?? deRecordada?.primals ?? '—';
        unidad = valor === '1' ? 'Primal' : 'Primals';
    }

    if (!direccion) {
        return (
            <button
                onClick={() => open()}
                disabled={!montado || isConnecting}
                className={`${montado ? '' : 'invisible '}bg-lightblue text-darkblue uppercase text-base sm:text-lg font-accent px-3 sm:px-4 pt-0.5 pb-1.5 rounded-[10px] cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300`}
            >
                {montado && isConnecting ? 'Connecting...' : 'Connect'}
                <span className="hidden sm:inline"> Wallet</span>
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2 sm:gap-3">
            <div ref={menuRef} className="relative">
            <button
                onClick={() => setMenu((m) => !m)}
                aria-expanded={menu}
                aria-haspopup="menu"
                title={direccion}
                aria-label={`Wallet ${shortAddress(direccion)}, ${valor} ${unidad}`}
                className="group flex items-center gap-2 bg-darkblue rounded-full p-1 pr-3 cursor-pointer ring-yellow hover:ring-2 transition-all duration-300"
            >
                <AvatarWallet direccion={direccion} size={32} redondo />
                <span className="font-accent uppercase text-lightblue group-hover:text-yellow tabular-nums pb-1.5 transition-colors duration-300">
                    {valor}
                    <span className="hidden sm:inline"> {unidad}</span>
                </span>
                <FiChevronDown
                    aria-hidden="true"
                    className={`w-4 h-4 -ml-1 text-lightblue group-hover:text-yellow transition-all duration-300 ${menu ? 'rotate-180' : ''}`}
                    strokeWidth={3}
                />
            </button>

            {menu && (
                <div
                    role="menu"
                    className="absolute right-0 top-full mt-3 z-40 min-w-56 bg-darkblue rounded-2xl p-2 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col font-accent uppercase text-lg"
                >
                    {nickname && (
                        <span className="px-3 pt-1 pb-2 mb-1 border-b border-lightblue/15 text-yellow normal-case truncate">
                            {nickname}
                        </span>
                    )}
                    {holder && (
                        <button
                            role="menuitem"
                            onClick={() => {
                                setMenu(false);
                                setModal(true);
                            }}
                            className="flex items-center gap-3 rounded-lg px-3 pt-1.5 pb-2.5 text-left text-lightblue hover:text-yellow cursor-pointer transition-colors duration-300"
                        >
                            <FiEdit2 aria-hidden="true" className="mt-1 w-4 h-4" strokeWidth={2.5} />
                            {nickname ? 'Edit nickname' : 'Set nickname'}
                        </button>
                    )}
                    <button
                        role="menuitem"
                        onClick={() => {
                            setMenu(false);
                            open();
                        }}
                        className="flex items-center gap-3 rounded-lg px-3 pt-1.5 pb-2.5 text-left text-lightblue hover:text-yellow cursor-pointer transition-colors duration-300"
                    >
                        <FiCreditCard aria-hidden="true" className="mt-1 w-4 h-4" strokeWidth={2.5} />
                        Wallet
                    </button>
                </div>
            )}
            </div>

            {modal && address && (
                <NicknameModal
                    address={address}
                    actual={nickname ?? null}
                    token={session.token}
                    signIn={session.signIn}
                    onGuardado={(n) => {
                        setNickname(n);
                        setModal(false);
                    }}
                    onCerrar={cerrarModal}
                />
            )}

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
