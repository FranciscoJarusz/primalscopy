// Los apodos de las wallets: se leen sin sesion, y cambiar el propio pide la
// sesion firmada (ver useWalletSession).
const BACKEND_URL =
    import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';

export const NICKNAME_FORMATO = /^[A-Za-z0-9_]{3,20}$/;

// Cuando alguien guarda su apodo, el header avisa con este evento para que la
// pagina de stats lo muestre sin recargar.
export const EVENTO_NICKNAME = 'primal:nickname';
export type DetalleNickname = { address: string; nickname: string };

// El header y la pagina de stats los piden en la misma carga: comparten uno.
let pedido: Promise<Record<string, string>> | null = null;

export function leerNicknames(): Promise<Record<string, string>> {
    pedido ??= fetch(`${BACKEND_URL}/profile/nicknames`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => {
            pedido = null;
            return {};
        });
    return pedido;
}

export async function guardarNickname(token: string, nickname: string) {
    const respuesta = await fetch(`${BACKEND_URL}/profile/nickname`, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
        throw new Error(datos.error || "Couldn't save your nickname.");
    }
    const guardado = datos.nickname as string;
    pedido = null;
    return guardado;
}

const claveSalteado = (address: string) =>
    `primal_nickname_skip_${address.toLowerCase()}`;

export function nicknameSalteado(address: string) {
    try {
        return localStorage.getItem(claveSalteado(address)) === '1';
    } catch {
        return false;
    }
}

export function saltearNickname(address: string) {
    try {
        localStorage.setItem(claveSalteado(address), '1');
    } catch {}
}
