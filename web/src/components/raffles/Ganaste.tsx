import { useEffect, useState } from 'react';
import { imagenRaffle, type MiRaffles, type Victoria } from '@/lib/raffles';
import StakeCompartir from '@/components/staking/StakeCompartir';
import { ICONO_TICKET, puesto } from './comun';

const clave = (wallet: string) => `raffles:vistos:${wallet.toLowerCase()}`;
const idDe = (v: Victoria) => `${v.raffleId}:${v.slot}`;

function leerVistos(wallet: string): string[] {
    try {
        return JSON.parse(localStorage.getItem(clave(wallet)) || '[]');
    } catch {
        return [];
    }
}

function marcarVisto(wallet: string, v: Victoria) {
    try {
        localStorage.setItem(clave(wallet), JSON.stringify([...leerVistos(wallet), idDe(v)].slice(-100)));
    } catch {}
}

export default function Ganaste({ mio, wallet }: { mio: MiRaffles | null; wallet?: string }) {
    const [victoria, setVictoria] = useState<Victoria | null>(null);

    useEffect(() => {
        if (!wallet || !mio?.wins?.length || victoria) return;
        const vistos = leerVistos(wallet);
        setVictoria(mio.wins.find((v) => !vistos.includes(idDe(v))) ?? null);
    }, [mio, wallet, victoria]);

    if (!victoria || !wallet) return null;

    const mensaje = (
        <>
            You won <span className="text-yellow">{victoria.prize}</span>, {puesto(victoria.slot)} prize in {victoria.title}.{' '}
            {victoria.kind === 'fog'
                ? 'The FOG will show up in your wallet once the team confirms it.'
                : victoria.auto
                  ? "You'll get it in your account once the team confirms it."
                  : 'The team will send it to your wallet soon.'}
        </>
    );

    return (
        <StakeCompartir
            tokenIds={[]}
            dias={0}
            zona={null}
            primera={false}
            otro={{
                titulo: 'You won!',
                imagen: victoria.image ? imagenRaffle(victoria.image) : (ICONO_TICKET ?? ''),
                mensaje,
                tweet: `I just won ${victoria.prize} in the ${victoria.title} raffle on Primal Cult 🔥 Join the next one: ${window.location.origin}/raffles/${victoria.raffleId}

#CultNeverDies #PrimalCult`,
            }}
            onCerrar={() => {
                marcarVisto(wallet, victoria);
                setVictoria(null);
            }}
        />
    );
}
