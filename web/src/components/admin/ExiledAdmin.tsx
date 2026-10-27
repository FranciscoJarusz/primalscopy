import { useEffect, useState } from 'react';
import { BACKEND_URL } from '@/lib/backend';
import { campo, etiqueta } from './comun';

export default function ExiledAdmin({ token }: { token: string }) {
    const [valor, setValor] = useState<string | null>(null);
    const [estado, setEstado] = useState<{ texto: string; error: boolean } | null>(null);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        fetch(`${BACKEND_URL}/admin/exiled`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d && setValor(d.masterCode))
            .catch(() => {});
    }, [token]);

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        setGuardando(true);
        setEstado(null);
        try {
            const r = await fetch(`${BACKEND_URL}/admin/exiled`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ masterCode: valor }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Couldn't save.");
            setValor(d.masterCode);
            setEstado({ texto: 'Saved.', error: false });
        } catch (err) {
            setEstado({ texto: err instanceof Error ? err.message : "Couldn't save.", error: true });
        }
        setGuardando(false);
    };

    if (valor === null) return null;

    return (
        <form
            id="exiled"
            onSubmit={guardar}
            className="scroll-mt-32 flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50"
        >
            <h2 className="font-accent uppercase text-yellow text-2xl">Exiled master code</h2>
            <p className="text-lightblue/70 text-sm -mt-2">
                The home easter egg: tapping the &quot;2,712 Primals&quot; card 20 times lets the
                Exiled Twenty take over the page. Whoever types this code there gets
                Entirione&apos;s answer; anything else gets ACCESS DENIED. Not case sensitive.
            </p>
            <div className="flex flex-wrap items-end gap-3">
                <label className={`${etiqueta} flex-1 min-w-48 max-w-md`}>
                    Master code
                    <input
                        value={valor}
                        onChange={(e) => setValor(e.target.value.toUpperCase())}
                        maxLength={64}
                        autoComplete="off"
                        spellCheck={false}
                        className={`${campo} tracking-wider`}
                    />
                </label>
                <button
                    type="submit"
                    disabled={guardando}
                    className="h-9 bg-lightblue text-darkblue font-accent uppercase text-sm rounded-md px-3 pb-1 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-40"
                >
                    {guardando ? 'Saving...' : 'Save'}
                </button>
                {estado && (
                    <span className={`text-sm ${estado.error ? 'text-red-300' : 'text-green-300'}`}>{estado.texto}</span>
                )}
            </div>
        </form>
    );
}
