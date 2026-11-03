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
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { BACKEND_URL } from "@/lib/backend";
import {
  firmar,
  olvidar,
  ponerWallet,
  useSesionDe,
  type SessionStatus,
} from "@/lib/sesion";

export type { SessionStatus };

export function useWalletSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const sesion = useSesionDe(isConnected ? address : null);

  useEffect(() => {
    if (isConnected && address) ponerWallet(address);
  }, [address, isConnected]);

  const signIn = useCallback(async (): Promise<string | null> => {
    if (!address) return null;
    return firmar(address, (message) => signMessageAsync({ message }));
  }, [address, signMessageAsync]);

  const signOut = useCallback(() => {
    if (address) olvidar(address);
  }, [address]);

  return {
    address,
    isConnected,
    token: sesion.token,
    status: (isConnected && address ? sesion.status : "disconnected") as SessionStatus,
    error: sesion.error,
    signIn,
    signOut,
  };
}

export type OwnershipState =
  "unknown" | "checking" | "owner" | "not-owner" | "not-found" | "unavailable";

// Pregunta al backend si la wallet de la sesion es dueña de este token. Es
// solo para la interfaz: la seguridad de verdad la hace el backend en cada
// escritura, porque cualquiera puede saltear el front.
export function useNftOwnership(tokenId: string | null, token: string | null) {
  const [state, setState] = useState<OwnershipState>("unknown");
  const [owner, setOwner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!tokenId || !token) {
      setState("unknown");
      setOwner(null);
      return;
    }

    setState("checking");
    fetch(`${BACKEND_URL}/nft/${tokenId}/ownership`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) return setState("not-found");
        if (!response.ok) return setState("unavailable");
        const data = await response.json();
        setOwner(data.owner ?? null);
        setState(data.isOwner ? "owner" : "not-owner");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [tokenId, token]);

  return { state, owner };
}
