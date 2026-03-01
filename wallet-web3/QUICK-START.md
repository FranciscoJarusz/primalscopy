# 🚀 Inicio Rápido - PrimaCult Customizer

## ⚡ Configuración en 5 minutos

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar base de datos
```bash
npm run setup
```

### 3. Crear archivo .env.local
Crea un archivo `.env.local` en la raíz con:
```env
DATABASE_URL="file:./prisma/dev.db"
PRIMACULT_CONTRACT_ADDRESS="0x1234567890123456789012345678901234567890"
ETHEREUM_RPC_URL="https://mainnet.infura.io/v3/TU_PROJECT_ID"
NEXTAUTH_SECRET="tu-secret-aqui"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_BACKEND_URL="http://localhost:3001/api"
NEXT_PUBLIC_BACKEND_BASE_URL="http://localhost:3001"
```

### 4. Iniciar el proyecto
```bash
npm run dev
```

### 5. Conectar wallet
- Ve a `http://localhost:3000`
- Conecta tu wallet
- ¡Serás redirigido automáticamente al customizer!

## 🔧 Configuración Requerida

**⚠️ IMPORTANTE**: Debes configurar estas variables:

1. **`PRIMACULT_CONTRACT_ADDRESS`** - Dirección del contrato de PrimaCult
2. **`ETHEREUM_RPC_URL`** - Tu endpoint de Ethereum (Infura, Alchemy, etc.)

## 🌐 URLs

- **Frontend**: `http://localhost:3000`
- **Backend**: `http://localhost:3001` (debe estar corriendo)

## 🎯 Flujo del Usuario

1. **Conectar Wallet** → Redirección automática al customizer
2. **Sincronizar NFTs** → Obtener NFTs desde la blockchain
3. **Seleccionar NFT** → Elegir qué NFT personalizar
4. **Personalizar** → Modificar traits (Background, Fur, Tunic, Face, Eyes, Hat, Effect)
5. **Exportar** → Generar imagen personalizada

## 🆘 Problemas Comunes

### "No se pueden cargar los NFTs"
- Verifica que `PRIMACULT_CONTRACT_ADDRESS` sea correcta
- Confirma que `ETHEREUM_RPC_URL` esté funcionando
- Usa el botón "Sincronizar NFTs"

### "Error de base de datos"
```bash
npm run db:reset
npm run setup
```

### "Backend no responde"
- Asegúrate de que el backend esté corriendo en puerto 3001
- Verifica que las rutas de la API estén configuradas

## 📚 Documentación Completa

Para más detalles, consulta:
- `SETUP.md` - Configuración detallada
- `backend-config.md` - Configuración del backend

