// src/app/recent/layout.tsx
//
// Existe solo para el noindex. Mientras la pantalla este sin anunciar, no
// queremos que Google la levante y la muestre en una busqueda: la idea es que
// llegue el que tiene el link y nadie mas.
//
// Cuando se anuncie, se borra este archivo.

import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Recent Customizations',
    robots: { index: false, follow: false }
};

export default function RecentLayout({ children }: { children: React.ReactNode }) {
    return children;
}
