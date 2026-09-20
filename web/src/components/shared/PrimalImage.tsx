import { useState } from "react";

/// La imagen real de la coleccion, con una carta generica si no carga.
export default function PrimalImage({
  tokenId,
  className = "",
}: {
  tokenId: bigint | number;
  className?: string;
}) {
  const [falla, setFalla] = useState(false);

  if (falla) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-blue-900/60 to-purple-900/60 flex items-center justify-center`}
      >
        <span className="text-white/40 font-bold text-2xl">
          #{String(tokenId)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={`https://ipfs.primalcult.xyz/images/${tokenId}.gif`}
      alt={`Primal Cult #${tokenId}`}
      onError={() => setFalla(true)}
      className={`${className} object-cover`}
    />
  );
}
