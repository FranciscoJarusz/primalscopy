// Configuración de variables de entorno
export const config = {
  // Base de datos
  DATABASE_URL: process.env.DATABASE_URL || "file:./prisma/dev.db",
  
  // Contrato de PrimaCult (reemplazar con la dirección real)
  PRIMACULT_CONTRACT_ADDRESS: process.env.PRIMACULT_CONTRACT_ADDRESS || "0x1234567890123456789012345678901234567890",
  
  // RPC de Ethereum (reemplazar con tu endpoint)
  ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL || "https://mainnet.infura.io/v3/YOUR_PROJECT_ID",
  
  // NextAuth
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "tu-secret-aqui",
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
  
  // Backend del customizer
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api",
  BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://localhost:3001",
};

