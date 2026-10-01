import WalletProvider from '@/components/cultomizer/WalletProvider';
import Selector from './Selector';

/// Misma razon que en CustomizerIsland: el proveedor tiene que envolver desde
/// adentro de React, no anidado en el .astro.
export default function SelectorIsland() {
    return (
        <WalletProvider>
            <Selector />
        </WalletProvider>
    );
}
