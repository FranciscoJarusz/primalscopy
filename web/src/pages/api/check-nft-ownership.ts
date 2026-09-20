import type { APIRoute } from "astro";
import { client, json, errorJson } from "../../lib/cultomizer/client";
import { NFT_CONTRACT_ADDRESS, NFT_ABI } from "../../lib/cultomizer/contracts";

export const prerender = false;

/// Dice si una wallet es duena de un token puntual. Lo usa el customizer antes
/// de dejar guardar cambios: conectar la wallet no prueba propiedad.
export const GET: APIRoute = async ({ url }) => {
  const tokenId = url.searchParams.get("tokenId");
  const address = url.searchParams.get("address");

  if (!tokenId || !address) {
    return json({ error: "Token ID y address son requeridos" }, 400);
  }

  try {
    // La version anterior pedia ademas tokenOfOwnerByIndex y no usaba el
    // resultado para nada: era una llamada de red de mas en cada consulta.
    const [owner, balance] = await Promise.all([
      client.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: "ownerOf",
        args: [BigInt(tokenId)],
      }),
      client.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }),
    ]);

    return json({
      tokenId,
      address,
      owner,
      balance: Number(balance),
      isOwner: owner.toLowerCase() === address.toLowerCase(),
      contractAddress: NFT_CONTRACT_ADDRESS,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorJson("Error al verificar propiedad del NFT", error);
  }
};
