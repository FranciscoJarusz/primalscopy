// Canje de codigos promocionales. Pide la sesion firmada (ver useWalletSession)
// pero no un Primal.
import type { Ganado } from '@/lib/staking';
import { BACKEND_URL } from '@/lib/backend';

// Cualquier pagina puede abrir el canje (el Forge lo hace con "Have a code?"):
// el boton de la wallet del header escucha este evento y muestra el modal.
export const EVENTO_ABRIR_CANJE = 'primal:redeem-open';
// Lo dispara el modal despues de un canje, para que el Forge muestre el roll
// nuevo sin recargar.
export const EVENTO_CANJE = 'primal:redeemed';

export type Canje = {
    code: string;
    reward: string;
    label: string;
    amount: number;
    // Si el nombre lleva "s" en plural ("2 Forge rolls"; el FOG no).
    plural?: boolean;
    // Una key o el Summon shard: lo que toco en la ruleta y la key, para
    // mostrar la animacion (ver components/staking/Ruleta.tsx).
    win?: Ganado;
    item?: { id: string; label: string; icon?: string };
};

export function abrirCanje() {
    window.dispatchEvent(new Event(EVENTO_ABRIR_CANJE));
}

export async function canjearCodigo(token: string, code: string): Promise<Canje> {
    const respuesta = await fetch(`${BACKEND_URL}/promo/redeem`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
    }).catch(() => null);
    const datos = await respuesta?.json().catch(() => ({}));
    if (!respuesta?.ok) {
        throw new Error(datos?.error || "Couldn't redeem the code.");
    }
    window.dispatchEvent(new CustomEvent<Canje>(EVENTO_CANJE, { detail: datos }));
    return datos as Canje;
}

// Como se lee el premio: "2 Forge rolls", "5,000 FOG".
export function textoPremio({ label, amount, plural = true }: Pick<Canje, 'label' | 'amount' | 'plural'>) {
    return `${amount.toLocaleString('en-US')} ${label}${plural && amount !== 1 ? 's' : ''}`;
}
