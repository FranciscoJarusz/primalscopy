import WalletProvider from '@/components/cultomizer/WalletProvider';
import Staking from './Staking';

/// Misma razon que en CustomizerIsland: el proveedor tiene que envolver desde
/// adentro de React, no anidado en el .astro.
export default function StakingIsland() {
    return (
        <WalletProvider>
            <Staking />
        </WalletProvider>
    );
}
