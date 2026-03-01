'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '../contexts/WalletContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export default function ProtectedRoute({ 
  children, 
  redirectTo = '/' 
}: ProtectedRouteProps) {
  const { isConnected, loading } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isConnected) {
      router.push(redirectTo);
    }
  }, [isConnected, loading, router, redirectTo]);

  // Mostrar loading mientras se verifica la conexión
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] flex items-center justify-center">
        <div className="text-white text-2xl">🔒 Verificando conexión...</div>
      </div>
    );
  }

  // Si no está conectado, no mostrar nada (se redirigirá)
  if (!isConnected) {
    return null;
  }

  // Si está conectado, mostrar el contenido protegido
  return <>{children}</>;
}


