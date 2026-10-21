import WalletProvider from '@/components/cultomizer/WalletProvider';
import Store from './Store';

export default function StoreIsland() {
    return (
        <WalletProvider>
            <Store />
        </WalletProvider>
    );
}
