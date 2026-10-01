// El pago de un roll: una transferencia de APE al treasury, y despues avisarle
// al backend el hash para que la verifique y la registre como roll pagado.
//
// El hash se guarda en localStorage apenas la wallet lo devuelve, antes de
// esperar la confirmacion. Si la pestaña se cierra o se corta la conexion en el
// medio, al volver a entrar se informa ese hash y el roll pagado aparece: la
// plata ya salio, asi que nunca se pierde el registro de que se pago.
import {
    getAccount,
    sendTransaction,
    switchChain,
    waitForTransactionReceipt,
} from '@wagmi/core';
import { wagmiConfig } from '@/lib/cultomizer/wallet';
import { BACKEND_URL } from './forge';
import type { PaymentInfo } from './tipos';

type Cobro = Extract<PaymentInfo, { required: true }>;
type Hash = `0x${string}`;

const clave = (wallet: string) => `forge:pago:${wallet.toLowerCase()}`;

export function pagoSinInformar(wallet: string): Hash | null {
    try {
        const hash = localStorage.getItem(clave(wallet));
        return hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? (hash as Hash) : null;
    } catch {
        return null;
    }
}

function recordar(wallet: string, hash: Hash | null) {
    try {
        if (hash) localStorage.setItem(clave(wallet), hash);
        else localStorage.removeItem(clave(wallet));
    } catch {
        /* storage bloqueado: el pago sigue, solo se pierde la recuperacion */
    }
}

export class PagoError extends Error {}

// Manda la transferencia y devuelve el hash. Si la wallet esta en otra red,
// primero le pide cambiar.
export async function transferir(cobro: Cobro): Promise<Hash> {
    const cuenta = getAccount(wagmiConfig);
    if (!cuenta.address) throw new PagoError('Connect your wallet first.');

    try {
        if (cuenta.chainId !== cobro.chainId) {
            await switchChain(wagmiConfig, { chainId: cobro.chainId as never });
        }
        const hash = await sendTransaction(wagmiConfig, {
            to: cobro.treasury,
            value: BigInt(cobro.priceWei),
            chainId: cobro.chainId as never,
        });
        recordar(cuenta.address, hash);
        return hash;
    } catch (err) {
        if (rechazado(err)) throw new PagoError('Payment cancelled.');
        throw new PagoError(
            err instanceof Error && 'shortMessage' in err
                ? String((err as { shortMessage: unknown }).shortMessage)
                : 'The payment could not be sent.'
        );
    }
}

export async function esperarConfirmacion(cobro: Cobro, hash: Hash) {
    const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        chainId: cobro.chainId as never,
        confirmations: cobro.confirmations,
    });
    if (receipt.status !== 'success') {
        throw new PagoError('The payment failed on chain. Nothing was charged.');
    }
}

// Le pasa el hash al backend. Mientras el backend todavia no ve las
// confirmaciones (su nodo puede ir un bloque atras del de la wallet) responde
// 409 not-confirmed, y se reintenta. Devuelve cuantos rolls pagados hay.
export async function informar(
    wallet: string,
    hash: Hash,
    sessionToken: string
): Promise<number> {
    for (let intento = 0; intento < 20; intento++) {
        const r = await fetch(`${BACKEND_URL}/forge/payments`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ txHash: hash }),
        });
        const data = await r.json().catch(() => ({}));

        if (r.ok) {
            recordar(wallet, null);
            return data.paidRolls ?? 0;
        }
        if (data.code === 'not-confirmed' || r.status >= 500) {
            await new Promise((res) => setTimeout(res, 3000));
            continue;
        }
        // Un rechazo definitivo (monto, destino, otra wallet): el hash no va
        // a valer nunca, no tiene sentido guardarlo.
        recordar(wallet, null);
        throw new PagoError(data.error || 'The payment was not accepted.');
    }
    throw new PagoError(
        'The payment is taking long to confirm. Reload the page in a minute: it will show up as a paid roll.'
    );
}

export async function rollsPagados(sessionToken: string): Promise<number> {
    const r = await fetch(`${BACKEND_URL}/forge/payments/me`, {
        headers: { authorization: `Bearer ${sessionToken}` },
    });
    if (!r.ok) return 0;
    const data = await r.json();
    return data.paidRolls ?? 0;
}

function rechazado(err: unknown) {
    const nombre = (err as { name?: string })?.name ?? '';
    const texto = err instanceof Error ? err.message : '';
    return (
        nombre === 'UserRejectedRequestError' ||
        /user rejected|user denied|rejected the request/i.test(texto)
    );
}
