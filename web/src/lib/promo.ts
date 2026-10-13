// Canje de codigos promocionales. Pide la sesion firmada (ver useWalletSession)
// pero no un Primal.
const BACKEND_URL =
    import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';

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

// Como se lee el premio: "2 Forge rolls".
export function textoPremio({ label, amount }: Pick<Canje, 'label' | 'amount'>) {
    return `${amount} ${label}${amount === 1 ? '' : 's'}`;
}
