// src/app/recent/layout.tsx
//
// El titulo que ve el visitante en la pestaña del navegador y el que sale
// cuando alguien comparte el link.

import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Recent Customizations',
    description: 'The latest Primal Cult artworks updated onchain by the community.'
};

export default function RecentLayout({ children }: { children: React.ReactNode }) {
    return children;
}
