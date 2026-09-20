import type { APIRoute } from "astro";
import { client, json, errorJson } from "../../../lib/cultomizer/client";
import {
  NFT_CONTRACT_ADDRESS,
  NFT_ABI,
  normalizeIpfs,
} from "../../../lib/cultomizer/contracts";

// Corre en el servidor: consulta la cadena y sale a buscar la metadata a IPFS,
// cosas que no se pueden resolver al generar el sitio.
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const tokenId = url.searchParams.get("tokenId");
  if (!tokenId) {
    return json({ error: "tokenId es requerido" }, 400);
  }

  try {
    const rawUri = await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    });

    const tokenURI = normalizeIpfs(rawUri);
    let metadata: Record<string, unknown> = {};
    let imageUrl = "";

    if (tokenURI) {
      const response = await fetch(tokenURI);
      if (response.ok) {
        metadata = await response.json();
        imageUrl = normalizeIpfs(String(metadata?.image ?? ""));
      }
    }

    return json({
      tokenId,
      tokenURI,
      imageUrl,
      metadata,
      name: metadata?.name || `PrimaCult #${tokenId}`,
    });
  } catch (error) {
    return errorJson("No se pudo obtener metadata del NFT", error);
  }
};
