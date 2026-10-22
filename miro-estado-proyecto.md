# Primal Cult: estado del proyecto (2026-10-21)

Pensado para pegar en Miro: cada `##` es un frame, cada viñeta una nota.

---

## 1. Línea de tiempo

- **Mar 2026** Nace el Cultomizer: customizer de traits con exportación de GIF, selector de NFT por wallet, pie con Discord, X y OpenSea, compartir en X.
- **Sep 2026 (1-13)** Panel de admin para subir/renombrar/borrar traits. Traits a un volumen persistente de Railway. Login con Reown AppKit. Carga de NFTs de 97 s a ~5 s.
- **13 Sep** Customizaciones persistentes: login por firma, verificación de dueño, GIF final armado en el servidor, publicación en el hosting de la colección, OpenSea refresca el NFT.
- **16-17 Sep** Pantalla "Recent Customizations" (últimas 1000, de a 50), visible para todos.
- **20-25 Sep** Landing, Raffles y Cultomizer en un solo sitio (Astro) con header y pie compartidos. Landing completa y admin propio.
- **24-27 Sep** Nace el Forge (ex LAB): rolls que cambian los traits. Cobro en APE.
- **1 Oct** **Salida a producción** en primalcult.xyz. El sitio nuevo reemplaza al Cultomizer. SEO básico.
- **2 Oct** Popup al terminar un Forge (Primal nuevo, OpenSea, tweet).
- **10 Oct** Foto de Fransz con su Primal #54 en el equipo. Versiones livianas de las animaciones para celular. La metadata se lee del hosting real.
- **13 Oct** Códigos promocionales canjeables desde la wallet.
- **17 Oct** Apodos en todo el sitio. **Soft staking con FOG**, mapa de regiones y Shop con ruletas. Se borra `wallet-web3/`.
- **18-19 Oct** Boost de FOG por tiempo limitado. Easter egg de los Exiled Twenty. Panel Shop en el admin. Tope de 30% por trait en el Forge.
- **20 Oct** Cultomizer, Forge y Staking agrupados en **Primal Hub** en el header.
- **21 Oct** Popup para compartir en X al entrenar. **Shop con compra de FOG en APE**. El mapa muestra el FOG por día. Simulador de keys en el admin.

---

## 2. Arquitectura

- **Sitio público (`web/`)**: Astro con islas de React en Vercel. Páginas: landing, Cultomizer, Forge, Staking, Store/Shop, Stats, Raffles (solo en dev), Admin.
- **Backend (`backend/`)**: Express en Railway. Verifica firmas de wallet, arma GIFs, guarda staking, tienda, códigos y Forge, y consulta la cadena.
- **Volumen persistente de Railway**: es la fuente de verdad de los traits y de todos los datos generados (staking, tienda, códigos, Forge). Los archivos del repo son solo semilla.
- **Contrato de la colección**: ApeChain, 2712 tokens, plataforma Blever (ERC721C, clon no actualizable).
- **Metadata e imágenes**: `ipfs.primalcult.xyz`. A pesar del nombre **no es IPFS**: es un servidor de un tercero (ver riesgos).
- **Dominios (GoDaddy)**: primalcult.xyz en Vercel. www y cultomizer redirigen al principal. `ipfs.` no se toca.
- **Pagos**: APE nativo en ApeChain al treasury. Sin contrato propio: el backend verifica la transacción y la convierte en crédito.
- **Auth**: login por firma de wallet. Sesión con Bearer token. La propiedad del NFT se consulta en cada escritura.
- **Repo aparte `primal-raffles`**: solo Solidity (contrato de sorteos).

---

## 3. Cultomizer

- Elegís un NFT de tu wallet y cambiás sus traits con variantes por pelaje y fondo. Hay traits `_GLOBAL` que sirven para todos.
- Guardar publica la imagen nueva en el hosting de la colección y pide a OpenSea que relea el NFT. Se ve en wallets y marketplaces.
- Los `attributes` no se tocan. Cambia solo la imagen.
- Recent Customizations muestra las últimas 1000.
- Las animaciones de la home tienen versión liviana para celular.

---

## 4. Forge (ex LAB)

- Pagás un roll en APE y salen 2 opciones. Elegís una o cancelás (**sin reembolso**). Rolls ilimitados.
- El roll cambia el trait oficial: cambia los `attributes` y el Cultomizer ofrece las variantes nuevas.
- Se conservan hasta 3 traits. Entran 6 categorías (Effect no se rollea).
- La probabilidad de cada trait es su rareza en la colección. Ningún trait pasa de 30% en un roll.
- Las 12 piezas 1/1 no pueden usar el Forge.
- Precio: hoy 20 APE en producción. **Trout pidió 5 APE** (variable de Railway, falta cambiarla).
- Los códigos promocionales pueden dar rolls gratis.

---

## 5. Soft staking con FOG ("entrenar")

**Reglas que fijó Trout**
- Off-chain, sin gas. El holder firma para entrenar y el NFT no sale de la wallet.
- **30 FOG por día** por Primal (configurable desde el admin).
- Períodos de 7, 14, 30 o 90 días, uno por región. Bonus por región: 0%, +10%, +30%, +60%.
- Bonus por cantidad de Primals en staking: 2 → +5%, 5 → +10%, 10 → +15%, 20 → +20%. Se suma al de la región.
- Se acredita día a día. Al terminar el período hay que volver a entrenar (hay "Restake").
- Vender solo deja de sumar, sin multa por ahora.
- Listar en OpenSea saca al Primal del entrenamiento (conserva lo ya acreditado). Magic Eden ya no soporta ApeChain.
- Unstake de a uno o todos: se conserva el FOG base y se pierde el bonus.
- Insignias de la persona: 90, 180 y 365 días seguidos, con 3 días de gracia. Se ven en el ranking.
- El ranking pasa a llamarse "Earned FOG" y no cuenta el FOG comprado.

**Mapa**
- Cuatro regiones: Varnoss (7d), Baum (14d), Lornshore (30d), Fogreach (90d).
- Es toda la página: zoom, arrastre y todos los Primals que están entrenando dispersos en su región.
- Muestra FOG total por región y el FOG por día de tus Primals, eventos incluidos.

**Boost**: evento por tiempo limitado, multiplicador x1.01 a x10 por 1-365 días, con cartel en el mapa. Se maneja desde el admin.

**Estado en prod**: el código está desplegado, pero el staking está en `enabled: false`. Se abre desde el admin.

---

## 6. Shop (FOG)

- Catálogo (Trout): LOWKEY 50K, HIGHKEY 500K, FOGKEY 1M, RAFFLE TICKET 5K, REROLL TICKET 20K, SUMMON SHARD 500K, APE 10/50/100 por 100K/500K/1M. Todo editable desde el admin.
- **Las keys se abren apenas se compran**, sin inventario, con una ruleta de premios (estilo Prize Wheel de Hoodlums). El premio "No win" da ~1000 FOG.
- **Summon Shard**: la misma ruleta, pero con los Primals del vault. No acuña Primals nuevos.
- Premios de NFT y APE con stock. Los de APE son entrega manual desde el admin.
- Compartir en X con una tarjeta de imagen de cada premio.
- **Buy FOG**: 1 APE = 10.000 FOG, sin máximo. Un solo saldo. Arranca cerrada, se abre desde el admin.
- Últimos premios en vivo en /staking.

---

## 7. Códigos promocionales

- Se crean en el admin con límite de usos, vencimiento y límite de intentos. No exigen tener un Primal.
- Premios: roll del Forge, FOG, keys, Summon Shard, APE y NFT.
- Se canjean desde el menú de la wallet. Quedan registrados todos los canjes.
- No se borran, se archivan.

---

## 8. Panel de admin

- Un solo login, pestañas sin recargar, todo en inglés.
- Traits: subir, renombrar, borrar, migración de la colección, estado del almacenamiento persistente.
- Staking: config, períodos, bonus, boost, verificación manual.
- Shop: Rewards, Prize wheels, Deliveries, Redemptions, Buy FOG, simulador de keys.
- Promo Codes. Recent Customizations.

---

## 9. Detalles del sitio

- Apodos: toda wallet muestra su apodo si lo tiene.
- Stats con Top holders y "Current FOG".
- Primal Hub agrupa Cultomizer, Forge y Staking.
- Easter egg de los **Exiled Twenty** (los 20 Primals reales #1382-1401) en la home.
- SEO: descripciones, tarjeta para compartir, canonical, robots y sitemap.

---

## 10. Pendientes (cosas que dependen de decisiones o de acciones)

**Para abrir al público**
- Cambiar `FORGE_ROLL_PRICE` a 5 en Railway.
- Abrir staking y venta de FOG desde el admin.
- Cargar los premios reales y el vault. Stock de APE.
- Confirmar que el volumen persista antes de abrir.
- Google Search Console + sitemap.

**Decisiones de Trout abiertas**
- Presupuesto de APE y cupos por wallet en las keys.
- Pozo de premios real de cada key (con las imágenes de las colecciones).
- Bonus gastable solo al terminar el período (hoy se puede gastar antes y queda saldo negativo si hace unstake).
- Mover un Primal a otra wallet propia cuenta como venta (on-chain no se distingue).
- Multa por vender: se ve más adelante, cuando haya token y contrato.
- Futuro: FOG para crear Primals nuevos (el contrato lo permite con `setSupply` + vouchers firmados, pero hace falta que el owner ponga como firmante una clave del backend).
- Bonus por traits o 1/1.
- Conectar el FOG con los raffles on-chain.

**Raffles**
- El contrato tiene 45 tests y simulación de invariantes. Falta conectar wallet real, probar en Curtis con el vRNG real y una **auditoría externa antes de mainnet** (custodia NFTs y plata de terceros).

---

## 11. Riesgos

- **La metadata y 1,96 GB de imágenes viven en un servidor de un tercero**, al que el equipo entró "por el costado". Si revoca el acceso o migra, la colección queda sin imágenes y no hay copia. Pendiente: backup completo y repuntar `ipfs.primalcult.xyz` a infraestructura propia (el DNS sí es del equipo, en GoDaddy).
- Credenciales de ese hosting pasaron por chats: hay que rotarlas.
- Vercel está en plan Hobby, que prohíbe uso comercial, y el Forge y la Shop cobran. Conviene pasar a Pro.
- El owner del contrato es una wallet sin confirmar de quién es.
- Sesiones de login en memoria: asume una sola instancia de Railway.

---

## 12. Cómo se trabaja

- Entorno local: `dev.ps1` levanta backend y web, y `dev.ps1 share` da un link para probar con otra persona.
- Tests del backend con `npm test`.
- Todo cambio de traits en producción se hace desde el admin, no desde commits.
