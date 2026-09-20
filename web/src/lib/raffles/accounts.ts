import { ethers } from "ethers";

/// Cuentas de anvil. Sus claves son publicas y conocidas: valen solo para
/// desarrollo local. La webapp de verdad va a conectar wallet como el
/// Cultomizer, y este archivo desaparece.

export type Account = { nombre: string; clave: string; dir: string };

const CLAVES: { nombre: string; clave: string }[] = [
  { nombre: "ana", clave: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" },
  { nombre: "beto", clave: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" },
  { nombre: "caro", clave: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" },
  { nombre: "admin", clave: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" },
  { nombre: "treasury", clave: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" },
];

export const ACCOUNTS: Account[] = CLAVES.map((c) => ({
  ...c,
  dir: new ethers.Wallet(c.clave).address,
}));
