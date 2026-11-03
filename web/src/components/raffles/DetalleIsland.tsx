import type { RaffleDetalle } from '@/lib/raffles';
import Detalle from './Detalle';

export default function DetalleIsland({ id, inicial }: { id: string; inicial: RaffleDetalle | null }) {
    return <Detalle id={id} inicial={inicial} />;
}
