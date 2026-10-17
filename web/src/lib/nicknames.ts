// Los apodos de las wallets: se leen sin sesion, y cambiar el propio pide la
// sesion firmada (ver useWalletSession). Donde el sitio muestra una wallet,
// usa nombreWallet(): el apodo si tiene, y si no la direccion corta.
import { useEffect, useState } from 'react';
import { BACKEND_URL } from '@/lib/backend';

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

// "0x1234...abcd": como se muestra una wallet sin apodo.
export const walletCorta = (address: string) =>
    address.length <= 12 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;

// El apodo de la wallet si tiene, si no la direccion corta. Los apodos se
// guardan con la direccion en minusculas.
export function nombreWallet(address: string | null | undefined, apodos: Record<string, string>) {
    if (!address) return 'unknown';
    return apodos[address.toLowerCase()] ?? apodos[address] ?? walletCorta(address);
}

// Los apodos de todas las wallets, para pasarle a nombreWallet. Se cargan una
// vez por pagina y se actualizan cuando alguien guarda el suyo.
export function useApodos() {
    const [apodos, setApodos] = useState<Record<string, string>>({});
    useEffect(() => {
        leerNicknames().then(setApodos);
        const alGuardar = (e: Event) => {
            const { address, nickname } = (e as CustomEvent<DetalleNickname>).detail;
            setApodos((a) => ({ ...a, [address.toLowerCase()]: nickname }));
        };
        window.addEventListener(EVENTO_NICKNAME, alGuardar);
        return () => window.removeEventListener(EVENTO_NICKNAME, alGuardar);
    }, []);
    return apodos;
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
