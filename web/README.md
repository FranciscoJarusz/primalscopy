# Sitio de Primal Cult

Landing, Raffles y Cultomizer en un solo proyecto Astro, bajo un solo dominio.

## Rutas

| Ruta | Que es |
|---|---|
| `/` | Landing |
| `/raffles` | Sorteos on-chain (lee el contrato en ApeChain) |
| `/cultomizer` | Entrada: login si no hay wallet, selector de NFT si la hay |
| `/cultomizer/edit?tokenId=N` | El customizer |
| `/cultomizer/recent` | Ultimas customizaciones publicadas |
| `/cultomizer/admin` | Panel de traits |
| `/api/*` | Consultas a la cadena del lado del servidor |

## Como esta organizado

Todo se separa por producto, no por tipo de archivo:

- `components/shared/` — Header, Footer, ImagenPrimal. Los usan los tres.
- `components/landing/`, `components/raffles/`, `components/cultomizer/`
- `hooks/`, `lib/`, `stores/` — misma division por subcarpetas.
- `layouts/BaseLayout.astro` — el html/head comun. `LandingLayout`,
  `RafflesLayout` y `CultomizerLayout` lo envuelven agregando su header.

## Dos cosas que conviene saber antes de tocar

**1. El proveedor de wallet se envuelve DENTRO de React, nunca en el `.astro`.**

Anidar dos componentes con `client:only` en un archivo `.astro` no los pone en
el mismo arbol de React: Astro monta cada uno como una isla independiente, y los
hooks de wagmi fallan con "useConfig must be used within WagmiProvider". Por eso
`CultomizerEntry` y `CustomizerIsland` traen su propio `WalletProvider` adentro.

Que sean islas separadas no las desincroniza: todas importan la misma config de
`lib/cultomizer/wallet.ts`, que es un modulo unico.

**2. Las versiones de wagmi y Reown van fijas, y hay un `overrides`.**

Sin eso npm instala dos copias distintas de `@wagmi/core` (una para Reown, otra
para wagmi) con tipos incompatibles. Y si ademas se relaja la verificacion de
peers con `legacy-peer-deps`, npm mezcla versiones incompatibles y el servidor de
desarrollo deja de entregar cualquier modulo JavaScript: las paginas cargan pero
nada responde. Si actualizas una, actualiza las dos juntas y revisa el override.

## Pendiente

- El `projectId` de Reown es de un proyecto de un tercero y el dominio no esta en
  su lista permitida: las wallets de celular no pueden conectarse. Se arregla
  creando un proyecto propio (gratis) en cloud.reown.com y poniendo su id en
  `PUBLIC_REOWN_PROJECT_ID`.
- La landing solo tiene el Hero. Faltan las otras 8 secciones.
