// Lo que falta para poder actuar sobre el Primal: conectar la wallet,
// firmar, o ser el dueño. Si no falta nada, no muestra nada.
import type { useWalletSession } from '@/hooks/cultomizer/useWalletSession';
import { botonClaro } from './estilos';

type Session = ReturnType<typeof useWalletSession>;

export default function Acceso({
    session,
    ownership,
}: {
    session: Session;
    ownership: string;
}) {
    if (!session.isConnected) {
        return (
            <p className="text-lightblue/60 text-sm">
                Connect your wallet to roll.
            </p>
        );
    }
    if (session.status === 'needs-signature') {
        return (
            <div className="flex flex-col gap-2">
                <button
                    onClick={session.signIn}
                    className={`w-full text-sm ${botonClaro}`}
                >
                    Verify wallet
                </button>
                <p className="text-lightblue/60 text-[10px]">
                    You will sign a message. It does not authorize any
                    transaction.
                </p>
                {session.error && (
                    <p className="text-red-400 text-xs">{session.error}</p>
                )}
            </div>
        );
    }
    if (session.status === 'checking' || session.status === 'signing') {
        return (
            <p className="text-lightblue text-sm">
                {session.status === 'signing'
                    ? 'Waiting for signature...'
                    : 'Verifying session...'}
            </p>
        );
    }
    if (ownership === 'checking') {
        return <p className="text-lightblue text-sm">Checking ownership...</p>;
    }
    if (ownership === 'not-owner') {
        return (
            <p className="font-accent uppercase text-lightblue">
                You don&apos;t own this NFT
            </p>
        );
    }
    if (ownership === 'not-found') {
        return (
            <p className="text-lightblue/60 text-sm">
                This NFT does not exist.
            </p>
        );
    }
    if (ownership === 'unavailable') {
        return (
            <p className="text-lightblue/60 text-sm">
                Could not verify ownership right now.
            </p>
        );
    }
    return null;
}
