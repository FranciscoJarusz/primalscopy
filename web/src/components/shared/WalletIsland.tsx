import WalletButton, { type Dato } from '@/components/cultomizer/WalletButton';
import WalletProvider from '@/components/cultomizer/WalletProvider';

export default function WalletIsland({ dato }: { dato?: Dato }) {
    return (
        <WalletProvider>
            <WalletButton dato={dato} />
        </WalletProvider>
    );
}
