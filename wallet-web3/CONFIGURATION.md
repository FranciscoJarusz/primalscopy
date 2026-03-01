# Configuración del Proyecto PrimaCult Wallet Web3

## 🚀 Configuración Inicial

### 1. Configurar Contratos

Edita el archivo `src/config/contracts.ts` con las direcciones reales de tus contratos:

```typescript
export const CONTRACTS = {
  PRIMACULT_NFT: {
    address: '0xTU_DIRECCION_REAL_DEL_CONTRATO', // Reemplazar aquí
    name: 'PrimaCult NFT',
    symbol: 'PRIMACULT',
    chainId: 1, // Cambiar según tu red (1 = Ethereum Mainnet, 5 = Goerli, etc.)
  },
  // ... otros contratos
};
```

### 2. Configurar Redes

En el mismo archivo, actualiza las URLs de RPC según tus necesidades:

```typescript
export const SUPPORTED_NETWORKS = {
  1: {
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://mainnet.infura.io/v3/TU_PROJECT_ID', // Reemplazar con tu Project ID
    explorer: 'https://etherscan.io',
    currency: 'ETH'
  },
  // ... otras redes
};
```

### 3. Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001/api
NEXT_PUBLIC_CONTRACT_ADDRESS=0xTU_DIRECCION_DEL_CONTRATO
NEXT_PUBLIC_CHAIN_ID=1
```

## 🔧 Funcionalidades Implementadas

### ✅ Conectividad de Wallet
- Conexión automática con MetaMask
- Detección de cambios de cuenta
- Cambio de redes automático
- Protección de rutas

### ✅ Gestión de NFTs
- Obtención automática de NFTs del usuario
- Verificación de propiedad
- Fallback a NFTs simulados si no hay conexión real
- Interfaz para seleccionar NFTs

### ✅ Redirección Automática
- Después de conectar wallet → Dressroom
- Solo usuarios conectados pueden acceder al customizer
- Protección de rutas privadas

## 🎯 Flujo de Usuario

1. **Usuario llega a la página principal**
   - Ve el botón "Conectar Wallet"
   - Interfaz limpia y atractiva

2. **Usuario conecta su wallet**
   - Se conecta con MetaMask
   - Se obtienen automáticamente sus NFTs
   - Redirección automática al dressroom

3. **Usuario en el dressroom**
   - Ve solo sus NFTs de PrimaCult
   - Puede seleccionar uno para personalizar
   - Interfaz protegida (solo usuarios conectados)

4. **Personalización**
   - Accede al customizer específico del NFT
   - Personaliza traits y características
   - Exporta el resultado

## 🛠️ Estructura del Proyecto

```
src/
├── components/
│   ├── Web3Auth.tsx          # Página principal de conexión
│   ├── ProtectedRoute.tsx    # Protección de rutas
│   └── ...
├── contexts/
│   └── WalletContext.tsx     # Estado global de wallet
├── services/
│   └── nftService.ts         # Servicio para NFTs
├── config/
│   └── contracts.ts          # Configuración de contratos
└── app/
    ├── customizer/           # Páginas del dressroom
    │   ├── page.tsx          # Lista de NFTs
    │   └── [nftId]/          # Customizer específico
    └── ...
```

## 🔒 Seguridad

- **Verificación de Propiedad**: Solo se muestran NFTs que realmente pertenecen al usuario
- **Protección de Rutas**: Acceso restringido a usuarios autenticados
- **Validación de Red**: Verificación de que el usuario esté en la red correcta
- **Manejo de Errores**: Fallbacks seguros y mensajes informativos

## 🚨 Solución de Problemas

### Error: "Red incorrecta"
- Verifica que el `chainId` en `contracts.ts` coincida con tu red
- Asegúrate de que el usuario esté en la red correcta

### Error: "No se pudieron obtener NFTs"
- Verifica que la dirección del contrato sea correcta
- Asegúrate de que el contrato implemente el estándar ERC-721
- Revisa la consola para errores específicos

### NFTs no aparecen
- Verifica que la wallet tenga NFTs del contrato especificado
- Revisa que la función `balanceOf()` funcione correctamente
- Usa la función de "Refrescar NFTs" en la interfaz

## 📝 Notas de Desarrollo

- **Modo Demo**: Si no hay conexión real, se muestran NFTs simulados
- **Responsive**: La interfaz se adapta a diferentes tamaños de pantalla
- **TypeScript**: Código completamente tipado para mayor seguridad
- **Context API**: Estado global manejado con React Context
- **Next.js 13+**: Usa las últimas características de App Router

## 🔄 Actualizaciones Futuras

- [ ] Integración con backend real para traits
- [ ] Sistema de guardado de personalizaciones
- [ ] Marketplace de traits
- [ ] Soporte para múltiples colecciones
- [ ] Integración con IPFS para metadatos
- [ ] Sistema de permisos y roles

