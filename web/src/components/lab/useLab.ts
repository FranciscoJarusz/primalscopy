// Todo lo que la pantalla de roll necesita del backend: el estado del Primal y
// las tres acciones (rollear, elegir, descartar). Aca no hay nada de diseño:
// Roll.tsx solo muestra lo que devuelve este hook, y es quien pide
// confirmacion antes de elegir o descartar.
import { useCallback, useEffect, useState } from 'react';
import type { LabStatus } from './tipos';
import { BACKEND_URL } from './lab';

export type Accion = 'roll' | 'choose' | 'cancel';
export type Aviso = { ok: boolean; texto: string };

export function useLab(tokenId: string, sessionToken: string | null) {
    const [status, setStatus] = useState<LabStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [keep, setKeep] = useState<string[]>([]);
    const [busy, setBusy] = useState<Accion | null>(null);
    const [aviso, setAviso] = useState<Aviso | null>(null);

    const cargar = useCallback(async () => {
        if (!/^\d+$/.test(tokenId)) return;
        setError(null);
        try {
            const r = await fetch(`${BACKEND_URL}/lab/${tokenId}`);
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

    const pedir = async (accion: Accion, body: object) => {
        const r = await fetch(`${BACKEND_URL}/lab/${tokenId}/${accion}`, {
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
        }
    };

    const rollear = () =>
        correr('roll', async () => {
            if (!status) return;
            const { r, data } = await pedir('roll', { keep });
            // 409 con pendiente: ya habia un roll sin resolver. Se muestra ese.
            if (r.status === 409 && data.pending) {
                setStatus({ ...status, pending: data.pending });
                return;
            }
            if (!r.ok) throw new Error(data.error || 'The roll failed.');
            setStatus({ ...status, pending: data });
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
        rollear,
        elegir,
        descartar,
        alternarKeep,
    };
}

function mensaje(err: unknown, porDefecto: string) {
    return err instanceof Error ? err.message : porDefecto;
}
