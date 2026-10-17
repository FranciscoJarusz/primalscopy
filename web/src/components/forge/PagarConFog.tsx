// "Use 20,000 FOG": compra un roll con el FOG del staking en vez de pagar en
// APE. Solo aparece si la wallet tiene FOG suficiente. Al canjear, useForge
// escucha el mismo evento que con un codigo y el roll aparece como listo.
import { useEffect, useState } from 'react';
import { EVENTO_CANJE } from '@/lib/promo';
import { canjear, fog, leerConfig, leerMio, ICONO_FOG_CHICO } from '@/lib/staking';

export default function PagarConFog({ token }: { token: string | null }) {
    const [precio, setPrecio] = useState<number | null>(null);
    const [saldo, setSaldo] = useState<number | null>(null);
    const [canjeando, setCanjeando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        let cancelado = false;
        const cargar = () =>
            Promise.all([leerConfig(), leerMio(token)])
                .then(([config, mio]) => {
                    if (cancelado) return;
                    const roll = config.catalog.find(
                        (p) => p.id === 'forge-roll' && p.redeemable
                    );
                    setPrecio(roll?.price ?? null);
                    setSaldo(mio.balance);
                })
                .catch(() => {});
        cargar();
        window.addEventListener(EVENTO_CANJE, cargar);
        return () => {
            cancelado = true;
            window.removeEventListener(EVENTO_CANJE, cargar);
        };
    }, [token]);

    if (!token || precio === null || saldo === null || saldo < precio) return null;

    const usar = async () => {
        setCanjeando(true);
        setError(null);
        try {
            await canjear(token, 'forge-roll');
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't use your FOG.");
        }
        setCanjeando(false);
    };

    return (
        <div className="flex flex-col gap-1">
            <button
                onClick={usar}
                disabled={canjeando}
                className="self-start inline-flex items-center gap-1.5 text-lightblue/70 hover:text-yellow text-sm underline underline-offset-4 cursor-pointer transition-all duration-300 disabled:opacity-40"
            >
                <img src={ICONO_FOG_CHICO} alt="" className="size-4" />
                {canjeando
                    ? 'Using FOG...'
                    : `Use ${fog(precio)} FOG instead (you have ${fog(saldo)})`}
            </button>
            {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
    );
}
