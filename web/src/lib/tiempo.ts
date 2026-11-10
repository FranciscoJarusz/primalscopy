const dos = (n: number) => String(n).padStart(2, '0');

export function reloj(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${dos(h)}h ${dos(m)}m` : `${dos(h)}:${dos(m)}:${dos(s % 60)}`;
}

export function hace(iso: string, ahora = Date.now()) {
    const min = Math.max(1, Math.floor((ahora - Date.parse(iso)) / 60000));
    if (min < 60) return `${min}m ago`;
    if (min < 60 * 24) return `${Math.floor(min / 60)}h ago`;
    if (min < 60 * 24 * 30) return `${Math.floor(min / 60 / 24)}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
