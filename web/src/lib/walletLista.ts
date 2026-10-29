import { useEffect, useState } from 'react';

export const EVENTO_WALLET_LISTA = 'primal:wallet-ready';

export const walletLista = () =>
    typeof window !== 'undefined' && Boolean((window as { __primalWallet?: boolean }).__primalWallet);

export function avisarWalletLista() {
    if (typeof window === 'undefined') return;
    (window as { __primalWallet?: boolean }).__primalWallet = true;
    window.dispatchEvent(new Event(EVENTO_WALLET_LISTA));
}

// La ultima wallet conectada (la guarda WalletButton), sin cargar wagmi.
export function useWalletRecordada() {
    const [wallet, setWallet] = useState<string | null>(null);
    useEffect(() => {
        const leer = () => {
            try {
                const r = JSON.parse(localStorage.getItem('primal_wallet_recordada') || 'null');
                setWallet(r?.address?.toLowerCase() ?? null);
            } catch {
                setWallet(null);
            }
        };
        leer();
        window.addEventListener('storage', leer);
        return () => window.removeEventListener('storage', leer);
    }, []);
    return wallet;
}
