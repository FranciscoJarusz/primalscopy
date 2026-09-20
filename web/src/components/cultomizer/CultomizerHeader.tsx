import Header from "../shared/Header";
import WalletButton from "./WalletButton";
import WalletProvider from "./WalletProvider";

/// El header necesita wallet (para el boton de conectar), asi que trae su
/// propio proveedor: es una isla aparte del contenido de la pantalla.
export default function CultomizerHeader({ activo = "cultomizer" }: { activo?: string }) {
  return (
    <WalletProvider>
      <Header activo={activo}>
        <WalletButton />
      </Header>
    </WalletProvider>
  );
}
