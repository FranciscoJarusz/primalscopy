import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './database';
import { ethers } from 'ethers';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Ethereum',
      credentials: {
        message: { label: 'Message', type: 'text' },
        signature: { label: 'Signature', type: 'text' },
        address: { label: 'Address', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.message || !credentials?.signature || !credentials?.address) {
          return null;
        }

        try {
          // Verificar la firma
          const message = credentials.message;
          const signature = credentials.signature;
          const address = credentials.address;

          // Recuperar la dirección desde la firma
          const recoveredAddress = ethers.verifyMessage(message, signature);
          
          if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return null;
          }

          // Buscar o crear usuario
          let user = await prisma.user.findUnique({
            where: { walletAddress: address.toLowerCase() },
          });

          if (!user) {
            user = await prisma.user.create({
              data: {
                walletAddress: address.toLowerCase(),
              },
            });
          }

          return {
            id: user.id,
            walletAddress: user.walletAddress,
          };
        } catch (error) {
          console.error('Error en autenticación:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.walletAddress = user.walletAddress;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.walletAddress) {
        session.user.walletAddress = token.walletAddress;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
  session: {
    strategy: 'jwt',
  },
};
