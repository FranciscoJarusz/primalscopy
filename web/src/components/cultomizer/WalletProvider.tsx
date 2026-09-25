import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { wagmiConfig } from "@/lib/cultomizer/wallet";

// En Next este proveedor se pone una vez en el layout y cubre toda la app,
// porque todo es un arbol de React. En Astro cada isla es un arbol aparte, asi
// que CADA isla que necesite wallet tiene que envolverse con esto.
//
// No las desincroniza: las dos reciben la misma `wagmiConfig`, que es un modulo
// unico, y wagmi guarda el estado de conexion ahi adentro (mas localStorage).
// Conectar en una isla se ve en la otra.

// Una sola instancia para todo el sitio. Si se creara adentro del componente,
// cada render la tiraria y perderia lo cacheado.
const queryClient = new QueryClient();

export default function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
