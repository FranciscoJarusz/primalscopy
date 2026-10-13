// Canjear un codigo promocional. Se abre desde el menu de la wallet o desde
// cualquier pagina con abrirCanje() (ver lib/promo.ts).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { canjearCodigo, textoPremio, type Canje } from '@/lib/promo';
import { goTo } from '@/lib/navigation';

type Props = {
    token: string | null;
    signIn: () => Promise<string | null>;
    onCerrar: () => void;
};

export default function RedeemModal({ token, signIn, onCerrar }: Props) {
    const [valor, setValor] = useState('');
    const [estado, setEstado] = useState<'listo' | 'firmando' | 'canjeando'>('listo');
    const [error, setError] = useState<string | null>(null);
    const [canje, setCanje] = useState<Canje | null>(null);
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
    const ocupado = estado !== 'listo';

    const canjear = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!limpio || ocupado) return;
        setError(null);

        let sesion = token;
        if (!sesion) {
            setEstado('firmando');
            sesion = await signIn();
            if (!sesion) {
                setEstado('listo');
                setError('Sign the message in your wallet to redeem the code.');
                return;
            }
        }

        setEstado('canjeando');
        try {
            setCanje(await canjearCodigo(sesion, limpio));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't redeem the code.");
        }
        setEstado('listo');
    };

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={onCerrar}
        >
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="canje-titulo"
                onSubmit={canjear}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-darkblue rounded-2xl p-5 sm:p-6 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col gap-4"
            >
                <h2
                    id="canje-titulo"
                    className="font-accent uppercase text-yellow text-2xl"
                >
                    {canje ? 'Code redeemed' : 'Redeem a code'}
                </h2>

                {canje ? (
                    <>
                        <p className="text-lightblue text-sm sm:text-base">
                            You got{' '}
                            <span className="text-yellow">{textoPremio(canje)}</span>.
                            {canje.reward === 'forge-roll' &&
                                (canje.amount === 1
                                    ? " It's saved to your wallet: use it on any Primal in the Forge."
                                    : " They're saved to your wallet: use them on any Primal in the Forge.")}
                        </p>
                        <div className="flex flex-col-reverse min-[420px]:flex-row min-[420px]:justify-end gap-3 mt-1">
                            <button
                                type="button"
                                onClick={onCerrar}
                                className="bg-lightblue text-darkblue font-accent uppercase rounded-md px-4 pb-1.5 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300"
                            >
                                Close
                            </button>
                            {canje.reward === 'forge-roll' &&
                                !window.location.pathname.startsWith('/forge') && (
                                    // Boton y no <a>: el link tomaba otro alto de linea
                                    // y quedaba desparejo al lado de Close.
                                    <button
                                        type="button"
                                        onClick={() => goTo('/forge/select')}
                                        className="bg-yellow text-darkblue font-accent uppercase rounded-md px-4 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300"
                                    >
                                        Go to the Forge
                                    </button>
                                )}
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-lightblue text-sm sm:text-base">
                            Got a code from Discord or X? Enter it here to get
                            your reward.
                        </p>

                        <div className="flex flex-col gap-1.5">
                            <input
                                ref={input}
                                value={valor}
                                onChange={(e) => {
                                    setValor(e.target.value.toUpperCase());
                                    setError(null);
                                }}
                                maxLength={32}
                                placeholder="CODE"
                                autoComplete="off"
                                spellCheck={false}
                                disabled={ocupado}
                                className="w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-accent tracking-wider rounded-md px-3 pt-1 pb-2 focus:outline-none focus:ring-2 focus:ring-yellow disabled:opacity-60"
                            />
                            {error && <span className="text-xs text-red-300">{error}</span>}
                        </div>

                        <div className="flex flex-col-reverse min-[420px]:flex-row min-[420px]:justify-end gap-3 mt-1">
                            <button
                                type="button"
                                onClick={onCerrar}
                                disabled={ocupado}
                                className="bg-lightblue text-darkblue font-accent uppercase rounded-md px-4 pb-1.5 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!limpio || ocupado}
                                className="bg-yellow text-darkblue font-accent uppercase rounded-md px-4 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                {estado === 'firmando'
                                    ? 'Sign in your wallet...'
                                    : estado === 'canjeando'
                                      ? 'Redeeming...'
                                      : 'Redeem'}
                            </button>
                        </div>
                    </>
                )}
            </form>
        </div>,
        document.body
    );
}
