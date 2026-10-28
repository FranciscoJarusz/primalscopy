// Las herramientas del panel de admin, en el orden de las pestañas. Para sumar
// una: se agrega aca, se registra su panel en PANELES de AdminApp.tsx y se crea
// src/pages/admin/<id>.astro (para que /admin/<id> abra directo en ella).
export const ADMIN_SECCIONES = [
    { id: 'todo', nombre: 'To do', href: '/admin/todo' },
    { id: 'economy', nombre: 'Economy', href: '/admin/economy' },
    { id: 'deliveries', nombre: 'Deliveries', href: '/admin/deliveries' },
    { id: 'raffles', nombre: 'Raffles', href: '/admin/raffles' },
    { id: 'shop', nombre: 'Shop', href: '/admin/shop' },
    { id: 'staking', nombre: 'Staking', href: '/admin/staking' },
    { id: 'promo', nombre: 'Codes', href: '/admin/promo' },
    { id: 'nicknames', nombre: 'Community', href: '/admin/nicknames' },
    { id: 'traits', nombre: 'Traits', href: '/admin/traits' },
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

const EVENTO_IR = 'admin-ir';

export function irA(id: string) {
    window.dispatchEvent(new CustomEvent(EVENTO_IR, { detail: id }));
}

export function alIrA(fn: (id: string) => void) {
    const escuchar = (e: Event) => fn((e as CustomEvent<string>).detail);
    window.addEventListener(EVENTO_IR, escuchar);
    return () => window.removeEventListener(EVENTO_IR, escuchar);
}
