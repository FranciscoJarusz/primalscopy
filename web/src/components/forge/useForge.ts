// Todo lo que la pantalla de roll necesita del backend: el estado del Primal,
// los rolls pagados de la wallet y las tres acciones (rollear, elegir,
// descartar). Aca no hay nada de diseño: Roll.tsx solo muestra lo que devuelve
// este hook, y es quien pide confirmacion antes de elegir o descartar.
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import type { ForgeStatus } from './tipos';
import { BACKEND_URL } from './forge';
import {
    esperarConfirmacion,
    informar,
    pagoSinInformar,
    rollsPagados,
    transferir,
} from './pago';

export type Accion = 'roll' | 'choose' | 'cancel';
// En que parte del pago esta un roll: firmar en la wallet, esperar que la
// transaccion se confirme, y que el backend la registre.
export type FasePago = 'firmando' | 'confirmando' | 'registrando';
export type Aviso = { ok: boolean; texto: string };

export function useForge(tokenId: string, sessionToken: string | null) {
    const [status, setStatus] = useState<ForgeStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [keep, setKeep] = useState<string[]>([]);
    const [busy, setBusy] = useState<Accion | null>(null);
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const [paidRolls, setPaidRolls] = useState(0);
    const [fase, setFase] = useState<FasePago | null>(null);
    const { address } = useAccount();
    const cobra = status?.payment.required === true;

    const cargar = useCallback(async () => {
        if (!/^\d+$/.test(tokenId)) return;
        setError(null);
        try {
            const r = await fetch(`${BACKEND_URL}/forge/${tokenId}`);
            const data = await r.json();
            if (!r.ok)
                throw new Error(data.error || 'Could not load this Primal.');
            setStatus(data);
        } catch (err) {
            setStatus(null);
            setError(mensaje(err, 'Could not load this Primal.'));
        } finally {
            setLoading(false);
        }
    }, [tokenId]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    // Los rolls pagados de la wallet. Antes se informa un pago que haya
    // quedado a medias (se cerro la pestaña esperando la confirmacion): asi
    // aparece aca como roll pagado en vez de perderse.
    useEffect(() => {
        if (!cobra || !sessionToken || !address) {
            setPaidRolls(0);
            return;
        }
        let cancelado = false;
        (async () => {
            const hash = pagoSinInformar(address);
            if (hash) {
                try {
                    await informar(address, hash, sessionToken);
                } catch (err) {
                    if (!cancelado)
                        setAviso({ ok: false, texto: mensaje(err, 'Payment not accepted.') });
                }
            }
            const n = await rollsPagados(sessionToken).catch(() => 0);
            if (!cancelado) setPaidRolls(n);
        })();
        return () => {
            cancelado = true;
        };
    }, [cobra, sessionToken, address]);

    const pedir = async (accion: Accion, body: object) => {
        const r = await fetch(`${BACKEND_URL}/forge/${tokenId}/${accion}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify(body),
        });
        return { r, data: await r.json() };
    };

    // Corre una accion marcando cual esta en curso y mostrando su error.
    const correr = async (accion: Accion, fn: () => Promise<void>) => {
        setBusy(accion);
        setAviso(null);
        try {
            await fn();
        } catch (err) {
            setAviso({ ok: false, texto: mensaje(err, 'Something failed.') });
        } finally {
            setBusy(null);
            setFase(null);
        }
    };

    const rollear = () =>
        correr('roll', async () => {
            if (!status) return;
            const cobro = status.payment;

            // Sin un roll pagado, primero se paga. Si el roll falla despues de
            // pagar, el pago queda como roll pagado y el proximo click no
            // vuelve a cobrar.
            if (cobro.required && paidRolls === 0) {
                if (!address || !sessionToken)
                    throw new Error('Connect your wallet first.');
                setFase('firmando');
                const hash = await transferir(cobro);
                setFase('confirmando');
                await esperarConfirmacion(cobro, hash);
                setFase('registrando');
                setPaidRolls(await informar(address, hash, sessionToken));
                setFase(null);
            }

            const { r, data } = await pedir('roll', { keep });
            // 409 con pendiente: ya habia un roll sin resolver. Se muestra ese.
            if (r.status === 409 && data.pending) {
                setStatus({ ...status, pending: data.pending });
                return;
            }
            if (r.status === 402) {
                setPaidRolls(0);
                throw new Error('This roll needs to be paid first.');
            }
            if (!r.ok) throw new Error(data.error || 'The roll failed.');
            setStatus({ ...status, pending: data });
            if (cobro.required) setPaidRolls((n) => Math.max(0, n - 1));
        });

    const elegir = (index: number) => {
        if (!status?.pending) return;
        const { rollId } = status.pending;
        return correr('choose', async () => {
            const { r, data } = await pedir('choose', {
                rollId,
                option: index,
            });
            if (!r.ok)
                throw new Error(data.error || 'Could not apply the option.');
            setKeep([]);
            await cargar();
            setAviso({
                ok: true,
                texto: 'Done! Your Primal has its new traits.',
            });
        });
    };

    const descartar = () => {
        if (!status?.pending) return;
        const { rollId } = status.pending;
        return correr('cancel', async () => {
            const { r, data } = await pedir('cancel', { rollId });
            if (!r.ok)
                throw new Error(data.error || 'Could not discard the roll.');
            await cargar();
        });
    };

    const alternarKeep = (category: string) => {
        setKeep((prev) =>
            prev.includes(category)
                ? prev.filter((c) => c !== category)
                : prev.length < (status?.maxKeep ?? 3)
                  ? [...prev, category]
                  : prev
        );
    };

    return {
        status,
        loading,
        error,
        keep,
        busy,
        aviso,
        paidRolls,
        fase,
        rollear,
        elegir,
        descartar,
        alternarKeep,
    };
}

function mensaje(err: unknown, porDefecto: string) {
    return err instanceof Error ? err.message : porDefecto;
}
