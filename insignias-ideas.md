# Insignias — ideas para más adelante

Idea con Trout: un sistema de insignias donde **Trout diseña el arte** de cada una y el sitio las otorga solo, según lo que hace cada wallet.

## Lo que ya existe

- **Rachas de staking: 90, 180 y 365 días** (`backend/lib/stakingStore.js`, `BADGES`). Ya se calculan y quedan para siempre aunque se corte la racha. Les falta el arte.
- **Roles por cantidad de Primals** (`web/src/lib/stats/roles.ts`). Ya se muestran en el perfil y en stats. Si se hacen insignias por cantidad, que usen los mismos cortes y nombres.

## Ideas destacadas

| Insignia | De dónde sale el dato | Esfuerzo |
|---|---|---|
| Racha de staking 90 / 180 / 365 | Ya está | Solo arte |
| Cantidad de Primals (cortes de los roles) | Ownership on-chain | Bajo |
| Tiene un 1/1 | El mismo dato que el bonus 1/1 | Bajo |
| Tiene un Exiled Twenty (#1382–1401) | Ownership | Bajo |
| FOG gastado (ej. 1.000 / 10.000) | `history.jsonl` | Bajo |
| Ganó un raffle | `history.jsonl` | Bajo |
| Usó el Forge X veces | Forge | Bajo |
| Holder since 2024 / 2025 / 2026, o 1 y 2 años | Índice de transferencias on-chain | Medio |
| Minteó en el mint original | El mismo índice | Gratis con el anterior |

## "Holder since": cómo se calcula

- No hay un dato listo en ninguna API. Se arma leyendo los eventos Transfer del contrato desde su creación (bloque 7.252.166, **27/12/2024**).
- El RPC público de ApeChain solo responde en tramos de ~100.000 bloques (~18 s cada uno). Son ~460 tramos, así que la primera lectura lleva **1–2 horas en segundo plano**. Después se actualiza al instante.
- Definición propuesta: **desde cuándo la wallet tiene al menos un Primal sin haber quedado en cero.** Si vendió todo y volvió, cuenta desde la vuelta.
- Alternativa: la API de ApeScan, que es más rápida pero necesita cuenta y API key.

## Cómo programarlo

- **Sistema genérico, no código por insignia.** En el admin va una sección *Badges*, y cada insignia tiene:
  - tipo de regla
  - número
  - nombre
  - imagen subida por Trout
- **Sumar una insignia nueva no requiere deploy.**
- **Una función del backend** calcula las insignias de cada wallet. Se muestran en el perfil (`/holder`), el ranking y el explorador.
- **Las de staking pasan al sistema nuevo** sin perder las ya ganadas.
- **Orden:**
  1. El sistema y las insignias que salen de datos que ya existen.
  2. El índice on-chain y "Holder since".

## Decisiones pendientes

1. **¿Se pierden?** Mi propuesta:
   - Las de **logro** quedan para siempre: racha, años, mint, raffle, FOG gastado.
   - Las de **estado** se ven solo mientras se cumplan: cantidad, tener un 1/1 o un Exiled.
2. **Cortes exactos:** cuántos Primals, cuánto FOG, cuántos usos del Forge.
3. **Formato del arte para Trout:** cuadrado, PNG o WebP con fondo transparente, mínimo 256×256. Tiene que verse bien chico (ranking) y grande (perfil).
