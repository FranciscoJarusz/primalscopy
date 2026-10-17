// Las herramientas del panel de admin, en el orden de las pestañas. Para sumar
// una: se agrega aca, se registra su panel en PANELES de AdminApp.tsx y se crea
// src/pages/admin/<id>.astro (para que /admin/<id> abra directo en ella).
export const ADMIN_SECCIONES = [
    { id: 'traits', nombre: 'Traits', href: '/admin/traits' },
    { id: 'nicknames', nombre: 'Nicknames', href: '/admin/nicknames' },
    { id: 'promo', nombre: 'Promo Codes', href: '/admin/promo' },
    { id: 'staking', nombre: 'Staking', href: '/admin/staking' },
];
