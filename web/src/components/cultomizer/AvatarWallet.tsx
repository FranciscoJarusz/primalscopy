// src/components/AvatarWallet.tsx
//
// La foto de la wallet. Si ya sabemos qué Primal tiene, ese; si no, un dibujo
// hecho con la propia dirección, que sale al instante y no pide nada a la red.
import { useEffect, useState } from "react";
import { readPrimal, type StoredPrimal } from "../../lib/cultomizer/avatarPrimal";

/// Un patrón simétrico sacado de la dirección: la misma wallet da siempre el
/// mismo dibujo, y dos wallets distintas dan dibujos distintos. Es la idea de
/// los avatares de MetaMask, en chico y sin traer una librería para esto.
function AvatarGenerado({ direccion, size }: { direccion: string; size: number }) {
    const hex = direccion.toLowerCase().replace(/^0x/, "");
    const digito = (i: number) => parseInt(hex[i % hex.length] || "0", 16);

    const tono = Math.round((parseInt(hex.slice(0, 4) || "0", 16) / 0xffff) * 360);
    const fondo = `hsl(${tono} 70% 22%)`;
    const figura = `hsl(${(tono + 40) % 360} 85% 62%)`;

    // Solo se deciden las tres primeras columnas: las otras dos son su espejo,
    // que es lo que hace que la figura se lea como una cara y no como ruido.
    const celdas: boolean[] = [];
    for (let i = 0; i < 15; i++) celdas.push(digito(i + 2) > 7);

    const paso = size / 5;

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <rect width={size} height={size} fill={fondo} rx={size / 4} />
            {celdas.map((pintada, i) => {
                if (!pintada) return null;
                const fila = Math.floor(i / 3);
                const col = i % 3;
                return (
                    <g key={i} fill={figura}>
                        <rect x={col * paso} y={fila * paso} width={paso} height={paso} />
                        <rect x={(4 - col) * paso} y={fila * paso} width={paso} height={paso} />
                    </g>
                );
            })}
        </svg>
    );
}

export default function AvatarWallet({
    direccion,
    size = 28,
}: {
    direccion: string;
    size?: number;
}) {
    const [primal, setPrimal] = useState<StoredPrimal | null>(null);
    const [fallo, setFallo] = useState(false);

    // Se lee en el navegador y no durante el render del servidor, para que lo
    // pintado en los dos lados coincida.
    useEffect(() => {
        const releer = () => {
            setPrimal(readPrimal(direccion));
            setFallo(false);
        };
        releer();
        window.addEventListener("primal-avatar-cambio", releer);
        return () => window.removeEventListener("primal-avatar-cambio", releer);
    }, [direccion]);

    const url = primal?.imageUrl
        ? primal.imageUrl
        : primal?.tokenId
          ? `https://ipfs.primalcult.xyz/images/${primal.tokenId}.gif`
          : null;

    return (
        <span
            className="block shrink-0 overflow-hidden rounded-lg ring-1 ring-white/15"
            style={{ width: size, height: size }}
        >
            {url && !fallo ? (
                <img
                    src={url}
                    alt={`Primal #${primal?.tokenId}`}
                    width={size}
                    height={size}
                    onError={() => setFallo(true)}
                    className="w-full h-full object-cover"
                />
            ) : (
                <AvatarGenerado direccion={direccion} size={size} />
            )}
        </span>
    );
}
