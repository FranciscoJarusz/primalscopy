import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    EVENTO_NICKNAME,
    NICKNAME_FORMATO,
    guardarNickname,
    type DetalleNickname,
} from '@/lib/nicknames';

type Props = {
    address: string;
    actual: string | null;
    token: string | null;
    signIn: () => Promise<string | null>;
    onGuardado: (nickname: string) => void;
    onCerrar: () => void;
};

export default function NicknameModal({
    address,
    actual,
    token,
    signIn,
    onGuardado,
    onCerrar,
}: Props) {
    const [valor, setValor] = useState(actual ?? '');
    const [estado, setEstado] = useState<'listo' | 'firmando' | 'guardando'>('listo');
    const [error, setError] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const cerrar = useRef(onCerrar);
    cerrar.current = onCerrar;

    useEffect(() => {
        input.current?.focus();
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cerrar.current();
        };
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, []);

    const limpio = valor.trim();
    const valido = NICKNAME_FORMATO.test(limpio);
    const ocupado = estado !== 'listo';

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!valido || ocupado) return;
        setError(null);

        let sesion = token;
        if (!sesion) {
            setEstado('firmando');
            sesion = await signIn();
            if (!sesion) {
                setEstado('listo');
                setError('Sign the message in your wallet to save your nickname.');
                return;
            }
        }

        setEstado('guardando');
        try {
            const nickname = await guardarNickname(sesion, limpio);
            window.dispatchEvent(
                new CustomEvent<DetalleNickname>(EVENTO_NICKNAME, {
                    detail: { address: address.toLowerCase(), nickname },
                })
            );
            onGuardado(nickname);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save your nickname.");
            setEstado('listo');
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={onCerrar}
        >
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="nickname-titulo"
                onSubmit={guardar}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-darkblue rounded-2xl p-5 sm:p-6 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col gap-4"
            >
                <h2
                    id="nickname-titulo"
                    className="font-accent uppercase text-yellow text-2xl"
                >
                    {actual ? 'Edit your nickname' : 'Choose your nickname'}
                </h2>
                <p className="text-lightblue text-sm sm:text-base">
                    It will show up instead of your wallet address in the Top
                    Holders list on the Stats page.
                </p>

                <div className="flex flex-col gap-1.5">
                    <input
                        ref={input}
                        value={valor}
                        onChange={(e) => {
                            setValor(e.target.value);
                            setError(null);
                        }}
                        maxLength={20}
                        placeholder="Your nickname"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={ocupado}
                        className="w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-accent rounded-md px-3 pt-1 pb-2 focus:outline-none focus:ring-2 focus:ring-yellow disabled:opacity-60"
                    />
                    <span
                        className={`text-xs ${
                            error ? 'text-red-300' : 'text-lightblue/60'
                        }`}
                    >
                        {error ?? '3-20 characters: letters, numbers or _'}
                    </span>
                </div>

                <div className="flex flex-col-reverse min-[420px]:flex-row min-[420px]:justify-end gap-3 mt-1">
                    <button
                        type="button"
                        onClick={onCerrar}
                        disabled={ocupado}
                        className="bg-lightblue text-darkblue font-accent uppercase rounded-md px-4 pb-1.5 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-50"
                    >
                        {actual ? 'Cancel' : 'Skip'}
                    </button>
                    <button
                        type="submit"
                        disabled={!valido || ocupado || limpio === actual}
                        className="bg-yellow text-darkblue font-accent uppercase rounded-md px-4 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {estado === 'firmando'
                            ? 'Sign in your wallet...'
                            : estado === 'guardando'
                              ? 'Saving...'
                              : 'Save'}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
}
