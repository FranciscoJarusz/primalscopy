import type { NextConfig } from "next";

// Dependencias opcionales del protocolo de pagos x402, que llegan por la cadena
// @wagmi/connectors -> @base-org/account -> @coinbase/cdp-sdk. No estan
// publicadas como dependencias reales y la app nunca ejecuta ese camino, pero
// webpack igual intenta resolverlas y falla el build.
const UNUSED_X402_MODULES = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client"
];

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(UNUSED_X402_MODULES.map((name) => [name, false]))
    };
    return config;
  },
};

export default nextConfig;
