// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import node from "@astrojs/node";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// Raffles todavia no sale: la pagina vive fuera de src/pages y solo se registra
// en `astro dev`, donde corre contra el anvil local. En el build de produccion
// la ruta no existe y su codigo (contrato de prueba, cuentas demo) no se empaqueta.
const rafflesSoloEnDev = {
  name: "raffles-solo-en-dev",
  hooks: {
    /** @param {{ command: string, injectRoute: (r: { pattern: string, entrypoint: string }) => void }} opciones */
    "astro:config:setup": ({ command, injectRoute }) => {
      if (command !== "dev") return;
      injectRoute({ pattern: "/raffles", entrypoint: "./src/raffles/pagina.astro" });
    },
  },
};

// https://astro.build/config
export default defineConfig({
  integrations: [react(), rafflesSoloEnDev],

  // El sitio sigue siendo estatico por defecto: la landing y el resto de las
  // pantallas se generan una vez y se sirven como HTML, que es lo mas rapido.
  // Solo las rutas que lo piden explicitamente (`export const prerender = false`)
  // corren en el servidor: las de /api que consultan la blockchain y los
  // redirects de los links del Cultomizer viejo.
  //
  // Produccion es Vercel, que define VERCEL=1 al compilar. En local se sigue
  // compilando con el adaptador de Node, porque `.\dev.ps1 share` sirve el build
  // con scripts/share-server.mjs, que importa dist/server/entry.mjs.
  adapter: process.env.VERCEL ? vercel() : node({ mode: "standalone" }),

  vite: {
    plugins: [tailwindcss()],
    // Para compartir el dev por un tunel (.\dev.ps1 share): el navegador de
    // afuera no llega a localhost:3001, asi que el backend sale por el mismo
    // origen que el sitio, bajo /backend.
    server: {
      allowedHosts: [".trycloudflare.com"],
      proxy: {
        "/backend": {
          target: "http://localhost:3001",
          rewrite: (path) => path.replace(/^\/backend/, ""),
        },
      },
    },
  },
});
