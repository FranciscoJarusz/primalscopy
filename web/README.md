# Sitio de Primal Cult

Landing, Cultomizer, Forge, Staking, Stats y el panel de admin en un solo
proyecto Astro, bajo `primalcult.xyz` (Vercel). Habla con el backend de
`../backend` (Express en Railway) por `PUBLIC_BACKEND_URL`.

## Rutas

| Ruta                          | Que es                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| `/`                           | Landing                                                       |
| `/cultomizer`                 | Entrada: conectar la wallet, o el selector si ya hay una      |
| `/cultomizer/select`          | Elegir el Primal a customizar                                 |
| `/cultomizer/edit?tokenId=N`  | El customizer                                                 |
| `/cultomizer/recent`          | Ultimas customizaciones publicadas                            |
| `/forge`                      | Forge: rolls pagos que cambian los traits de un Primal        |
| `/forge/select`, `/forge/roll?tokenId=N` | Elegir el Primal y hacer los rolls                 |
| `/staking`                    | Soft staking con FOG: el mapa de regiones y la tienda         |
| `/staking/win/<id>`           | Un premio de la tienda, para compartir en X (imagen propia)   |
| `/stats`                      | Holders, distribucion, quemados y el FOG de cada wallet       |
| `/admin`                      | Panel de admin (traits, apodos, codigos, staking)             |
| `/api/user/nfts`              | Los Primals de una wallet (se lee de la cadena)               |
| `/api/stats/holders`, `/api/stats/burned` | Los numeros de `/stats`                           |
| `/raffles`                    | Sorteos on-chain. **Solo en `astro dev`**: no sale a produccion |

Redirecciones del Cultomizer viejo (`cultomizer.primalcult.xyz`, en Next):
`/customizer`, `/selector-nft` y `/recent` llevan a su ruta nueva con el query,
y `/cultomizer/admin` a `/admin/traits`.

## Como esta organizado

Todo se separa por producto, no por tipo de archivo:

- `components/shared/` — Header, Footer, la isla de la wallet y los modales de
  apodo y canje. Los usan todas las paginas.
- `components/landing/`, `cultomizer/`, `forge/`, `staking/`, `stats/`,
  `admin/`, `raffles/` — uno por producto.
- `hooks/`, `lib/`, `stores/` — misma division por subcarpetas. En `lib/` sueltos
  quedan los compartidos: `backend.ts` (la URL del backend), `capas.ts` (el orden
  de las capas), `nicknames.ts` (apodos: toda wallet visible usa `nombreWallet`),
  `staking.ts`, `promo.ts`.
- `layouts/BaseLayout.astro` — el html/head comun (SEO, tarjeta para compartir).
  `LandingLayout`, `CultomizerLayout`, `AdminLayout` y `RafflesLayout` lo envuelven.
- `components/admin/AdminApp.tsx` — todo el admin es una sola app: un login y,
  adentro, pestañas que cambian sin recargar. Las paginas `/admin/<id>` existen
  para que un link directo abra en su pestaña. Para sumar una seccion, ver
  `lib/admin.ts`.

## Desarrollo

`.\dev.ps1` en la raiz del repo levanta el backend, el sitio (puerto 4321) y la
cadena local de Raffles; `.\dev.ps1 stop` los cierra y `.\dev.ps1 share` lo
publica por un link de Cloudflare.

Variables (`web/.env`):

| Variable                  | Para que                                                        |
| ------------------------- | --------------------------------------------------------------- |
| `PUBLIC_BACKEND_URL`      | La API del backend. Sin ella: `http://localhost:3001/api`       |
| `PUBLIC_REOWN_PROJECT_ID` | El proyecto de Reown (WalletConnect)                            |
| `OPENSEA_API_KEY`         | El volumen de ventas en `/stats`                                |
| `APESCAN_API_KEY`, `TROUTXYZ_BURN_SENDER` | Los quemados de `/stats`                        |
| `APECHAIN_RPC_URL`        | Otro RPC de ApeChain. Default: el publico                       |

Produccion compila con `@astrojs/vercel` (Vercel define `VERCEL=1`); en local
con `@astrojs/node`, que es lo que usa `.\dev.ps1 share`. No sacar el de Node.

Si despues de un `npm install` las islas quedan en blanco con "504 Outdated
Optimize Dep": borrar `node_modules/.vite` y reiniciar el dev.

## Dos cosas que conviene saber antes de tocar

**1. El proveedor de wallet se envuelve DENTRO de React, nunca en el `.astro`.**

Anidar dos componentes con `client:only` en un archivo `.astro` no los pone en
el mismo arbol de React: Astro monta cada uno como una isla independiente, y los
hooks de wagmi fallan con "useConfig must be used within WagmiProvider". Por eso
cada isla (`WalletIsland`, `SelectorIsland`, `CustomizerIsland`, las del Forge y
la de Staking) trae su propio `WalletProvider` adentro.

Que sean islas separadas no las desincroniza: todas importan la misma config de
`lib/cultomizer/wallet.ts`, que es un modulo unico.

**2. Las versiones de wagmi y Reown van fijas, y hay un `overrides`.**

Sin eso npm instala dos copias distintas de `@wagmi/core` (una para Reown, otra
para wagmi) con tipos incompatibles. Y si ademas se relaja la verificacion de
peers con `legacy-peer-deps`, npm mezcla versiones incompatibles y el servidor de
desarrollo deja de entregar cualquier modulo JavaScript: las paginas cargan pero
nada responde. Si actualizas una, actualiza las dos juntas y revisa el override.
