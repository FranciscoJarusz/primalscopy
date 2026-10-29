import WalletButton, { type Dato } from '@/components/cultomizer/WalletButton';
import WalletProvider from '@/components/cultomizer/WalletProvider';

export default function WalletReown({ dato, abrir }: { dato?: Dato; abrir?: boolean }) {
    return (
        <WalletProvider>
            <WalletButton dato={dato} abrir={abrir} />
        </WalletProvider>
    );
}
