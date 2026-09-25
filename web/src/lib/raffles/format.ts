import { ethers } from "ethers";
import { ACCOUNTS } from "@/lib/raffles/accounts";

/// Como se muestran las cosas. Nada de esto toca la blockchain.

export const ape = (v: bigint | number) =>
  Number(ethers.formatEther(v)).toFixed(2);

export const shortAddress = (dir: string) =>
  (dir || "").slice(0, 6) + "..." + (dir || "").slice(-4);

/// En local los ganadores son cuentas conocidas, asi que mostramos el nombre en
/// vez de la direccion. Con wallets de verdad siempre cae en la direccion corta.
export const nameOf = (dir: string) => {
  const c = ACCOUNTS.find(
    (c) => c.dir.toLowerCase() === (dir || "").toLowerCase(),
  );
  return c ? c.nombre : shortAddress(dir);
};

export function countdown(deadline: bigint | number) {
  const faltan = Number(deadline) * 1000 - Date.now();
  if (faltan <= 0) return "ended";
  const d = Math.floor(faltan / 86400000);
  const h = Math.floor((faltan % 86400000) / 3600000);
  const m = Math.floor((faltan % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
