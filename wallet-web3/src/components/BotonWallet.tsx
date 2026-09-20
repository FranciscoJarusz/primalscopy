// src/components/BotonWallet.tsx
//
// La wallet, en tamaño barra. Es lo que va a la derecha del header.
//
// Web3Auth es la pantalla de inicio de sesión entera; esto es solo el botón,
// para las pantallas donde ya se está adentro. Usa las mismas piezas de Reown y
// wagmi que el resto de la app.

"use client";

import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect } from "wagmi";
import { useEffect, useState } from "react";
import AvatarWallet from "./AvatarWallet";

const corta = (dir: string) =>
    dir.slice(0, 6) + "..." + dir.slice(-4);

export default function BotonWallet() {
    const { open } = useAppKit();
    const { disconnect } = useDisconnect();
    const { isConnected, isConnecting, address } = useAccount();

    // wagmi lee la conexión en el navegador, así que en el primer render del
    // servidor todavía no sabe nada. Sin esto, React avisa de que lo pintado en
    // el servidor no coincide con lo que ve el navegador.
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);

    if (!montado) {
        return <div className="h-9 w-[120px] rounded-lg bg-white/5 border border-white/10" />;
    }

    if (!isConnected || !address) {
        return (
            <button
                onClick={() => open()}
                disabled={isConnecting}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 cursor-pointer px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 whitespace-nowrap"
            >
                {isConnecting ? "Connecting..." : "Connect"}
                <span className="hidden sm:inline"> Wallet</span>
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5">
            {/* La foto reemplaza a la direccion. Quien la necesite la tiene en
                el titulo y, completa, al abrir la wallet. */}
            <button
                onClick={() => open()}
                title={address}
                aria-label={`Wallet ${corta(address)}`}
                className="flex items-center cursor-pointer rounded-lg transition-transform duration-200 hover:scale-105"
            >
                <AvatarWallet direccion={address} size={28} />
            </button>
            <button
                onClick={() => disconnect()}
                aria-label="Desconectar wallet"
                title="Desconectar"
                className="cursor-pointer text-blue-200/60 hover:text-white transition-colors duration-200 border-l border-white/10 pl-2"
            >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 3h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3" />
                    <path d="M8 13l-3-3 3-3" />
                    <path d="M5 10h8" />
                </svg>
            </button>
        </div>
    );
}
