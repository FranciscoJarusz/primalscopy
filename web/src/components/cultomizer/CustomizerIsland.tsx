import WalletProvider from "./WalletProvider";
import CustomizerApp from "./CustomizerApp";

/// Misma razon que en CultomizerEntry: el proveedor tiene que envolver desde
/// adentro de React. Si se anidaran en el .astro serian dos islas separadas y
/// los hooks de wagmi no encontrarian la config.
export default function CustomizerIsland() {
  return (
    <WalletProvider>
      <CustomizerApp />
    </WalletProvider>
  );
}
