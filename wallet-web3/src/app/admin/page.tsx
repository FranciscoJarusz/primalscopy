// src/app/admin/page.tsx
//
// Panel de administración de traits. Habla directo con la API del backend
// Express (/api/admin/*), autenticado con un token compartido que se guarda en
// sessionStorage: se pierde al cerrar la pestaña, que es lo que queremos para
// un secreto compartido.

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api";
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://localhost:3001";

const TOKEN_STORAGE_KEY = "primal_admin_token";

interface Trait {
    file: string;
    name: string;
    url: string;
    sizeBytes: number;
    updatedAt: string;
}

interface TraitDirectory {
    name: string;
    isGlobal: boolean;
    traits: Trait[];
}

interface TraitCategory {
    name: string;
    directories: TraitDirectory[];
}

interface TraitsResponse {
    globalDirName: string;
    categories: TraitCategory[];
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminPage() {
    const [token, setToken] = useState<string>("");
    const [tokenInput, setTokenInput] = useState<string>("");
    const [authError, setAuthError] = useState<string | null>(null);
    const [checkingToken, setCheckingToken] = useState<boolean>(false);

    const [data, setData] = useState<TraitsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [activeDirectory, setActiveDirectory] = useState<string | null>(null);

    const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
    const [busy, setBusy] = useState<boolean>(false);
    const [dragging, setDragging] = useState<boolean>(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- API helpers -------------------------------------------------------

    const authHeaders = useCallback(
        (extra?: Record<string, string>) => ({
            Authorization: `Bearer ${token}`,
            ...(extra || {})
        }),
        [token]
    );

    const notify = (kind: "ok" | "error", text: string) => {
        setStatus({ kind, text });
        window.setTimeout(() => setStatus(null), 6000);
    };

    const loadTraits = useCallback(async (activeToken: string) => {
        setLoading(true);
        try {
            const response = await fetch(`${BACKEND_URL}/admin/traits`, {
                headers: { Authorization: `Bearer ${activeToken}` }
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `Error ${response.status}`);
            }
            const payload: TraitsResponse = await response.json();
            setData(payload);
            return payload;
        } catch (error) {
            notify("error", error instanceof Error ? error.message : "No se pudo cargar la lista de traits.");
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    // --- Sesión ------------------------------------------------------------

    // Restaura el token de la pestaña y valida que siga siendo bueno.
    useEffect(() => {
        const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
        if (!stored) return;

        (async () => {
            const response = await fetch(`${BACKEND_URL}/admin/session`, {
                headers: { Authorization: `Bearer ${stored}` }
            }).catch(() => null);

            if (response?.ok) {
                setToken(stored);
            } else {
                sessionStorage.removeItem(TOKEN_STORAGE_KEY);
            }
        })();
    }, []);

    useEffect(() => {
        if (token) loadTraits(token);
    }, [token, loadTraits]);

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        const candidate = tokenInput.trim();
        if (!candidate) return;

        setCheckingToken(true);
        setAuthError(null);
        try {
            const response = await fetch(`${BACKEND_URL}/admin/session`, {
                headers: { Authorization: `Bearer ${candidate}` }
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || "Token inválido.");
            }
            sessionStorage.setItem(TOKEN_STORAGE_KEY, candidate);
            setToken(candidate);
            setTokenInput("");
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "No se pudo validar el token.");
        } finally {
            setCheckingToken(false);
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken("");
        setData(null);
        setActiveCategory(null);
        setActiveDirectory(null);
    };

    // --- Selección ---------------------------------------------------------

    // Al cargar datos, cae parado en la primera categoría y su carpeta global.
    useEffect(() => {
        if (!data || data.categories.length === 0) return;

        const categoryExists = data.categories.some(category => category.name === activeCategory);
        const category = categoryExists
            ? data.categories.find(item => item.name === activeCategory)!
            : data.categories[0];

        if (!categoryExists) setActiveCategory(category.name);

        const directoryExists = category.directories.some(directory => directory.name === activeDirectory);
        if (!directoryExists) {
            const preferred = category.directories.find(directory => directory.isGlobal) || category.directories[0];
            setActiveDirectory(preferred ? preferred.name : null);
        }
    }, [data, activeCategory, activeDirectory]);

    const currentCategory = useMemo(
        () => data?.categories.find(category => category.name === activeCategory) || null,
        [data, activeCategory]
    );

    const currentDirectory = useMemo(
        () => currentCategory?.directories.find(directory => directory.name === activeDirectory) || null,
        [currentCategory, activeDirectory]
    );

    const globalDirName = data?.globalDirName || "_GLOBAL";

    // --- Acciones ----------------------------------------------------------

    const uploadFiles = async (files: FileList | File[]) => {
        if (!activeCategory || !activeDirectory) return;

        setBusy(true);
        let uploaded = 0;
        const failures: string[] = [];

        for (const file of Array.from(files)) {
            const form = new FormData();
            form.append("category", activeCategory);
            form.append("directory", activeDirectory);
            form.append("file", file);

            let response = await fetch(`${BACKEND_URL}/admin/traits`, {
                method: "POST",
                headers: authHeaders(),
                body: form
            }).catch(() => null);

            // 409 = ya existe. Preguntamos una sola vez por archivo.
            if (response?.status === 409) {
                const confirmed = window.confirm(`Ya existe "${file.name}" en ${activeCategory}/${activeDirectory}. ¿Reemplazarlo?`);
                if (!confirmed) continue;

                const overwriteForm = new FormData();
                overwriteForm.append("category", activeCategory);
                overwriteForm.append("directory", activeDirectory);
                overwriteForm.append("overwrite", "true");
                overwriteForm.append("file", file);
                response = await fetch(`${BACKEND_URL}/admin/traits`, {
                    method: "POST",
                    headers: authHeaders(),
                    body: overwriteForm
                }).catch(() => null);
            }

            if (response?.ok) {
                uploaded += 1;
            } else {
                const body = await response?.json().catch(() => ({}));
                failures.push(`${file.name}: ${body?.error || "error de red"}`);
            }
        }

        await loadTraits(token);
        setBusy(false);

        if (failures.length === 0) {
            notify("ok", `${uploaded} archivo(s) subido(s) a ${activeCategory}/${activeDirectory}.`);
        } else {
            notify("error", `Subidos ${uploaded}. Fallaron: ${failures.join(" | ")}`);
        }
    };

    const handleRename = async (trait: Trait) => {
        if (!activeCategory || !activeDirectory) return;

        const newName = window.prompt("Nuevo nombre (sin extensión):", trait.name);
        if (!newName || newName.trim() === trait.name) return;

        setBusy(true);
        const response = await fetch(`${BACKEND_URL}/admin/traits`, {
            method: "PATCH",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                category: activeCategory,
                directory: activeDirectory,
                file: trait.file,
                newName: newName.trim()
            })
        }).catch(() => null);

        const body = await response?.json().catch(() => ({}));
        if (response?.ok) {
            await loadTraits(token);
            notify("ok", `Renombrado a "${newName.trim()}".`);
        } else {
            notify("error", body?.error || "No se pudo renombrar.");
        }
        setBusy(false);
    };

    const handleDelete = async (trait: Trait, scope: "one" | "all") => {
        if (!activeCategory || !activeDirectory) return;

        const message = scope === "all"
            ? `Borrar "${trait.file}" de TODAS las carpetas de ${activeCategory}. Esto no se puede deshacer. ¿Seguro?`
            : `Borrar "${trait.file}" de ${activeCategory}/${activeDirectory}. Esto no se puede deshacer. ¿Seguro?`;
        if (!window.confirm(message)) return;

        setBusy(true);
        const response = await fetch(`${BACKEND_URL}/admin/traits`, {
            method: "DELETE",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                category: activeCategory,
                directory: activeDirectory,
                file: trait.file,
                scope
            })
        }).catch(() => null);

        const body = await response?.json().catch(() => ({}));
        if (response?.ok) {
            await loadTraits(token);
            notify("ok", body?.message || "Trait borrado.");
        } else {
            notify("error", body?.error || "No se pudo borrar.");
        }
        setBusy(false);
    };

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files?.length) uploadFiles(event.dataTransfer.files);
    };

    // --- Pantalla de login -------------------------------------------------

    if (!token) {
        return (
            <main className="min-h-screen bg-primacult-gradient flex items-center justify-center px-4">
                <form
                    onSubmit={handleLogin}
                    className="w-full max-w-sm bg-black/40 border border-white/10 rounded-2xl p-8 backdrop-blur"
                >
                    <h1 className="text-2xl font-bold text-white mb-1">Admin de Traits</h1>
                    <p className="text-sm text-white/50 mb-6">Ingresá el token de administración.</p>

                    <input
                        type="password"
                        value={tokenInput}
                        onChange={event => setTokenInput(event.target.value)}
                        placeholder="ADMIN_TOKEN"
                        autoFocus
                        className="w-full bg-black/50 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 outline-none focus:border-primacult transition-colors"
                    />

                    {authError && <p className="mt-3 text-sm text-red-400">{authError}</p>}

                    <button
                        type="submit"
                        disabled={checkingToken || !tokenInput.trim()}
                        className="mt-5 w-full bg-primacult hover:bg-primacult/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition-colors"
                    >
                        {checkingToken ? "Verificando..." : "Entrar"}
                    </button>
                </form>
            </main>
        );
    }

    // --- Panel -------------------------------------------------------------

    return (
        <main className="min-h-screen bg-primacult-gradient text-white">
            <div className="max-w-7xl mx-auto px-4 py-6">
                <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Admin de Traits</h1>
                        <p className="text-sm text-white/50">
                            Los traits en <span className="font-mono text-white/70">{globalDirName}</span> se ofrecen a todos los NFTs.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => loadTraits(token)}
                            disabled={loading || busy}
                            className="text-sm px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 disabled:opacity-40 transition-colors"
                        >
                            {loading ? "Cargando..." : "Recargar"}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="text-sm px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 transition-colors"
                        >
                            Salir
                        </button>
                    </div>
                </header>

                {status && (
                    <div
                        className={`mb-4 rounded-lg px-4 py-3 text-sm border ${
                            status.kind === "ok"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                                : "bg-red-500/10 border-red-500/30 text-red-200"
                        }`}
                    >
                        {status.text}
                    </div>
                )}

                {/* Categorías */}
                <nav className="flex flex-wrap gap-2 mb-6">
                    {data?.categories.map(category => {
                        const total = category.directories.reduce((sum, directory) => sum + directory.traits.length, 0);
                        const isActive = category.name === activeCategory;
                        return (
                            <button
                                key={category.name}
                                onClick={() => {
                                    setActiveCategory(category.name);
                                    setActiveDirectory(null);
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                                    isActive
                                        ? "bg-primacult border-primacult text-white"
                                        : "bg-black/30 border-white/10 text-white/60 hover:text-white hover:border-white/25"
                                }`}
                            >
                                {category.name}
                                <span className="ml-2 text-xs opacity-60">{total}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
                    {/* Carpetas */}
                    <aside className="bg-black/30 border border-white/10 rounded-xl p-3 lg:max-h-[70vh] lg:overflow-y-auto">
                        <p className="text-xs uppercase tracking-wider text-white/40 px-2 mb-2">Carpetas</p>
                        <ul className="space-y-1">
                            {currentCategory?.directories.map(directory => {
                                const isActive = directory.name === activeDirectory;
                                return (
                                    <li key={directory.name}>
                                        <button
                                            onClick={() => setActiveDirectory(directory.name)}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 transition-colors ${
                                                isActive ? "bg-primacult/25 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                                            }`}
                                        >
                                            <span className="truncate">
                                                {directory.isGlobal && <span className="mr-1">🌐</span>}
                                                {directory.name}
                                            </span>
                                            <span className="text-xs opacity-50 shrink-0">{directory.traits.length}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </aside>

                    {/* Traits */}
                    <section>
                        {/* Zona de subida */}
                        <div
                            onDragOver={event => {
                                event.preventDefault();
                                setDragging(true);
                            }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`mb-5 rounded-xl border-2 border-dashed px-6 py-7 text-center cursor-pointer transition-colors ${
                                dragging ? "border-primacult bg-primacult/10" : "border-white/15 hover:border-white/30 bg-black/20"
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".png,.gif,.bmp,.webp"
                                multiple
                                className="hidden"
                                onChange={event => {
                                    if (event.target.files?.length) uploadFiles(event.target.files);
                                    event.target.value = "";
                                }}
                            />
                            <p className="text-sm text-white/80">
                                {busy ? "Subiendo..." : "Arrastrá archivos acá o hacé clic para elegirlos"}
                            </p>
                            <p className="text-xs text-white/40 mt-1">
                                Destino:{" "}
                                <span className="font-mono text-white/70">
                                    {activeCategory || "-"}/{activeDirectory || "-"}
                                </span>
                                {currentDirectory?.isGlobal && " · visible para todos los NFTs"}
                            </p>
                            <p className="text-xs text-white/30 mt-1">PNG, GIF, BMP o WEBP · máx. 25 MB</p>
                        </div>

                        {/* Grilla */}
                        {currentDirectory && currentDirectory.traits.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                                {currentDirectory.traits.map(trait => (
                                    <div
                                        key={trait.file}
                                        className="bg-black/30 border border-white/10 rounded-xl overflow-hidden hover:border-white/25 transition-colors"
                                    >
                                        <div className="aspect-square bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22><rect width=%228%22 height=%228%22 fill=%22%23ffffff10%22/><rect x=%228%22 y=%228%22 width=%228%22 height=%228%22 fill=%22%23ffffff10%22/></svg>')]">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={`${BACKEND_BASE_URL}${trait.url}`}
                                                alt={trait.name}
                                                className="w-full h-full object-contain"
                                                style={{ imageRendering: "pixelated" }}
                                            />
                                        </div>
                                        <div className="p-3">
                                            <p className="text-sm font-medium truncate" title={trait.name}>
                                                {trait.name}
                                            </p>
                                            <p className="text-xs text-white/40 mb-3">{formatBytes(trait.sizeBytes)}</p>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => handleRename(trait)}
                                                    disabled={busy}
                                                    className="text-xs px-2.5 py-1.5 rounded-md border border-white/15 hover:bg-white/10 disabled:opacity-40 transition-colors"
                                                >
                                                    Renombrar
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(trait, "one")}
                                                    disabled={busy}
                                                    className="text-xs px-2.5 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
                                                >
                                                    Borrar
                                                </button>
                                                {!currentDirectory.isGlobal && (
                                                    <button
                                                        onClick={() => handleDelete(trait, "all")}
                                                        disabled={busy}
                                                        title={`Borra este archivo de todas las carpetas de ${activeCategory}`}
                                                        className="text-xs px-2.5 py-1.5 rounded-md border border-red-500/30 text-red-300/80 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
                                                    >
                                                        Borrar en todas
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-white/40 py-10 text-center">
                                {loading ? "Cargando traits..." : "Esta carpeta está vacía."}
                            </p>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}
