import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { replaceWith } from "@/lib/navigation";
import SelectorApp from "@/components/cultomizer/SelectorApp";

// Tope para decidir que no hay wallet si nunca se vio la reconexion (porque
// otra isla, como el header, ya la habia terminado antes de montar esta).
const ESPERA_RECONEXION_MS = 2000;

/// Esta pantalla solo tiene sentido con wallet conectada: sin eso no hay NFTs
/// que listar. Si alguien llega directo por URL sin conectar, se manda de
/// vuelta al Hero (que es quien ofrece "Customize" y "Use Demo").
///
/// No alcanza con mirar el status del primer render: con `ssr: true`, wagmi
/// arranca en "disconnected" y recien reconecta en un efecto del proveedor,
/// que React corre DESPUES de los efectos de esta pantalla. Mirandolo de
/// entrada, una wallet conectada parecia desconectada y rebotaba al Hero.
/// Por eso se espera a ver pasar la reconexion (o el tope) antes de decidir.
export default function SelectorGate() {
  const { isConnected, status } = useAccount();
  const demo = demoCount();
  const reconexionVista = useRef(false);
  const [topeCumplido, setTopeCumplido] = useState(false);

  if (status === "connecting" || status === "reconnecting") {
    reconexionVista.current = true;
  }

  useEffect(() => {
    const t = window.setTimeout(() => setTopeCumplido(true), ESPERA_RECONEXION_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (demo || isConnected) return;
    if (status === "connecting" || status === "reconnecting") return;
    if (reconexionVista.current || topeCumplido) {
      replaceWith("/cultomizer");
    }
  }, [status, isConnected, demo, topeCumplido]);

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
