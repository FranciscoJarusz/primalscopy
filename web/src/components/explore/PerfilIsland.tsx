import WalletProvider from '@/components/cultomizer/WalletProvider';
import type { Perfil as Datos } from '@/lib/explore';
import Perfil from './Perfil';

export default function PerfilIsland({ id, inicial }: { id: string; inicial: Datos | null }) {
    return (
        <WalletProvider>
            <Perfil id={id} inicial={inicial} />
        </WalletProvider>
    );
}
