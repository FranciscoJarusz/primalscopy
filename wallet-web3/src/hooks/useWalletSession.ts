// src/hooks/useWalletSession.ts
//
// Sesion probada con el backend.
//
// Conectar la wallet (lo que hace la pantalla de inicio) NO prueba nada ante
// el backend: el front puede decir que es cualquier direccion. Para que el
// server acepte una operacion sobre un NFT, hace falta una firma.
//
// El flujo son dos llamadas: el backend emite un nonce y el mensaje exacto a
// firmar, la wallet lo firma, y el backend devuelve un token de sesion.
//
// El token va en localStorage. Es un compromiso consciente: el front y el
// backend estan en dominios distintos, asi que una cookie seria cross-site y
// los navegadores la bloquean cada vez mas. Lo peor que puede hacer alguien
// que robe este token es customizar los NFTs de esa wallet, no mover fondos.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001/api';

// Una clave por wallet: si el usuario cambia de cuenta en MetaMask no queremos
// que arrastre la sesion de la anterior.
const storageKey = (address: string) => `cultomizer_session_${address.toLowerCase()}`;

function readStoredToken(address?: string): string | null {
    if (!address || typeof window === 'undefined') return null;
    try {
        return localStorage.getItem(storageKey(address));
    } catch {
        return null;
    }
}

function storeToken(address: string, token: string | null) {
    if (typeof window === 'undefined') return;
    try {
        if (token) localStorage.setItem(storageKey(address), token);
        else localStorage.removeItem(storageKey(address));
    } catch {
        /* storage lleno o bloqueado */
    }
}

export type SessionStatus = 'disconnected' | 'checking' | 'needs-signature' | 'ready' | 'signing';

export function useWalletSession() {
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    const [token, setToken] = useState<string | null>(null);
    const [status, setStatus] = useState<SessionStatus>('disconnected');
    const [error, setError] = useState<string | null>(null);

    // Valida contra el backend el token guardado para esta wallet. No alcanza
    // con que exista en localStorage: pudo haber vencido o el server pudo haber
    // rotado el secreto.
    useEffect(() => {
        let cancelled = false;

        if (!isConnected || !address) {
            setToken(null);
            setStatus('disconnected');
            return;
        }

        const stored = readStoredToken(address);
        if (!stored) {
            setToken(null);
            setStatus('needs-signature');
            return;
        }

        setStatus('checking');
        fetch(`${BACKEND_URL}/auth/me`, { headers: { authorization: `Bearer ${stored}` } })
            .then(async response => {
                if (cancelled) return;
                if (!response.ok) {
                    storeToken(address, null);
                    setToken(null);
                    setStatus('needs-signature');
                    return;
                }
                const data = await response.json();
                // La sesion guardada podria ser de otra wallet si alguien toco
                // el localStorage a mano.
                if (data.address?.toLowerCase() !== address.toLowerCase()) {
                    storeToken(address, null);
                    setToken(null);
                    setStatus('needs-signature');
                    return;
                }
                setToken(stored);
                setStatus('ready');
            })
            .catch(() => {
                if (cancelled) return;
                setToken(null);
                setStatus('needs-signature');
            });

        return () => { cancelled = true; };
    }, [address, isConnected]);

    const signIn = useCallback(async () => {
        if (!address) return false;
        setError(null);
        setStatus('signing');
        try {
            const nonceResponse = await fetch(`${BACKEND_URL}/auth/nonce`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ address })
            });
            if (!nonceResponse.ok) throw new Error((await nonceResponse.json()).error || 'No se pudo iniciar la verificacion.');
            const { nonce, message } = await nonceResponse.json();

            // El mensaje se firma tal cual viene del backend, sin tocarlo: el
            // server verifica contra su propia copia.
            const signature = await signMessageAsync({ message });

            const verifyResponse = await fetch(`${BACKEND_URL}/auth/verify`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ nonce, signature })
            });
            if (!verifyResponse.ok) throw new Error((await verifyResponse.json()).error || 'No se pudo verificar la firma.');

            const session = await verifyResponse.json();
            storeToken(address, session.token);
            setToken(session.token);
            setStatus('ready');
            return true;
        } catch (err: unknown) {
            // Que el usuario cancele la firma en la wallet es lo normal, no un
            // error que valga la pena mostrar en rojo.
            const message = err instanceof Error ? err.message : 'Fallo la verificacion.';
            const userRejected = /user rejected|denied|rejected the request/i.test(message);
            setError(userRejected ? null : message);
            setStatus('needs-signature');
            return false;
        }
    }, [address, signMessageAsync]);

    const signOut = useCallback(() => {
        if (address) storeToken(address, null);
        setToken(null);
        setStatus(isConnected ? 'needs-signature' : 'disconnected');
    }, [address, isConnected]);

    return { address, isConnected, token, status, error, signIn, signOut };
}

export type OwnershipState = 'unknown' | 'checking' | 'owner' | 'not-owner' | 'not-found' | 'unavailable';

// Pregunta al backend si la wallet de la sesion es dueña de este token. Es
// solo para la interfaz: la seguridad de verdad la hace el backend en cada
// escritura, porque cualquiera puede saltear el front.
export function useNftOwnership(tokenId: string | null, token: string | null) {
    const [state, setState] = useState<OwnershipState>('unknown');
    const [owner, setOwner] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (!tokenId || !token) {
            setState('unknown');
            setOwner(null);
            return;
        }

        setState('checking');
        fetch(`${BACKEND_URL}/nft/${tokenId}/ownership`, { headers: { authorization: `Bearer ${token}` } })
            .then(async response => {
                if (cancelled) return;
                if (response.status === 404) return setState('not-found');
                if (!response.ok) return setState('unavailable');
                const data = await response.json();
                setOwner(data.owner ?? null);
                setState(data.isOwner ? 'owner' : 'not-owner');
            })
            .catch(() => { if (!cancelled) setState('unavailable'); });

        return () => { cancelled = true; };
    }, [tokenId, token]);

    return { state, owner };
}
