// src/components/Cascara.tsx
//
// Lo que envuelve a todas las pantallas: el header arriba y el pie abajo.
//
// Va en el layout, así una pantalla nueva los tiene sin hacer nada. La única
// que queda afuera es la de inicio de sesión: ahí todavía no hay a dónde
// navegar ni wallet conectada, y el cuadro de login se muestra solo.

"use client";

import { usePathname } from "next/navigation";
import Header, { type Seccion } from "./Header";
import Footer from "./Footer";
import BotonWallet from "./BotonWallet";

// El sitio de raffles todavia no tiene dominio propio. Se configura igual que
// las otras URLs del proyecto: poniendo NEXT_PUBLIC_RAFFLES_URL en el .env,
// sin tocar codigo. Mientras tanto apunta al Astro que corre en local.
const RAFFLES_URL =
    process.env.NEXT_PUBLIC_RAFFLES_URL || "http://localhost:4321";

const SECCIONES: Seccion[] = [
    { id: "raffles", nombre: "Raffles", href: RAFFLES_URL },
    { id: "cultomizer", nombre: "Cultomizer", href: "/selector-nft" },
    { id: "recent", nombre: "Recent", href: "/recent" },
];

/// Pantallas que se muestran solas, sin header ni pie.
const SIN_CASCARA = ["/"];

export default function Cascara({ children }: { children: React.ReactNode }) {
    const ruta = usePathname();

    if (SIN_CASCARA.includes(ruta)) return <>{children}</>;

    // Qué sección se marca como activa. El customizer se llega desde el
    // selector, así que los dos cuentan como "Cultomizer".
    const activo = ruta.startsWith("/recent") ? "recent" : "cultomizer";

    // Columna con el contenido estirado: si una pantalla tiene poco que mostrar,
    // el pie se va al fondo en vez de quedar flotando en el medio.
    return (
        <div className="min-h-screen flex flex-col">
            <Header activo={activo} secciones={SECCIONES}>
                <BotonWallet />
            </Header>

            <div className="flex-1">{children}</div>

            <div className="w-full max-w-7xl mx-auto px-4 pb-8 sm:px-8">
                <Footer />
            </div>
        </div>
    );
}
