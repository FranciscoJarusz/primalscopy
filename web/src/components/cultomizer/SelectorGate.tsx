import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { appKit } from "@/lib/cultomizer/wallet";
import SelectorApp from "@/components/cultomizer/SelectorApp";

// Cuanto se espera a que la wallet se reconecte antes de pedir que se conecte.
// Con una extension de escritorio tarda milisegundos; con WalletConnect (las
// wallets de celular) hay que levantar el relay y puede pasar varios segundos.
const ESPERA_RECONEXION_MS = 8000;

/// Esta pantalla solo tiene sentido con wallet conectada: sin eso no hay NFTs
/// que listar.
///
/// Antes, si la wallet no aparecia en 2 segundos, se volvia al Hero. En el
/// celular eso era un bucle: WalletConnect tardaba mas en reconectar, el Hero
/// la veia conectada y mandaba de nuevo aca, y de aca se volvia al Hero. Ahora
/// nunca se redirige: mientras se espera se muestra "Connecting wallet...", y
/// si no llega se ofrece conectarla aca mismo. Si la reconexion llega tarde,
/// la lista aparece sola, porque `isConnected` es reactivo.
export default function SelectorGate() {
  const { isConnected, status } = useAccount();
  const demo = demoCount();
  const [topeCumplido, setTopeCumplido] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setTopeCumplido(true), ESPERA_RECONEXION_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (demo) return <SelectorApp demo={demo} />;
  if (isConnected) return <SelectorApp />;

  const esperando =
    !topeCumplido || status === "connecting" || status === "reconnecting";

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      {esperando ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-2xl text-blue-200">Connecting wallet...</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 text-center">
          <p className="text-xl sm:text-2xl text-lightblue max-w-md">
            Connect your wallet to see your Primals.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5 font-accent uppercase">
            <button
              type="button"
              onClick={() => appKit.open()}
              className="bg-yellow text-darkblue px-6 pt-2 pb-3.5 rounded-[10px] hover:scale-102 active:scale-97 transition-all duration-300"
            >
              Connect wallet
            </button>
            <a
              href="/cultomizer"
              className="inset-ring-2 inset-ring-yellow text-yellow px-6 pt-2 pb-3.5 rounded-[10px] hover:bg-yellow hover:text-darkblue active:scale-97 transition-all duration-300"
            >
              Back
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/// `?demo=N` muestra N NFTs de ejemplo sin wallet, para mirar el layout.
/// Solo en dev: en produccion la pantalla sigue exigiendo wallet.
function demoCount(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const n = Number(new URLSearchParams(window.location.search).get("demo"));
  return n > 0 ? Math.min(n, 500) : undefined;
}
