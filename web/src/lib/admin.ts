// Las herramientas del panel de admin, en el orden de las pestañas. Para sumar
// una: se agrega aca, se registra su panel en PANELES de AdminApp.tsx y se crea
// src/pages/admin/<id>.astro (para que /admin/<id> abra directo en ella).
export const ADMIN_SECCIONES = [
    { id: 'traits', nombre: 'Traits', href: '/admin/traits' },
    { id: 'nicknames', nombre: 'Nicknames', href: '/admin/nicknames' },
    { id: 'promo', nombre: 'Promo Codes', href: '/admin/promo' },
    { id: 'staking', nombre: 'Staking', href: '/admin/staking' },
    { id: 'shop', nombre: 'Shop', href: '/admin/shop' },
];

const EVENTO_REGALAR = 'admin-regalar';
let regaloPendiente: string | null = null;

export function regalar(premio: string) {
    regaloPendiente = premio;
    window.dispatchEvent(new Event(EVENTO_REGALAR));
}

export function tomarRegalo() {
    const premio = regaloPendiente;
    regaloPendiente = null;
    return premio;
}

export function alRegalar(fn: () => void) {
    window.addEventListener(EVENTO_REGALAR, fn);
    return () => window.removeEventListener(EVENTO_REGALAR, fn);
}
