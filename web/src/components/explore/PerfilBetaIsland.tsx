import WalletProvider from '@/components/cultomizer/WalletProvider';
import type { Perfil as Datos } from '@/lib/explore';
import PerfilBeta from './PerfilBeta';

export default function PerfilBetaIsland({ id, inicial }: { id: string; inicial: Datos | null }) {
    return (
        <WalletProvider>
            <PerfilBeta id={id} inicial={inicial} />
        </WalletProvider>
    );
}
