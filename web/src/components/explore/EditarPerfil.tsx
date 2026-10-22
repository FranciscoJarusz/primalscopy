import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWalletSession } from '@/hooks/cultomizer/useWalletSession';
import { EVENTO_NICKNAME, NICKNAME_FORMATO, type DetalleNickname } from '@/lib/nicknames';
import { guardarPerfil, type DatosPerfil, type Perfil } from '@/lib/explore';
import { miniaturaPrimal } from '@/lib/staking';

const MAX_BIO = 160;
const MAX_DESTACADOS = 6;
const campo =
    'w-full bg-lightblue text-darkblue placeholder-darkblue/50 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow disabled:opacity-60';
const etiqueta = 'text-xs font-bold uppercase text-lightblue/70';
const boton =
    'h-9 inline-flex items-center justify-center font-accent uppercase rounded-md px-4 pb-[0.38em] leading-none cursor-pointer active:scale-97 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed';

function Miniatura({
    id,
    elegido,
    numero,
    onClick,
}: {
    id: string;
    elegido: boolean;
    numero?: number;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={elegido}
            title={`Primal #${id}`}
            className={`relative rounded-lg overflow-hidden bg-blue cursor-pointer active:scale-97 transition-all duration-300 ${
                elegido ? 'ring-2 ring-yellow' : 'opacity-60 hover:opacity-100'
            }`}
        >
            <img src={miniaturaPrimal(id, 192)} alt="" loading="lazy" className="w-full aspect-square object-cover" />
            {numero !== undefined && (
                <span className="absolute top-1 right-1 size-5 inline-flex items-center justify-center rounded-full bg-yellow text-darkblue font-accent text-xs leading-none pb-[0.38em]">
                    {numero}
                </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-darkblue/80 font-accent text-[10px] text-yellow text-center">
                #{id}
            </span>
        </button>
    );
}

export default function EditarPerfil({
    perfil,
    onGuardado,
    onCerrar,
}: {
    perfil: Perfil;
    onGuardado: (nickname: string | null, datos: DatosPerfil) => void;
    onCerrar: () => void;
}) {
    const session = useWalletSession();
    const [nickname, setNickname] = useState(perfil.nickname ?? '');
    const [avatar, setAvatar] = useState(perfil.profile.avatar);
    const [destacados, setDestacados] = useState(perfil.profile.featured);
    const [bio, setBio] = useState(perfil.profile.bio);
    const [x, setX] = useState(perfil.profile.x);
    const [discord, setDiscord] = useState(perfil.profile.discord);
    const [estado, setEstado] = useState<'listo' | 'firmando' | 'guardando'>('listo');
    const [error, setError] = useState<string | null>(null);
    const cerrar = useRef(onCerrar);
    cerrar.current = onCerrar;

    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cerrar.current();
        };
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, []);

    const ids = perfil.tokens.map((t) => t.id);
    const apodo = nickname.trim();
    const apodoValido = !apodo || NICKNAME_FORMATO.test(apodo);
    const ocupado = estado !== 'listo';

    const alternarDestacado = (id: string) =>
        setDestacados((d) =>
            d.includes(id) ? d.filter((v) => v !== id) : d.length >= MAX_DESTACADOS ? d : [...d, id]
        );

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apodoValido || ocupado) return;
        setError(null);
        let token = session.token;
        if (!token) {
            setEstado('firmando');
            token = await session.signIn();
            if (!token) {
                setEstado('listo');
                setError('Sign the message in your wallet to save your profile.');
                return;
            }
        }
        setEstado('guardando');
        try {
            const r = await guardarPerfil(token, { nickname: apodo, avatar, featured: destacados, bio, x, discord });
            if (r.nickname) {
                window.dispatchEvent(
                    new CustomEvent<DetalleNickname>(EVENTO_NICKNAME, {
                        detail: { address: perfil.wallet, nickname: r.nickname },
                    })
                );
            }
            onGuardado(r.nickname, r.profile);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save your profile.");
            setEstado('listo');
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6"
            onClick={onCerrar}
        >
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="perfil-titulo"
                onSubmit={guardar}
                onClick={(e) => e.stopPropagation()}
                data-scroll-propio
                className="w-full max-w-2xl max-h-full overflow-y-auto overscroll-contain bg-darkblue rounded-2xl p-5 sm:p-6 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col gap-5"
            >
                <h2 id="perfil-titulo" className="font-accent uppercase text-yellow text-2xl sm:text-3xl">
                    Edit profile
                </h2>

                <label className="flex flex-col gap-1.5">
                    <span className={etiqueta}>Nickname</span>
                    <input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        maxLength={20}
                        placeholder="Your nickname"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={ocupado}
                        className={`${campo} font-accent pt-1 pb-2`}
                    />
                    <span className={`text-xs ${apodoValido ? 'text-lightblue/60' : 'text-red-300'}`}>
                        3-20 characters: letters, numbers or _. Leave it empty to show your wallet.
                    </span>
                </label>

                <label className="flex flex-col gap-1.5">
                    <span className={etiqueta}>Bio</span>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
                        rows={3}
                        placeholder="Tell the cult who you are"
                        disabled={ocupado}
                        className={`${campo} resize-none`}
                    />
                    <span className="text-xs text-lightblue/60 self-end">
                        {bio.length}/{MAX_BIO}
                    </span>
                </label>

                <div className="grid sm:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5">
                        <span className={etiqueta}>X</span>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-darkblue/60">@</span>
                            <input
                                value={x}
                                onChange={(e) => setX(e.target.value.replace(/^@/, ''))}
                                maxLength={15}
                                placeholder="username"
                                autoComplete="off"
                                spellCheck={false}
                                disabled={ocupado}
                                className={`${campo} pl-7`}
                            />
                        </div>
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className={etiqueta}>Discord</span>
                        <input
                            value={discord}
                            onChange={(e) => setDiscord(e.target.value.toLowerCase())}
                            maxLength={32}
                            placeholder="username"
                            autoComplete="off"
                            spellCheck={false}
                            disabled={ocupado}
                            className={campo}
                        />
                    </label>
                </div>

                <div className="flex flex-col gap-2">
                    <span className={etiqueta}>Profile picture</span>
                    <div
                        data-scroll-propio
                        className="grid grid-cols-5 sm:grid-cols-8 gap-2 max-h-48 overflow-y-auto overscroll-contain p-1"
                    >
                        {ids.map((id) => (
                            <Miniatura key={id} id={id} elegido={avatar === id} onClick={() => setAvatar(id)} />
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <span className={etiqueta}>
                        Featured Primals · {destacados.length}/{MAX_DESTACADOS}
                    </span>
                    <div
                        data-scroll-propio
                        className="grid grid-cols-5 sm:grid-cols-8 gap-2 max-h-48 overflow-y-auto overscroll-contain p-1"
                    >
                        {ids.map((id) => {
                            const lugar = destacados.indexOf(id);
                            return (
                                <Miniatura
                                    key={id}
                                    id={id}
                                    elegido={lugar >= 0}
                                    numero={lugar >= 0 ? lugar + 1 : undefined}
                                    onClick={() => alternarDestacado(id)}
                                />
                            );
                        })}
                    </div>
                </div>

                {error && <p className="text-sm text-red-300">{error}</p>}

                <div className="flex flex-col-reverse min-[420px]:flex-row min-[420px]:justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCerrar}
                        disabled={ocupado}
                        className={`${boton} bg-lightblue text-darkblue hover:bg-yellow`}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!apodoValido || ocupado}
                        className={`${boton} bg-yellow text-darkblue hover:scale-102 disabled:hover:scale-100`}
                    >
                        {estado === 'firmando' ? 'Sign in your wallet...' : estado === 'guardando' ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
}
