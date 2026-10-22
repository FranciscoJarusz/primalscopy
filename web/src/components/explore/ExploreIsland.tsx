import WalletProvider from '@/components/cultomizer/WalletProvider';
import Explorador from './Explorador';

export default function ExploreIsland() {
    return (
        <WalletProvider>
            <Explorador />
        </WalletProvider>
    );
}
