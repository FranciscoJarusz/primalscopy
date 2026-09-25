import { useEffect } from "react";
import { useAccount } from "wagmi";
import { replaceWith } from "@/lib/navigation";
import SelectorApp from "@/components/cultomizer/SelectorApp";

/// Esta pantalla solo tiene sentido con wallet conectada: sin eso no hay NFTs
/// que listar. Si alguien llega directo por URL sin conectar, se manda de
/// vuelta al Hero (que es quien ofrece "Customize" y "Use Demo").
export default function SelectorGate() {
  const { isConnected, status } = useAccount();
  const demo = demoCount();

  useEffect(() => {
    if (demo) return;
    if (status !== "connecting" && status !== "reconnecting" && !isConnected) {
      replaceWith("/cultomizer");
    }
  }, [status, isConnected, demo]);

  if (demo) return <SelectorApp demo={demo} />;

  if (status === "connecting" || status === "reconnecting" || !isConnected) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-2xl text-blue-200">Connecting wallet...</div>
        </div>
      </div>
    );
  }

  return <SelectorApp />;
}

/// `?demo=N` muestra N NFTs de ejemplo sin wallet, para mirar el layout.
/// Solo en dev: en produccion la pantalla sigue exigiendo wallet.
function demoCount(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const n = Number(new URLSearchParams(window.location.search).get("demo"));
  return n > 0 ? Math.min(n, 500) : undefined;
}
