// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  // El sitio sigue siendo estatico por defecto: la landing y las pantallas de
  // raffles se generan una vez y se sirven como HTML, que es lo mas rapido.
  // Solo las rutas que lo piden explicitamente (`export const prerender = false`)
  // corren en el servidor — por ahora, las de /api que consultan la blockchain.
  adapter: node({ mode: 'standalone' }),

  vite: {
    plugins: [tailwindcss()]
  }
});
