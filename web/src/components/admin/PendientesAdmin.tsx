import { useCallback, useEffect, useState } from 'react';
import { BACKEND_URL } from '@/lib/backend';
import { irA } from '@/lib/admin';
import { leerEntregas } from './EntregasAdmin';
import { botonChico, fecha, panel } from './comun';

type Tarjeta = {
    id: string;
    seccion?: string;
    nombre: string;
    valor: string;
    detalle: string;
    atencion: boolean;
    accion?: { nombre: string; hacer: () => void };
};
type Backup = {
    configured: boolean;
    running: boolean;
    lastSuccessAt: string | null;
    lastError: string | null;
};
type Indice = {
    ready: boolean;
    running: boolean;
    progress: number;
    syncedAt: string | null;
    holders: number;
};
type Uso = {
    disk: { total: number; used: number; usedPercent: number } | null;
    folders: { path: string; bytes: number; cache: boolean }[];
    cacheBytes: number;
};
const DIA_MS = 24 * 60 * 60 * 1000;
const tamaño = (bytes: number) =>
    bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6).toLocaleString('en-US')} MB`;
const nombreCarpeta = (p: string) => p.replace(/^_generated\//, '');

export default function PendientesAdmin({ token }: { token: string }) {
    const [tarjetas, setTarjetas] = useState<Tarjeta[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        const pedir = (ruta: string) =>
            fetch(`${BACKEND_URL}/admin/${ruta}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
                if (!r.ok) throw new Error();
                return r.json();
            });
        try {
            const [entregas, raffles, staking, promo, backup, uso, indice] = await Promise.all([
                leerEntregas(token),
                pedir('raffles'),
                pedir('staking'),
                pedir('promo'),
                pedir('backup') as Promise<Backup>,
                pedir('storage/usage') as Promise<Uso>,
                pedir('transfers') as Promise<Indice>,
            ]);
            const respaldar = async () => {
                await fetch(`${BACKEND_URL}/admin/backup`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                cargar();
            };
            const viejo = !backup.lastSuccessAt || Date.now() - Date.parse(backup.lastSuccessAt) > 1.5 * DIA_MS;
            const pendientes = entregas.filter((e) => e.estado === 'pending');
            const vivos = raffles.raffles.filter((r: { status: string }) => r.status === 'open');
            const borradores = raffles.raffles.filter((r: { status: string }) => r.status === 'draft');
            const proximo = vivos
                .filter((r: { endsAt: string | null }) => r.endsAt)
                .sort((a: { endsAt: string }, b: { endsAt: string }) => a.endsAt.localeCompare(b.endsAt))[0];
            const activos = promo.codes.filter((c: { status: string; archived: boolean }) => c.status === 'active' && !c.archived);

            setTarjetas([
                {
                    id: 'entregas',
                    seccion: 'deliveries',
                    nombre: 'Deliveries',
                    valor: pendientes.length ? `${pendientes.length} to send` : 'All sent',
                    detalle: pendientes.length
                        ? `${pendientes.filter((e) => e.origen.startsWith('Raffle')).length} from raffles, ${pendientes.filter((e) => e.origen.startsWith('Shop')).length} from the Shop`
                        : 'Nothing waiting to be sent by hand.',
                    atencion: pendientes.length > 0,
                },
                {
                    id: 'raffles',
                    seccion: 'raffles',
                    nombre: 'Raffles',
                    valor: `${vivos.length} live`,
                    detalle: [
                        proximo ? `Next draw: ${proximo.title}, ${fecha(proximo.endsAt)}` : vivos.length ? 'Live raffles close when you draw them' : 'No raffle is open',
                        borradores.length ? `${borradores.length} ${borradores.length === 1 ? 'draft' : 'drafts'} not published` : null,
                    ]
                        .filter(Boolean)
                        .join('. '),
                    atencion: borradores.length > 0,
                },
                {
                    id: 'staking',
                    seccion: 'staking',
                    nombre: 'Staking',
                    valor: staking.config.enabled ? 'Open' : 'Closed',
                    detalle: `${staking.training.toLocaleString('en-US')} Primals training in ${staking.wallets.toLocaleString('en-US')} wallets.`,
                    atencion: !staking.config.enabled,
                },
                {
                    id: 'venta',
                    seccion: 'shop',
                    nombre: 'FOG sale',
                    valor: staking.config.fogSale.enabled ? 'Open' : 'Closed',
                    detalle: `${staking.fogSale.count.toLocaleString('en-US')} purchases so far.`,
                    atencion: false,
                },
                {
                    id: 'codigos',
                    seccion: 'promo',
                    nombre: 'Codes',
                    valor: `${activos.length} active`,
                    detalle: 'Promo codes that can be redeemed right now.',
                    atencion: false,
                },
                {
                    id: 'almacenamiento',
                    seccion: 'traits',
                    nombre: 'Storage',
                    valor: uso.disk ? `${uso.disk.usedPercent}% used` : 'Unknown',
                    detalle: [
                        uso.disk ? `${tamaño(uso.disk.used)} of ${tamaño(uso.disk.total)}.` : null,
                        `Biggest: ${uso.folders
                            .slice(0, 4)
                            .map((f) => `${nombreCarpeta(f.path)} ${tamaño(f.bytes)}${f.cache ? ' (cache)' : ''}`)
                            .join(', ')}.`,
                        `${tamaño(uso.cacheBytes)} are caches that rebuild on their own.`,
                    ]
                        .filter(Boolean)
                        .join(' '),
                    atencion: (uso.disk?.usedPercent ?? 0) >= 80,
                },
                {
                    id: 'backup',
                    nombre: 'Backup',
                    valor: !backup.configured
                        ? 'Not set up'
                        : backup.running
                          ? 'Running'
                          : backup.lastSuccessAt
                            ? fecha(backup.lastSuccessAt)
                            : 'Never',
                    detalle: !backup.configured
                        ? 'Add the BACKUP_S3_* variables in Railway. Nothing is being backed up.'
                        : backup.lastError
                          ? `The last try failed: ${backup.lastError}`
                          : 'All the data is copied once a day. Images and traits only when they change.',
                    atencion: !backup.configured || Boolean(backup.lastError) || (viejo && !backup.running),
                    accion: backup.configured && !backup.running ? { nombre: 'Back up now', hacer: respaldar } : undefined,
                },
                {
                    id: 'indice',
                    nombre: 'Chain index',
                    valor: indice.ready ? 'Up to date' : `${Math.floor(indice.progress * 100)}% read`,
                    detalle: indice.ready
                        ? `${indice.holders.toLocaleString('en-US')} holders. Owners and holder since come from every transfer of the collection.`
                        : indice.running
                          ? 'Reading every transfer since the mint. Until it ends, owners are read Primal by Primal like before.'
                          : "Couldn't read ApeChain. It retries on its own every minute.",
                    atencion: !indice.ready && !indice.running,
                },
            ]);
            setError(null);
        } catch {
            setError("Couldn't load the summary.");
        }
    }, [token]);

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">To do</h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    What needs your attention across the site. Open a card to go to its section.
                </p>
            </div>
            {error && <p className="text-red-300">{error}</p>}
            {!tarjetas && !error && <p className="text-lightblue/70">Loading...</p>}
            {tarjetas && (
                <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {tarjetas.map((t) => (
                        <section key={t.id} className={`${panel} ${t.atencion ? 'ring-2 ring-yellow' : ''}`}>
                            <span className="text-lightblue/70 text-xs uppercase">{t.nombre}</span>
                            <span className={`font-accent uppercase text-3xl leading-none pb-1.5 ${t.atencion ? 'text-yellow' : 'text-white'}`}>
                                {t.valor}
                            </span>
                            <p className="text-lightblue/80 text-sm flex-1">{t.detalle}</p>
                            {t.seccion && (
                                <button onClick={() => irA(t.seccion!)} className={`${botonChico} self-start`}>
                                    Open {t.nombre}
                                </button>
                            )}
                            {t.accion && (
                                <button onClick={t.accion.hacer} className={`${botonChico} self-start`}>
                                    {t.accion.nombre}
                                </button>
                            )}
                        </section>
                    ))}
                </div>
            )}
        </main>
    );
}
