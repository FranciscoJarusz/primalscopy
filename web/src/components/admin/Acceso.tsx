// La entrada al admin: el token se valida contra el backend y queda en
// sessionStorage de la pestaña. Se pide una sola vez, en AdminApp, y despues
// cada seccion lo recibe como prop.
import { useEffect, useState } from 'react';
import { BACKEND_URL } from '@/lib/backend';

export const ADMIN_TOKEN_KEY = 'primal_admin_token';

export async function tokenValido(candidato: string) {
    const respuesta = await fetch(`${BACKEND_URL}/admin/session`, {
        headers: { Authorization: `Bearer ${candidato}` },
    }).catch(() => null);
    return respuesta?.ok ?? false;
}

export type AccesoAdmin = ReturnType<typeof useAdminToken>;

/// El token del admin: el guardado en la pestaña si sigue valiendo, o el que
/// se escriba en el formulario de <AdminLogin>.
export function useAdminToken() {
    const [token, setToken] = useState('');
    const [tokenInput, setTokenInput] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    // Mientras se valida el token guardado: sin esto el formulario de entrada
    // aparece un instante aunque ya haya sesion.
    const [restaurando, setRestaurando] = useState(
        () => Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY))
    );

    useEffect(() => {
        const guardado = sessionStorage.getItem(ADMIN_TOKEN_KEY);
        if (!guardado) return;
        tokenValido(guardado).then((ok) => {
            if (ok) setToken(guardado);
            else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
            setRestaurando(false);
        });
    }, []);

    const salir = () => {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken('');
    };

    const entrar = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        const candidato = tokenInput.trim();
        if (!candidato) return;
        setChecking(true);
        setAuthError(null);
        if (await tokenValido(candidato)) {
            sessionStorage.setItem(ADMIN_TOKEN_KEY, candidato);
            setToken(candidato);
            setTokenInput('');
        } else {
            setAuthError('Invalid token.');
        }
        setChecking(false);
    };

    return { token, restaurando, salir, tokenInput, setTokenInput, authError, checking, entrar };
}

export function AdminLogin({ titulo, acceso }: { titulo: string; acceso: AccesoAdmin }) {
    const { tokenInput, setTokenInput, authError, checking, entrar } = acceso;
    return (
        <main className="flex flex-1 items-center justify-center py-10">
            <form
                onSubmit={entrar}
                className="flex flex-col items-center gap-5 bg-darkblue p-8 sm:p-10 rounded-2xl sm:rounded-3xl shadow-lg shadow-darkblue/50 text-center max-w-md w-full"
            >
                <img src="/brand/logo-icon.svg" alt="Primal Cult" className="w-14 h-auto" />
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-5xl">{titulo}</h1>
                <p className="text-lightblue/80">Enter the admin token to continue</p>
                <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="ADMIN_TOKEN"
                    autoFocus
                    className="w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-accent leading-tight rounded-md px-3 pb-1.5 text-center focus:outline-none"
                />
                {authError && <p className="text-sm text-red-300">{authError}</p>}
                <button
                    type="submit"
                    disabled={checking || !tokenInput.trim()}
                    className="w-full bg-yellow text-darkblue font-accent uppercase rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    {checking ? 'Verifying...' : 'Enter'}
                </button>
            </form>
        </main>
    );
}
