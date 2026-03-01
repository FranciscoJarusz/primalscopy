# Detección Automática de NFTs

## Descripción

El sistema de detección automática de NFTs permite que cuando un usuario se conecte con su wallet, la aplicación detecte automáticamente todos los NFTs del contrato Primal Cult que posee.

## Flujo de Funcionamiento

### 1. Conexión de Wallet
- El usuario se conecta en la página principal (`Web3Auth`)
- Al conectarse exitosamente, se redirige automáticamente a `/selector-nft`

### 2. Detección Automática
- El hook `useUserNFTs` se ejecuta automáticamente
- Verifica el balance de NFTs del usuario en el contrato
- Obtiene todos los token IDs que posee el usuario
- Carga metadatos opcionales de cada NFT

### 3. Feedback Visual
- **Estado de carga**: Muestra un spinner con el balance detectado
- **Notificación flotante**: Indica el progreso de detección
- **Modal de bienvenida**: Se muestra cuando se detectan NFTs por primera vez

## Componentes Principales

### `useUserNFTs` Hook
```typescript
const { nfts, isLoading, error, balance, refreshNfts, isConnected } = useUserNFTs();
```

**Funcionalidades:**
- Detección automática de balance
- Obtención de token IDs
- Carga de metadatos opcionales
- Caché para evitar recargas innecesarias
- Refresco automático cada 30 segundos

### `useAutoNFTDetection` Hook
```typescript
const { hasDetected, isFirstConnection, detectionComplete } = useAutoNFTDetection();
```

**Funcionalidades:**
- Maneja el estado de la primera conexión
- Controla cuándo mostrar la bienvenida
- Resetea el estado al desconectarse

## Componentes de UI

### `NFTDetectionStatus`
- Notificación flotante que muestra el estado de detección
- Posiciones: Esquina superior derecha
- Estados: Cargando, Error, Éxito, Sin NFTs

### `WelcomeNFTs`
- Modal de bienvenida que aparece cuando se detectan NFTs por primera vez
- Muestra la cantidad de NFTs encontrados
- Incluye la dirección de la wallet

## Características Avanzadas

### Búsqueda y Filtros
- Búsqueda por ID o nombre de NFT
- Ordenamiento por ID o nombre
- Contador de resultados filtrados

### Refresco Manual
- Botón para refrescar la detección
- Útil si el usuario adquiere nuevos NFTs

### Manejo de Errores
- Errores de conexión a la blockchain
- Errores de contrato
- Fallback graceful

## Configuración

### Contrato NFT
```typescript
const NFT_CONTRACT_ADDRESS = '0xe277A7643562775C4f4257E23B068ba8F45608b4';
const CHAIN_ID = 137; // ApeChain
```

### Endpoint de Metadatos
```typescript
// Opcional: /api/nft-metadata?tokenId={tokenId}
// Carga metadatos desde IPFS/HTTP
```

## Logs de Depuración

El sistema incluye logs detallados para debugging:

```javascript
console.log('🔍 Detección de NFTs:', {
  address,
  isConnected,
  contractAddress: NFT_CONTRACT_ADDRESS,
  balance,
  balanceLoading,
  tokenIdsLoading,
  balanceError: balanceError?.message,
  tokenIdsError: tokenIdsError?.message
});
```

## Optimizaciones

1. **Caché por dirección**: No recarga NFTs si ya se cargaron para la misma dirección
2. **Refresco automático**: Actualiza cada 30 segundos
3. **Carga paralela**: Metadatos se cargan en paralelo
4. **Lazy loading**: Solo carga cuando es necesario

## Casos de Uso

### Usuario Nuevo
1. Se conecta por primera vez
2. **Se detecta automáticamente si está en la red correcta (ApeChain)**
3. **Si no está en ApeChain, se muestra advertencia para cambiar de red**
4. Se detectan sus NFTs automáticamente
5. Se muestra modal de bienvenida
6. Puede seleccionar cualquier NFT para editar

### Usuario Existente
1. Se reconecta con la misma wallet
2. Los NFTs se cargan desde caché
3. No se muestra modal de bienvenida
4. Puede refrescar manualmente si adquirió nuevos NFTs

### Sin NFTs
1. Se detecta balance 0
2. Se muestra mensaje informativo
3. Opción de probar con NFT de ejemplo (#1292)
