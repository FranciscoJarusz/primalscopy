import { useState, useEffect, type ReactNode } from "react";

/// Barra de arriba, pensada para vivir igual en esta pagina y en el Cultomizer.
///
/// Por eso no sabe nada de raffles ni de wallets: lo que va a la derecha entra
/// por `children`. Aca le pasamos el selector de cuentas de la demo; el
/// Cultomizer le pasara su boton de conectar wallet.
///
/// En pantallas chicas las secciones se van a un panel desplegable, y lo que
/// venga por `children` se queda en la barra: si es el boton de conectar
/// wallet, tiene que estar a mano siempre.

export type Seccion = { nombre: string; href: string; id: string };

// Las tres secciones del sitio. Desde que el Cultomizer se mudo a este mismo
// proyecto son todas rutas internas: no queda ningun salto a otro dominio.
export const SECCIONES: Seccion[] = [
  { id: "home", nombre: "Home", href: "/" },
  { id: "raffles", nombre: "Raffles", href: "/raffles" },
  { id: "cultomizer", nombre: "Cultomizer", href: "/cultomizer" },
];

type Props = {
  activo?: string;
  secciones?: Seccion[];
  children?: ReactNode;
};

export default function Header({
  activo = "raffles",
  secciones = SECCIONES,
  children,
}: Props) {
  const [abierto, setAbierto] = useState(false);

  // Con Escape se cierra, como cualquier menu.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const clase = (id: string) =>
    id === activo
      ? "font-semibold bg-white/10 text-white"
      : "font-semibold text-blue-200/70 hover:text-white hover:bg-white/5 transition-colors duration-200";

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050427]/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6 min-w-0">
          <a
            href="/"
            className="flex items-center gap-3 shrink-0 scale-100 hover:scale-105 transition-transform duration-300"
          >
            <img
              src="/assets/primalwhite.svg"
              alt="Primal Cult"
              className="w-8 h-8"
            />
          </a>

          {/* Las secciones, en pantallas donde entran. */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {secciones.map((s) => (
              <a
                key={s.id}
                href={s.href}
                className={`rounded-lg px-3 py-2 ${clase(s.id)}`}
              >
                {s.nombre}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {children}

          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-controls="menu-secciones"
            aria-label={abierto ? "Cerrar menu" : "Abrir menu"}
            className="md:hidden cursor-pointer rounded-lg border border-white/10 bg-white/5 p-2 text-blue-200 hover:text-white hover:bg-white/10 transition-colors duration-200"
          >
            {/* Los dos iconos estan superpuestos y se cruzan: uno se va rotando
                mientras el otro entra. Animar el <svg> entero, y no sus lineas,
                evita depender de como cada navegador ubica el origen de una
                transformacion dentro de un SVG. */}
            <span className="relative block w-5 h-5" aria-hidden="true">
              <Trazos
                className={`absolute inset-0 transition-all duration-300 ease-out motion-reduce:transition-none ${
                  abierto ? "opacity-0 rotate-90 scale-75" : "opacity-100"
                }`}
              >
                <line x1="3" y1="6" x2="17" y2="6" />
                <line x1="3" y1="10" x2="17" y2="10" />
                <line x1="3" y1="14" x2="17" y2="14" />
              </Trazos>

              <Trazos
                className={`absolute inset-0 transition-all duration-300 ease-out motion-reduce:transition-none ${
                  abierto ? "opacity-100" : "opacity-0 -rotate-90 scale-75"
                }`}
              >
                <line x1="5" y1="5" x2="15" y2="15" />
                <line x1="15" y1="5" x2="5" y2="15" />
              </Trazos>
            </span>
          </button>
        </div>
      </div>

      {/* El panel se despliega animando la fila de una grilla de 0fr a 1fr: es
          la forma de pasar de alto cero al alto que necesite el contenido sin
          tener que saberlo de antemano. Queda siempre en el DOM para que la
          animacion tenga de donde salir, asi que mientras esta cerrado no se
          puede tabular hacia adentro. */}
      <div
        className={`md:hidden grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <nav
            id="menu-secciones"
            aria-hidden={!abierto}
            className={`border-t border-white/10 px-4 py-3 flex flex-col gap-1 text-sm transition-opacity duration-200 motion-reduce:transition-none ${
              abierto ? "opacity-100 delay-75" : "opacity-0"
            }`}
          >
            {secciones.map((s) => (
              <a
                key={s.id}
                href={s.href}
                tabIndex={abierto ? 0 : -1}
                onClick={() => setAbierto(false)}
                className={`rounded-lg px-3 py-2.5 ${clase(s.id)}`}
              >
                {s.nombre}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

/// El envoltorio comun de los dos iconos: mismo trazo, mismo tamano.
function Trazos({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      {children}
    </svg>
  );
}
