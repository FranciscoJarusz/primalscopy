# Configuración del Customizer de PrimaCult

## Requisitos Previos

1. **Node.js** (versión 18 o superior)
2. **npm** o **yarn**
3. **Base de datos SQLite** (se crea automáticamente)

## Instalación

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Crea un archivo `.env.local` en la raíz del proyecto con:
   ```env
   # Base de datos
   DATABASE_URL="file:./prisma/dev.db"
   
   # Contrato de PrimaCult (REEMPLAZAR CON LA DIRECCIÓN REAL)
   PRIMACULT_CONTRACT_ADDRESS="0x1234567890123456789012345678901234567890"
   
   # RPC de Ethereum (REEMPLAZAR CON TU ENDPOINT)
   ETHEREUM_RPC_URL="https://mainnet.infura.io/v3/YOUR_PROJECT_ID"
   
   # NextAuth
   NEXTAUTH_SECRET="tu-secret-aqui"
   NEXTAUTH_URL="http://localhost:3000"
   
   # Backend del customizer
   NEXT_PUBLIC_BACKEND_URL="http://localhost:3001/api"
   NEXT_PUBLIC_BACKEND_BASE_URL="http://localhost:3001"
   ```

3. **Configurar la base de datos:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

## Configuración del Contrato

### 1. Dirección del Contrato
- Reemplaza `PRIMACULT_CONTRACT_ADDRESS` con la dirección real del contrato de PrimaCult
- Esta dirección debe ser la del contrato ERC-721 que contiene los NFTs

### 2. RPC de Ethereum
- Para Mainnet: Usa Infura, Alchemy o tu propio nodo
- Para Testnet: Usa la red de prueba correspondiente
- Ejemplo: `https://mainnet.infura.io/v3/TU_PROJECT_ID`

### 3. Backend del Customizer
- Asegúrate de que el backend esté corriendo en `http://localhost:3001`
- El backend debe tener las rutas `/api/nft/:nftId/customize-options` configuradas

## Flujo de Usuario

1. **Usuario conecta wallet** → Redirección automática al customizer
2. **Sincronización de NFTs** → Se obtienen los NFTs del usuario desde la blockchain
3. **Selección de NFT** → Usuario elige qué NFT personalizar
4. **Personalización** → Usuario modifica los traits del NFT
5. **Exportación** → Se genera la imagen personalizada

## Estructura de Archivos

```
wallet-web3/
├── src/
│   ├── app/
│   │   ├── customizer/          # Página principal del customizer
│   │   │   ├── page.tsx         # Lista de NFTs del usuario
│   │   │   └── [nftId]/         # Customizador específico
│   │   │       └── page.tsx     # Editor de traits
│   │   └── api/
│   │       └── user/
│   │           ├── nfts/        # API para obtener NFTs
│   │           └── sync-nfts/   # API para sincronizar desde blockchain
│   ├── components/
│   │   └── Web3Auth.tsx        # Componente de autenticación
│   └── config/
│       └── env.ts              # Configuración de variables
├── prisma/
│   └── schema.prisma           # Esquema de la base de datos
└── package.json
```

## Solución de Problemas

### Error de Conexión a la Base de Datos
```bash
npx prisma generate
npx prisma db push
```

### Error de Autenticación
- Verifica que `NEXTAUTH_SECRET` esté configurado
- Asegúrate de que la wallet esté conectada

### NFTs No Aparecen
- Verifica que `PRIMACULT_CONTRACT_ADDRESS` sea correcta
- Confirma que `ETHEREUM_RPC_URL` esté funcionando
- Usa el botón "Sincronizar NFTs" en la interfaz

### Error de Backend
- Asegúrate de que el backend esté corriendo en el puerto 3001
- Verifica que las rutas de la API estén configuradas correctamente

## Desarrollo

### Agregar Nuevos Traits
1. Actualiza el esquema de la base de datos en `prisma/schema.prisma`
2. Ejecuta `npx prisma db push`
3. Actualiza la interfaz del customizador

### Modificar la Lógica de Sincronización
- Edita `src/app/api/user/sync-nfts/route.ts`
- Ajusta el ABI del contrato según sea necesario

### Personalizar la UI
- Modifica los componentes en `src/components/`
- Actualiza los estilos en `src/app/globals.css`
