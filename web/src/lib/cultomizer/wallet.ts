// La conexion de wallet, definida una sola vez para todo el sitio.
//
// Esto tiene que ser un modulo unico y no un componente: en Astro cada parte
// interactiva es una isla con su propio arbol de React, asi que el header y el
// contenido de la pantalla son dos arboles distintos. Comparten el estado de
// conexion porque los dos importan ESTA config, que es la misma instancia en
// memoria. Si cada isla armara la suya, conectarte en una no se veria en la otra.

import { createAppKit } from "@reown/appkit/react";
import { OptionsController } from "@reown/appkit-controllers";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { apeChain, mainnet, defineChain } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { getAccount, signMessage, watchAccount } from "@wagmi/core";
import { avisarWalletLista } from "@/lib/walletLista";
import { estadoDe, firmar, ponerWallet, verificar } from "@/lib/sesion";

// El projectId decide, entre otras cosas, desde que dominios se permite parear
// por WalletConnect. Produccion usa un proyecto propio de cloud.reown.com, con
// el id en PUBLIC_REOWN_PROJECT_ID (cargado en Vercel); los dominios permitidos
// se configuran en ese proyecto.
//
// El valor de abajo es solo el respaldo para local sin esa variable: es el que
// venia del Cultomizer viejo, de un proyecto de un TERCERO al que no tenemos
// acceso. Sus dominios permitidos no incluyen los nuestros, asi que con el las
// wallets de celular no conectan ("Unauthorized: origin not allowed"); las
// extensiones de escritorio si, porque no usan el relay.
const projectId =
  import.meta.env.PUBLIC_REOWN_PROJECT_ID || "0f9ff0f0497c73187c253e88cf8680c9";

// La blockchain local de anvil (la levanta dev.ps1), para probar el pago del
// Forge con APE de mentira. Solo existe con `astro dev`: el build de
// produccion no la incluye.
const anvilLocal = defineChain({
  id: 31337,
  caipNetworkId: "eip155:31337",
  chainNamespace: "eip155",
  name: "Anvil (local)",
  nativeCurrency: { name: "ApeCoin", symbol: "APE", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

const conSocial = import.meta.env.PUBLIC_WALLET_SOCIAL === "1";

// ApeChain primero: es donde vive la coleccion.
const networks: [AppKitNetwork, ...AppKitNetwork[]] = import.meta.env.DEV
  ? [apeChain, mainnet, anvilLocal]
  : [apeChain, mainnet];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

// WalletConnect compara esta url contra el origen real desde donde se sirve la
// pagina; si no coinciden, falla la verificacion de dominio. Tomarla de
// window.location hace que coincida sola en localhost, en los previews y en
// produccion, sin mantener una lista a mano.
const url =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://primalcult.xyz";

// createAppKit se llama una sola vez por carga de pagina. Como este modulo es
// unico, importarlo desde varias islas no lo duplica.
OptionsController.setEnableBaseAccount(false);

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: "Primal Cult",
    description: "Primal Cult Wardrobe",
    url,
    icons: ["https://primalcult.xyz/favicon.svg"],
  },
  enableCoinbase: false,
  enableBaseAccount: false,
  features: {
    analytics: false,
    // Solo con PUBLIC_WALLET_SOCIAL=1: necesitan el projectId propio y
    // activarlos en el dashboard de Reown.
    email: conSocial,
    socials: conSocial ? ["google", "x", "discord", "apple"] : false,
  },
});

watchAccount(wagmiConfig, {
  onChange: (cuenta, antes) => {
    if (cuenta.status === "connected" && cuenta.address) ponerWallet(cuenta.address);
    else if (cuenta.status === "disconnected" && antes.status !== "disconnected") ponerWallet(null);
  },
});

appKit.subscribeEvents(async (e) => {
  if (e.data.event !== "CONNECT_SUCCESS") return;
  const wallet = getAccount(wagmiConfig).address;
  if (!wallet) return;
  ponerWallet(wallet);
  await verificar(wallet);
  if (estadoDe(wallet).status === "needs-signature")
    firmar(wallet, (message) => signMessage(wagmiConfig, { message }));
});

avisarWalletLista();
