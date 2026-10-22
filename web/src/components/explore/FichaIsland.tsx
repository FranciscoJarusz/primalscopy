import WalletProvider from '@/components/cultomizer/WalletProvider';
import type { Ficha as Datos } from '@/lib/explore';
import Ficha from './Ficha';

export default function FichaIsland({ id, inicial }: { id: string; inicial: Datos | null }) {
    return (
        <WalletProvider>
            <Ficha id={id} inicial={inicial} />
        </WalletProvider>
    );
}
