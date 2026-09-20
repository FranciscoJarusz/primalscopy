// La conexion de wallet, definida una sola vez para todo el sitio.
//
// Esto tiene que ser un modulo unico y no un componente: en Astro cada parte
// interactiva es una isla con su propio arbol de React, asi que el header y el
// contenido de la pantalla son dos arboles distintos. Comparten el estado de
// conexion porque los dos importan ESTA config, que es la misma instancia en
// memoria. Si cada isla armara la suya, conectarte en una no se veria en la otra.

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { apeChain, mainnet } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";

// El projectId decide, entre otras cosas, desde que dominios se permite parear
// por WalletConnect. El valor de abajo es el que venia del Cultomizer y es de un
// proyecto de un TERCERO: los dominios propios no estan en su lista permitida,
// por eso el relay corta con "Unauthorized: origin not allowed" y las wallets de
// celular no conectan (las extensiones de escritorio si, porque no usan relay).
//
// La solucion es crear un proyecto propio, gratis, en cloud.reown.com y poner su
// id en PUBLIC_REOWN_PROJECT_ID. Ahi tambien se habilitan el login social y por
// email, que hoy estan apagados por lo mismo.
const projectId =
  import.meta.env.PUBLIC_REOWN_PROJECT_ID || "0f9ff0f0497c73187c253e88cf8680c9";

// ApeChain primero: es donde vive la coleccion.
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [apeChain, mainnet];

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
  features: {
    analytics: false,
    // Apagados por el tema del projectId ajeno: son remoteFeatures y dependen
    // de la configuracion del dashboard, que no controlamos.
    email: false,
    socials: false,
  },
});
