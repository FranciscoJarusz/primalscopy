import { createPublicClient, fallback, http } from "viem";
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

const urls = [...new Set([APECHAIN.rpcUrl, ...apeChain.rpcUrls.default.http])];

/// Cliente de solo lectura. Vive en el servidor: el navegador nunca lo usa.
/// Si el RPC configurado se cae, sigue con el publico.
export const client = createPublicClient({
  chain: chain,
  transport: urls.length > 1 ? fallback(urls.map((url) => http(url))) : http(),
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
      details: error instanceof Error ? error.message : "Unknown error",
    },
    status,
  );
