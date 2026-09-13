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

// Diagnostico de almacenamiento. Si el volumen no es persistente, todo lo que
// se suba se pierde en el proximo reinicio del servidor, sin ningun error:
// hay que avisarlo antes de que alguien pierda horas de trabajo.
interface StorageStatus {
    traitsPath: string;
    isRealMountPoint: boolean;
    healthy: boolean;
    warning: string | null;
    survivedRestart: boolean;
    marker: { createdAt: string; lastBootAt: string; boots: number } | null;
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
    const [storage, setStorage] = useState<StorageStatus | null>(null);

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

    const loadStorageStatus = useCallback(async (activeToken: string) => {
        try {
            const response = await fetch(`${BACKEND_URL}/admin/storage`, {
                headers: { Authorization: `Bearer ${activeToken}` }
            });
            // Un backend anterior a este diagnostico devuelve 404: no es un error.
            if (!response.ok) return;
            setStorage(await response.json());
        } catch {
            // Que falle el diagnostico no debe romper el panel.
        }
    }, []);

    useEffect(() => {
        if (!token) return;
        loadTraits(token);
        loadStorageStatus(token);
    }, [token, loadTraits, loadStorageStatus]);

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
            <main className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] flex items-center justify-center p-4">
                <div className="relative">
                    <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-10">
                        <div className="w-24 h-24 bg-[#000000] rounded-full flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/logo.png" alt="PrimaCult Logo" className="w-20 h-20 object-contain" />
                        </div>
                    </div>

                    <form
                        onSubmit={handleLogin}
                        className="flex flex-col gap-6 bg-[#1322D3] p-12 rounded-3xl shadow-2xl text-center max-w-md w-full"
                    >
                        <h1 className="text-4xl font-bold text-white">Prima Cult</h1>
                        <p className="text-white font-bold text-2xl">Traits Admin</p>
                        <p className="text-blue-200 text-md">Enter the admin token to continue</p>

                        <input
                            type="password"
                            value={tokenInput}
                            onChange={event => setTokenInput(event.target.value)}
                            placeholder="ADMIN_TOKEN"
                            autoFocus
                            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 text-center focus:outline-none focus:border-white transition-colors"
                        />

                        {authError && <p className="text-sm text-red-200">{authError}</p>}

                        <button
                            type="submit"
                            disabled={checkingToken || !tokenInput.trim()}
                            className="bg-white hover:scale-105 text-blue-600 font-bold py-4 px-12 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                            {checkingToken ? "Verifying..." : "Enter"}
                        </button>
                    </form>
                </div>
            </main>
        );
    }

    // --- Panel -------------------------------------------------------------

    return (
        <main className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="max-w-7xl mx-auto flex flex-col gap-8">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <div>
                        <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            Traits Admin
                        </h1>
                        <p className="text-lg sm:text-xl text-blue-200 mt-2 max-w-2xl">
                            Upload, rename and delete traits without redeploying
                        </p>
                        <div className="text-sm text-white/60 mt-1">
                            Traits in <span className="font-mono text-white/80">{globalDirName}</span> are offered to every NFT
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <button
                            onClick={() => loadTraits(token)}
                            disabled={loading || busy}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 disabled:transform-none text-sm sm:text-base"
                        >
                            {loading ? "🔄 Loading..." : "🔄 Refresh"}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="bg-white/10 hover:bg-white/20 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 text-sm sm:text-base"
                        >
                            Log out
                        </button>
                    </div>
                </div>

                {/* Si el almacenamiento no persiste, subir cualquier cosa es tirar
                    el trabajo a la basura. Tiene que verse antes que nada. */}
                {storage && !storage.healthy && (
                    <div className="rounded-xl border-2 border-red-500 bg-red-500/20 px-6 py-5">
                        <p className="text-lg font-bold text-red-200">
                            ⚠️ No subas nada: los cambios se van a perder
                        </p>
                        <p className="text-red-200/90 mt-2">
                            La carpeta de traits del servidor no es un volumen persistente. Todo lo que
                            subas, renombres o borres va a desaparecer la próxima vez que el servidor se
                            reinicie, sin ningún aviso.
                        </p>
                        <p className="text-sm text-red-200/70 mt-3 font-mono break-all">
                            TRAITS_PATH = {storage.traitsPath}
                        </p>
                        <p className="text-sm text-red-200/70 mt-1">
                            En Railway, el mount path del volumen tiene que ser exactamente esa ruta.
                            {storage.marker && ` Arranques registrados: ${storage.marker.boots}.`}
                        </p>
                    </div>
                )}

                {storage && storage.healthy && storage.survivedRestart && (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-3">
                        <p className="text-sm text-emerald-200">
                            ✓ Almacenamiento persistente verificado — el contenido sobrevivió a{" "}
                            {storage.marker?.boots} reinicios del servidor.
                        </p>
                    </div>
                )}

                {status && (
                    <div
                        className={`rounded-xl px-6 py-4 border ${
                            status.kind === "ok"
                                ? "bg-blue-500/20 border-blue-500/50 text-blue-200"
                                : "bg-red-500/20 border-red-500/50 text-red-300"
                        }`}
                    >
                        {status.text}
                    </div>
                )}

                {/* Categorías */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-semibold mb-4">Categories</h3>
                    <div className="flex flex-wrap gap-2">
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
                                    className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                                        isActive
                                            ? "bg-blue-600 text-white"
                                            : "bg-white/10 text-white/70 hover:bg-white/20"
                                    }`}
                                >
                                    {category.name}
                                    <span className="ml-2 text-xs opacity-60">{total}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Carpetas */}
                    <div className="lg:col-span-1">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-6 lg:max-h-[70vh] lg:overflow-y-auto">
                            <h3 className="text-xl font-semibold mb-4">Folders</h3>
                            <ul className="space-y-1">
                                {currentCategory?.directories.map(directory => {
                                    const isActive = directory.name === activeDirectory;
                                    return (
                                        <li key={directory.name}>
                                            <button
                                                onClick={() => setActiveDirectory(directory.name)}
                                                className={`w-full text-left px-4 py-2 rounded-lg font-semibold flex items-center justify-between gap-2 transition-all duration-200 ${
                                                    isActive
                                                        ? "bg-blue-600 text-white"
                                                        : "bg-white/10 text-white/70 hover:bg-white/20"
                                                }`}
                                            >
                                                <span className="truncate">
                                                    {directory.isGlobal && <span className="mr-1">🌐</span>}
                                                    {directory.name}
                                                </span>
                                                <span className="text-xs opacity-60 shrink-0">{directory.traits.length}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>

                    {/* Traits */}
                    <div className="lg:col-span-2">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <h3 className="text-xl font-semibold mb-6">
                                {activeCategory} / {activeDirectory}
                            </h3>

                            {/* Zona de subida */}
                            <div
                                onDragOver={event => {
                                    event.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`mb-6 rounded-xl border-2 border-dashed px-6 py-7 text-center cursor-pointer transition-all duration-200 ${
                                    dragging
                                        ? "border-blue-500 bg-blue-500/10"
                                        : "border-white/20 hover:border-blue-500 bg-white/5"
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
                                <p className="font-semibold text-white">
                                    {busy ? "Uploading..." : "Drop files here or click to browse"}
                                </p>
                                <p className="text-sm text-blue-200 mt-1">
                                    Target:{" "}
                                    <span className="font-mono">
                                        {activeCategory || "-"}/{activeDirectory || "-"}
                                    </span>
                                    {currentDirectory?.isGlobal && " · visible to every NFT"}
                                </p>
                                <p className="text-xs text-white/50 mt-1">PNG, GIF, BMP or WEBP · max 25 MB</p>
                            </div>

                            {/* Grilla */}
                            {loading ? (
                                <div className="text-center py-16">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                                    <div className="text-blue-200 text-xl">Loading traits...</div>
                                </div>
                            ) : currentDirectory && currentDirectory.traits.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {currentDirectory.traits.map(trait => (
                                        <div key={trait.file} className="transition-all duration-200">
                                            <div className="bg-white/10 rounded-lg p-2 mb-2">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={`${BACKEND_BASE_URL}${trait.url}`}
                                                    alt={trait.name}
                                                    className="w-full aspect-square object-cover rounded"
                                                    style={{ imageRendering: "pixelated" }}
                                                />
                                            </div>
                                            <p className="text-center text-sm font-medium truncate" title={trait.name}>
                                                {trait.name}
                                            </p>
                                            <p className="text-center text-xs text-white/50 mb-2">
                                                {formatBytes(trait.sizeBytes)}
                                            </p>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                <button
                                                    onClick={() => handleRename(trait)}
                                                    disabled={busy}
                                                    className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-white/10 text-white/70 hover:bg-white/20 disabled:opacity-40 transition-all duration-200"
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(trait, "one")}
                                                    disabled={busy}
                                                    className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 disabled:opacity-40 transition-all duration-200"
                                                >
                                                    Delete
                                                </button>
                                                {!currentDirectory.isGlobal && (
                                                    <button
                                                        onClick={() => handleDelete(trait, "all")}
                                                        disabled={busy}
                                                        title={`Deletes this file from every ${activeCategory} folder`}
                                                        className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-red-500/20 border border-red-500/50 text-red-300/80 hover:bg-red-500/30 disabled:opacity-40 transition-all duration-200"
                                                    >
                                                        Delete everywhere
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-blue-200 py-16 text-center">This folder is empty.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
