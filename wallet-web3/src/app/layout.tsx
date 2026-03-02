// src/app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthProvider from "../components/AuthProvider";
import Web3ModalProvider from "../components/Web3ModalProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PrimaCult Wallet Web3",
  description: "Conecta tu wallet y gestiona tus NFTs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AuthProvider>
          <Web3ModalProvider>
            {children}
          </Web3ModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}