import WalletProvider from '@/components/cultomizer/WalletProvider';
import Roll from './Roll';

/// Misma razon que en CustomizerIsland: el proveedor tiene que envolver desde
/// adentro de React, no anidado en el .astro.
export default function RollIsland() {
    return (
        <WalletProvider>
            <Roll />
        </WalletProvider>
    );
}
