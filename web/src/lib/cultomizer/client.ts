import { createPublicClient, http } from "viem";
import { apeChain } from "viem/chains";
import { APECHAIN } from "@/lib/cultomizer/contracts";

// Se usa la definicion oficial de viem en vez de armar la chain a mano: trae
// la direccion del contrato multicall3, sin la cual `client.multicall(...)`
// falla con "Chain does not support contract multicall3" y hay que consultar
// token por token. El RPC si se puede pisar por variable de entorno.
export const chain = {
  ...apeChain,
  rpcUrls: {
    ...apeChain.rpcUrls,
    default: { http: [APECHAIN.rpcUrl] },
  },
};

/// Cliente de solo lectura. Vive en el servidor: el navegador nunca lo usa.
export const client = createPublicClient({
  chain: chain,
  transport: http(),
});

/// Respuesta JSON, para no repetir headers en cada ruta.
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/// Los errores se devuelven siempre con la misma forma, asi el frontend no
/// tiene que adivinar.
export const errorJson = (mensaje: string, error: unknown, status = 500) =>
  json(
    {
      error: mensaje,
      details: error instanceof Error ? error.message : "Error desconocido",
    },
    status,
  );
