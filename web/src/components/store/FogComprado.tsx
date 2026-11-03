import CompraCompleta from '@/components/shared/CompraCompleta';
import { fog, ICONO_FOG } from '@/lib/staking';

export default function FogComprado({
    cantidad,
    onGastar,
    onCerrar,
}: {
    cantidad: number;
    onGastar: () => void;
    onCerrar: () => void;
}) {
    return (
        <CompraCompleta
            imagen={ICONO_FOG}
            titular={`+${fog(cantidad)} FOG`}
            texto="Added to your wallet. Spend it on keys, rerolls and more in the Item shop."
            principal={{ texto: 'Go to Item shop', alTocar: onGastar }}
            onCerrar={onCerrar}
        />
    );
}
