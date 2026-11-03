import { useEffect, useSyncExternalStore } from 'react';
import { BACKEND_URL } from '@/lib/backend';

export type SessionStatus = 'disconnected' | 'checking' | 'needs-signature' | 'ready' | 'signing';

export interface EstadoSesion {
    token: string | null;
    status: SessionStatus;
    error: string | null;
}

const CLAVE_RECORDADA = 'primal_wallet_recordada';
const PREFIJO = 'cultomizer_session_';
const DESCONECTADA: EstadoSesion = { token: null, status: 'disconnected', error: null };
const VERIFICANDO: EstadoSesion = { token: null, status: 'checking', error: null };

const estados = new Map<string, EstadoSesion>();
const verificando = new Map<string, Promise<void>>();
const oyentes = new Set<() => void>();
let direccion: string | null = leerRecordada();

function leerRecordada() {
    if (typeof window === 'undefined') return null;
    try {
        return JSON.parse(localStorage.getItem(CLAVE_RECORDADA) || 'null')?.address?.toLowerCase() ?? null;
    } catch {
        return null;
    }
}

function leerToken(wallet: string) {
    try {
        return localStorage.getItem(PREFIJO + wallet);
    } catch {
        return null;
    }
}

function guardarToken(wallet: string, token: string | null) {
    try {
        if (token) localStorage.setItem(PREFIJO + wallet, token);
        else localStorage.removeItem(PREFIJO + wallet);
    } catch {}
}

const avisar = () => oyentes.forEach((o) => o());

function poner(wallet: string, cambio: Partial<EstadoSesion>) {
    estados.set(wallet, { ...(estados.get(wallet) ?? VERIFICANDO), ...cambio });
    avisar();
}

export function suscribir(oyente: () => void) {
    oyentes.add(oyente);
    return () => oyentes.delete(oyente);
}

export const walletActual = () => direccion;

export function ponerWallet(wallet: string | null) {
    const nueva = wallet?.toLowerCase() ?? null;
    if (nueva === direccion) return;
    direccion = nueva;
    avisar();
    if (nueva) verificar(nueva);
}

export function estadoDe(wallet: string | null | undefined): EstadoSesion {
    if (!wallet) return DESCONECTADA;
    return estados.get(wallet.toLowerCase()) ?? VERIFICANDO;
}

export function verificar(wallet: string) {
    const key = wallet.toLowerCase();
    const actual = estados.get(key);
    if (actual && actual.status !== 'checking') return Promise.resolve();
    const enCurso = verificando.get(key);
    if (enCurso) return enCurso;
    const guardado = leerToken(key);
    if (!guardado) {
        poner(key, { token: null, status: 'needs-signature' });
        return Promise.resolve();
    }
    const promesa = fetch(`${BACKEND_URL}/auth/me`, { headers: { authorization: `Bearer ${guardado}` } })
        .then(async (r) => {
            const datos = r.ok ? await r.json() : null;
            if (datos?.address?.toLowerCase() === key) return poner(key, { token: guardado, status: 'ready' });
            if (r.status === 401 || r.status === 403 || datos) guardarToken(key, null);
            poner(key, { token: null, status: 'needs-signature' });
        })
        .catch(() => poner(key, { token: null, status: 'needs-signature' }))
        .finally(() => verificando.delete(key));
    verificando.set(key, promesa);
    return promesa;
}

const firmando = new Map<string, Promise<string | null>>();

export function firmar(wallet: string, firmarMensaje: (mensaje: string) => Promise<string>) {
    const key = wallet.toLowerCase();
    const enCurso = firmando.get(key);
    if (enCurso) return enCurso;
    const promesa = (async () => {
        poner(key, { status: 'signing', error: null });
        try {
            const r1 = await fetch(`${BACKEND_URL}/auth/nonce`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ address: wallet }),
            });
            if (!r1.ok) throw new Error((await r1.json()).error || "Couldn't start the signature check.");
            const { nonce, message } = await r1.json();
            const signature = await firmarMensaje(message);
            const r2 = await fetch(`${BACKEND_URL}/auth/verify`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ nonce, signature }),
            });
            if (!r2.ok) throw new Error((await r2.json()).error || "Couldn't verify the signature.");
            const { token } = await r2.json();
            guardarToken(key, token);
            poner(key, { token, status: 'ready' });
            return token as string;
        } catch (err) {
            const mensaje = err instanceof Error ? err.message : 'Signature failed.';
            const rechazada = /user rejected|denied|rejected the request/i.test(mensaje);
            poner(key, { token: null, status: 'needs-signature', error: rechazada ? null : mensaje });
            return null;
        } finally {
            firmando.delete(key);
        }
    })();
    firmando.set(key, promesa);
    return promesa;
}

export function olvidar(wallet: string) {
    const key = wallet.toLowerCase();
    guardarToken(key, null);
    poner(key, { token: null, status: 'needs-signature', error: null });
}

export async function conectar() {
    const [{ appKit, wagmiConfig }, { getAccount, watchAccount }] = await Promise.all([
        import('@/lib/cultomizer/wallet'),
        import('@wagmi/core'),
    ]);
    let cuenta = getAccount(wagmiConfig);
    if (cuenta.status === 'reconnecting' || cuenta.status === 'connecting')
        cuenta = await new Promise((ok) => {
            const dejar = watchAccount(wagmiConfig, {
                onChange: (c) => {
                    if (c.status === 'reconnecting' || c.status === 'connecting') return;
                    dejar();
                    ok(c);
                },
            });
        });
    let wallet = cuenta.address;
    if (!wallet) {
        appKit.open();
        wallet = await new Promise<`0x${string}` | undefined>((ok) => {
            let abierto = false;
            let listo = false;
            const dejar: (() => void)[] = [];
            const fin = (a: `0x${string}` | undefined) => {
                if (listo) return;
                listo = true;
                dejar.forEach((d) => d());
                ok(a);
            };
            dejar.push(
                watchAccount(wagmiConfig, {
                    onChange: (c) => c.address && fin(c.address),
                }),
                appKit.subscribeState((s) => {
                    if (s.open) abierto = true;
                    else if (abierto) setTimeout(() => fin(getAccount(wagmiConfig).address), 300);
                })
            );
        });
        if (!wallet) return null;
    }
    ponerWallet(wallet);
    return wallet;
}

export async function conectarYFirmar() {
    const wallet = await conectar();
    if (!wallet) return null;
    const { wagmiConfig } = await import('@/lib/cultomizer/wallet');
    const { signMessage } = await import('@wagmi/core');
    await verificar(wallet);
    const listo = estadoDe(wallet);
    if (listo.status === 'ready') return listo.token;
    return firmar(wallet, (message) => signMessage(wagmiConfig, { message }));
}

if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
        if (e.key === CLAVE_RECORDADA) ponerWallet(leerRecordada());
        if (e.key?.startsWith(PREFIJO)) {
            const wallet = e.key.slice(PREFIJO.length);
            estados.delete(wallet);
            verificar(wallet);
        }
    });

export function useSesionDe(wallet: string | null | undefined) {
    const estado = useSyncExternalStore(suscribir, () => estadoDe(wallet), () => DESCONECTADA);
    useEffect(() => {
        if (wallet) verificar(wallet);
    }, [wallet]);
    return estado;
}

export function useWalletActual() {
    return useSyncExternalStore(suscribir, walletActual, () => null);
}

export function useSesion() {
    const address = useWalletActual();
    const sesion = useSesionDe(address);
    return {
        address: address ?? undefined,
        isConnected: !!address,
        token: sesion.token,
        status: sesion.status,
        error: sesion.error,
        signIn: conectarYFirmar,
        signOut: () => address && olvidar(address),
    };
}
