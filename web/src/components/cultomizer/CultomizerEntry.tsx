import { useAccount } from "wagmi";
import WalletProvider from "./WalletProvider";
import LoginCultomizer from "./LoginCultomizer";
import SelectorApp from "./SelectorApp";

/// La puerta de entrada del Cultomizer: login si no hay wallet, selector si la hay.
///
/// Antes eran dos URLs distintas ("/" para el login, "/selector-nft" para el
/// selector) y se saltaba de una a otra redirigiendo. Al mudarse todo a
/// /cultomizer eso quedaba como un bucle: el selector redirigia a /cultomizer
/// al detectar que no habia wallet, que es esta misma pantalla.
///
/// Con las dos en el mismo lugar no hay redireccion ninguna: cambia lo que se
/// muestra, sin recargar la pagina.
function Content() {
  const { isConnected, status } = useAccount();

  // `reconnecting` es el instante despues de recargar, mientras wagmi recupera
  // la sesion de localStorage. Mostrar el login ahi haria parpadear la pantalla
  // a alguien que ya estaba conectado.
  if (status === "connecting" || status === "reconnecting") {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-2xl text-blue-200">Connecting wallet...</div>
        </div>
      </div>
    );
  }

  return isConnected ? <SelectorApp /> : <LoginCultomizer />;
}

/// El proveedor se enchufa ACA ADENTRO y no en el archivo .astro a proposito.
///
/// Anidando dos componentes con client:only en el .astro, Astro monta cada uno
/// como una isla independiente: el de adentro no queda dentro del arbol de
/// React del de afuera, y los hooks de wagmi fallan con
/// "useConfig must be used within WagmiProvider".
export default function CultomizerEntry() {
  return (
    <WalletProvider>
      <Content />
    </WalletProvider>
  );
}
