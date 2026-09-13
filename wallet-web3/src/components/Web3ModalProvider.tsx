"use client";

// Reown AppKit (antes Web3Modal).
//
// @web3modal/wagmi quedó deprecado y congelado en su ultima version (5.1.11):
// el modal abria pero nunca llegaba el URI de pareo, asi que el QR se
// renderizaba vacio y el login social abria una ventana en blanco.

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { apeChain, mainnet } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

const queryClient = new QueryClient();

const projectId = "0f9ff0f0497c73187c253e88cf8680c9";

// ApeChain primero: es donde vive la coleccion.
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [apeChain, mainnet];

const PRODUCTION_URL = "https://cultomizer.primalcult.xyz";

// WalletConnect compara esta url contra el origen real desde donde se sirve la
// app; si no coinciden, falla la verificacion de dominio. Antes estaba el
// placeholder 'https://tu-sitio-web.com', que nunca se completo.
// Tomarla de window.location hace que matchee sola en localhost, en los
// preview de Vercel y en produccion, sin tener que mantener una lista.
const appUrl = typeof window !== "undefined" ? window.location.origin : PRODUCTION_URL;

const metadata = {
    name: "Prima Cult",
    description: "Prima Cult Wardrobe",
    url: appUrl,
    // Absoluta, no relativa: la resuelve la wallet, no el navegador.
    icons: [`${appUrl}/logo.png`]
};

const wagmiAdapter = new WagmiAdapter({
    networks,
    projectId,
    ssr: true
});

createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    features: {
        // El login social (Google, X, etc.) y el de email se habilitan desde el
        // dashboard de Reown, no desde acá: AppKit los expone como
        // "remoteFeatures". Sin esa configuración el boton aparece pero abre una
        // ventana en blanco, asi que preferimos no ofrecerlos.
        // Para reactivarlos: habilitarlos en cloud.reown.com y borrar estas dos
        // lineas (por defecto vienen prendidos).
        socials: false,
        email: false,
        // La app solo necesita conectar una wallet. Apagar el resto aligera el
        // modal y evita pedirle datos de mercado a la API en cada apertura.
        swaps: false,
        onramp: false,
        send: false,
        receive: false,
        history: false
    }
});

export default function Web3ModalProvider({ children }: { children: ReactNode }) {
    return (
        <WagmiProvider config={wagmiAdapter.wagmiConfig} reconnectOnMount>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </WagmiProvider>
    );
}
