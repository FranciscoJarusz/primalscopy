// Panel de administracion (isla de React).
//
// Panel de administración de traits. Habla directo con la API del backend
// Express (/api/admin/*), autenticado con un token compartido que se guarda en
// sessionStorage: se pierde al cerrar la pestaña, que es lo que queremos para
// un secreto compartido.
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

const BACKEND_URL =
    import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
const BACKEND_BASE_URL =
    import.meta.env.PUBLIC_BACKEND_BASE_URL ||
    BACKEND_URL.replace(/\/api\/?$/, '');

const TOKEN_STORAGE_KEY = 'primal_admin_token';

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
    rawTraitsPath?: string;
    isRealMountPoint: boolean;
    relativePathMistake?: boolean;
    healthy: boolean;
    warning: string | null;
    survivedRestart: boolean;
    marker: { createdAt: string; lastBootAt: string; boots: number } | null;
}

// Estado de la migracion de la coleccion al volumen. Tiene que estar completa
// ANTES de mudar el DNS: si el dominio apunta aca sin los 2712 archivos, la
// coleccion entera devuelve 404 en wallets y marketplaces.
interface AssetsStatus {
    images: number;
    metadata: number;
    expected: number;
    readyForDns: boolean;
    originUrl: string;
    publicAssetsUrl: string;
    seeding: {
        running: boolean;
        done: number;
        total: number;
        metadataFetched: number;
        imagesFetched: number;
        bytes: number;
        errorCount: number;
        sampleErrors: string[];
        finishedAt: string | null;
    };
}

// Si el backend no puede escribir en el hosting de la coleccion, el customizer
// deja guardar pero el cambio no se ve en ninguna wallet. Conviene saberlo
// antes de que lo reporte un holder.
interface PublisherStatus {
    ok: boolean;
    configured: boolean;
    canRead?: boolean;
    canWrite?: boolean;
    host?: string;
    remoteRoot?: string;
    remoteImages?: number;
    remoteMetadata?: number;
    missing?: string[];
    error?: string;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminPage() {
    const [token, setToken] = useState<string>('');
    const [tokenInput, setTokenInput] = useState<string>('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [checkingToken, setCheckingToken] = useState<boolean>(false);

    const [data, setData] = useState<TraitsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [activeDirectory, setActiveDirectory] = useState<string | null>(null);

    const [status, setStatus] = useState<{
        kind: 'ok' | 'error';
        text: string;
    } | null>(null);
    const [busy, setBusy] = useState<boolean>(false);
    const [dragging, setDragging] = useState<boolean>(false);
    const [storage, setStorage] = useState<StorageStatus | null>(null);
    const [assets, setAssets] = useState<AssetsStatus | null>(null);
    const [publisher, setPublisher] = useState<PublisherStatus | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- API helpers -------------------------------------------------------

    const authHeaders = useCallback(
        (extra?: Record<string, string>) => ({
            Authorization: `Bearer ${token}`,
            ...(extra || {}),
        }),
        [token]
    );

    const notify = (kind: 'ok' | 'error', text: string) => {
        setStatus({ kind, text });
        window.setTimeout(() => setStatus(null), 6000);
    };

    const loadTraits = useCallback(async (activeToken: string) => {
        setLoading(true);
        try {
            const response = await fetch(`${BACKEND_URL}/admin/traits`, {
                headers: { Authorization: `Bearer ${activeToken}` },
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `Error ${response.status}`);
            }
            const payload: TraitsResponse = await response.json();
            setData(payload);
            return payload;
        } catch (error) {
            notify(
                'error',
                error instanceof Error
                    ? error.message
                    : 'No se pudo cargar la lista de traits.'
            );
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
                headers: { Authorization: `Bearer ${stored}` },
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
                headers: { Authorization: `Bearer ${activeToken}` },
            });
            // Un backend anterior a este diagnostico devuelve 404: no es un error.
            if (!response.ok) return;
            setStorage(await response.json());
        } catch {
            // Que falle el diagnostico no debe romper el panel.
        }
    }, []);

    const loadAssetsStatus = useCallback(async (activeToken: string) => {
        try {
            const response = await fetch(`${BACKEND_URL}/admin/assets`, {
                headers: { Authorization: `Bearer ${activeToken}` },
            });
            if (!response.ok) return;
            setAssets(await response.json());
        } catch {
            // Que falle el diagnostico no debe romper el panel.
        }
    }, []);

    const startAssetsSeed = useCallback(async () => {
        setStatus(null);
        try {
            const response = await fetch(`${BACKEND_URL}/admin/assets/seed`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await response.json();
            setStatus(
                response.ok
                    ? {
                          kind: 'ok',
                          text: body.message || 'Migración iniciada.',
                      }
                    : {
                          kind: 'error',
                          text:
                              body.error || 'No se pudo iniciar la migración.',
                      }
            );
            loadAssetsStatus(token);
        } catch {
            setStatus({
                kind: 'error',
                text: 'No se pudo contactar al servidor.',
            });
        }
    }, [token, loadAssetsStatus]);

    // Mientras la migración corre, refresca el avance solo. Son 2712 archivos
    // y sin esto habría que recargar la página para ver si termino.
    useEffect(() => {
        if (!token || !assets?.seeding.running) return;
        const timer = setInterval(() => loadAssetsStatus(token), 3000);
        return () => clearInterval(timer);
    }, [token, assets?.seeding.running, loadAssetsStatus]);

    const loadPublisherStatus = useCallback(async (activeToken: string) => {
        try {
            const response = await fetch(`${BACKEND_URL}/admin/publisher`, {
                headers: { Authorization: `Bearer ${activeToken}` },
            });
            if (!response.ok) return;
            setPublisher(await response.json());
        } catch {
            // Que falle el diagnostico no debe romper el panel.
        }
    }, []);

    useEffect(() => {
        if (!token) return;
        loadPublisherStatus(token);
        loadAssetsStatus(token);
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
                headers: { Authorization: `Bearer ${candidate}` },
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'Token inválido.');
            }
            sessionStorage.setItem(TOKEN_STORAGE_KEY, candidate);
            setToken(candidate);
            setTokenInput('');
        } catch (error) {
            setAuthError(
                error instanceof Error
                    ? error.message
                    : 'No se pudo validar el token.'
            );
        } finally {
            setCheckingToken(false);
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken('');
        setData(null);
        setActiveCategory(null);
        setActiveDirectory(null);
    };

    // --- Selección ---------------------------------------------------------

    // Al cargar datos, cae parado en la primera categoría y su carpeta global.
    useEffect(() => {
        if (!data || data.categories.length === 0) return;

        const categoryExists = data.categories.some(
            (category) => category.name === activeCategory
        );
        const category = categoryExists
            ? data.categories.find((item) => item.name === activeCategory)!
            : data.categories[0];

        if (!categoryExists) setActiveCategory(category.name);

        const directoryExists = category.directories.some(
            (directory) => directory.name === activeDirectory
        );
        if (!directoryExists) {
            const preferred =
                category.directories.find((directory) => directory.isGlobal) ||
                category.directories[0];
            setActiveDirectory(preferred ? preferred.name : null);
        }
    }, [data, activeCategory, activeDirectory]);

    const currentCategory = useMemo(
        () =>
            data?.categories.find(
                (category) => category.name === activeCategory
            ) || null,
        [data, activeCategory]
    );

    const currentDirectory = useMemo(
        () =>
            currentCategory?.directories.find(
                (directory) => directory.name === activeDirectory
            ) || null,
        [currentCategory, activeDirectory]
    );

    const globalDirName = data?.globalDirName || '_GLOBAL';

    // --- Acciones ----------------------------------------------------------

    const uploadFiles = async (files: FileList | File[]) => {
        if (!activeCategory || !activeDirectory) return;

        setBusy(true);
        let uploaded = 0;
        const failures: string[] = [];

        for (const file of Array.from(files)) {
            const form = new FormData();
            form.append('category', activeCategory);
            form.append('directory', activeDirectory);
            form.append('file', file);

            let response = await fetch(`${BACKEND_URL}/admin/traits`, {
                method: 'POST',
                headers: authHeaders(),
                body: form,
            }).catch(() => null);

            // 409 = ya existe. Preguntamos una sola vez por archivo.
            if (response?.status === 409) {
                const confirmed = window.confirm(
                    `Ya existe "${file.name}" en ${activeCategory}/${activeDirectory}. ¿Reemplazarlo?`
                );
                if (!confirmed) continue;

                const overwriteForm = new FormData();
                overwriteForm.append('category', activeCategory);
                overwriteForm.append('directory', activeDirectory);
                overwriteForm.append('overwrite', 'true');
                overwriteForm.append('file', file);
                response = await fetch(`${BACKEND_URL}/admin/traits`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: overwriteForm,
                }).catch(() => null);
            }

            if (response?.ok) {
                uploaded += 1;
            } else {
                const body = await response?.json().catch(() => ({}));
                failures.push(`${file.name}: ${body?.error || 'error de red'}`);
            }
        }

        await loadTraits(token);
        setBusy(false);

        if (failures.length === 0) {
            notify(
                'ok',
                `${uploaded} archivo(s) subido(s) a ${activeCategory}/${activeDirectory}.`
            );
        } else {
            notify(
                'error',
                `Subidos ${uploaded}. Fallaron: ${failures.join(' | ')}`
            );
        }
    };

    const handleRename = async (trait: Trait) => {
        if (!activeCategory || !activeDirectory) return;

        const newName = window.prompt(
            'Nuevo nombre (sin extensión):',
            trait.name
        );
        if (!newName || newName.trim() === trait.name) return;

        setBusy(true);
        const response = await fetch(`${BACKEND_URL}/admin/traits`, {
            method: 'PATCH',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                category: activeCategory,
                directory: activeDirectory,
                file: trait.file,
                newName: newName.trim(),
            }),
        }).catch(() => null);

        const body = await response?.json().catch(() => ({}));
        if (response?.ok) {
            await loadTraits(token);
            notify('ok', `Renombrado a "${newName.trim()}".`);
        } else {
            notify('error', body?.error || 'No se pudo renombrar.');
        }
        setBusy(false);
    };

    const handleDelete = async (trait: Trait, scope: 'one' | 'all') => {
        if (!activeCategory || !activeDirectory) return;

        const message =
            scope === 'all'
                ? `Borrar "${trait.file}" de TODAS las carpetas de ${activeCategory}. Esto no se puede deshacer. ¿Seguro?`
                : `Borrar "${trait.file}" de ${activeCategory}/${activeDirectory}. Esto no se puede deshacer. ¿Seguro?`;
        if (!window.confirm(message)) return;

        setBusy(true);
        const response = await fetch(`${BACKEND_URL}/admin/traits`, {
            method: 'DELETE',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                category: activeCategory,
                directory: activeDirectory,
                file: trait.file,
                scope,
            }),
        }).catch(() => null);

        const body = await response?.json().catch(() => ({}));
        if (response?.ok) {
            await loadTraits(token);
            notify('ok', body?.message || 'Trait borrado.');
        } else {
            notify('error', body?.error || 'No se pudo borrar.');
        }
        setBusy(false);
    };

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files?.length)
            uploadFiles(event.dataTransfer.files);
    };

    // --- Pantalla de login -------------------------------------------------

    if (!token) {
        return (
            <main className="flex flex-1 items-center justify-center py-10">
                <form
                    onSubmit={handleLogin}
                    className="flex flex-col items-center gap-5 bg-darkblue p-8 sm:p-10 rounded-2xl sm:rounded-3xl shadow-lg shadow-darkblue/50 text-center max-w-md w-full"
                >
                    <img
                        src="/brand/logo-icon.svg"
                        alt="Primal Cult"
                        className="w-14 h-auto"
                    />
                    <h1 className="font-accent uppercase text-yellow text-4xl sm:text-5xl">
                        Traits Admin
                    </h1>
                    <p className="text-lightblue/80">
                        Enter the admin token to continue
                    </p>

                    <input
                        type="password"
                        value={tokenInput}
                        onChange={(event) => setTokenInput(event.target.value)}
                        placeholder="ADMIN_TOKEN"
                        autoFocus
                        className="w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-accent leading-tight rounded-md px-3 pb-1.5 text-center focus:outline-none transition-all duration-300"
                    />

                    {authError && (
                        <p className="text-sm text-red-300">{authError}</p>
                    )}

                    <button
                        type="submit"
                        disabled={checkingToken || !tokenInput.trim()}
                        className="w-full bg-yellow text-darkblue font-accent uppercase rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {checkingToken ? 'Verifying...' : 'Enter'}
                    </button>
                </form>
            </main>
        );
    }

    // --- Panel -------------------------------------------------------------

    return (
        <main className="text-white">
            <div className="flex flex-col gap-5 sm:gap-8">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-6">
                    <div>
                        <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                            Traits Admin
                        </h1>
                        <p className="text-base sm:text-lg md:text-xl text-lightblue mt-3 sm:mt-4 max-w-2xl">
                            Upload, rename and delete traits without redeploying
                        </p>
                        <div className="text-sm text-lightblue/60 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>
                                Traits in{' '}
                                <span className="font-mono text-lightblue">
                                    {globalDirName}
                                </span>{' '}
                                are offered to every NFT
                            </span>
                            {/* La confirmación va acá y no en un cartel propio: es un
                                estado que se consulta de reojo, no una alerta. */}
                            {storage?.healthy && storage.survivedRestart && (
                                <span
                                    title={`El contenido sobrevivió a ${storage.marker?.boots} reinicios del servidor`}
                                    className="text-xs text-emerald-300/90 whitespace-nowrap"
                                >
                                    ✓ almacenamiento persistente
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <button
                            onClick={() => loadTraits(token)}
                            disabled={loading || busy}
                            className="bg-yellow text-darkblue font-accent uppercase rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue"
                        >
                            {loading ? 'Loading...' : 'Refresh'}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="inset-ring-2 inset-ring-yellow text-yellow font-accent uppercase rounded-md px-3 pb-1.5 cursor-pointer hover:bg-yellow hover:text-darkblue active:scale-97 transition-all duration-300"
                        >
                            Log out
                        </button>
                    </div>
                </div>

                {/* Si el almacenamiento no persiste, subir cualquier cosa es tirar
                    el trabajo a la basura. Tiene que verse antes que nada. */}
                {storage && !storage.healthy && (
                    <div className="rounded-2xl border-2 border-red-500 bg-red-500/20 px-4 py-4 sm:px-6 sm:py-5">
                        <p className="text-lg font-bold text-red-200">
                            ⚠️ No subas nada: los cambios se van a perder
                        </p>
                        <p className="text-red-200/90 mt-2">
                            La carpeta de traits del servidor no es un volumen
                            persistente. Todo lo que subas, renombres o borres
                            va a desaparecer la próxima vez que el servidor se
                            reinicie, sin ningún aviso.
                        </p>
                        <p className="text-sm text-red-200/70 mt-3 font-mono break-all">
                            TRAITS_PATH = {storage.traitsPath}
                        </p>
                        {/* Mostrar el valor crudo cuando difiere del resuelto delata
                            los espacios invisibles al pegar, que son indetectables
                            mirando solo la ruta final. */}
                        {storage.rawTraitsPath &&
                            storage.rawTraitsPath !== storage.traitsPath && (
                                <p className="text-sm text-red-200/70 font-mono break-all">
                                    valor en la variable ={' '}
                                    {JSON.stringify(storage.rawTraitsPath)}
                                </p>
                            )}
                        {storage.relativePathMistake && (
                            <p className="text-sm text-red-200 mt-1">
                                Esa ruta es <strong>relativa</strong>. El mount
                                path de un volumen es siempre absoluto, como{' '}
                                <span className="font-mono">/data/traits</span>.
                            </p>
                        )}
                        <p className="text-sm text-red-200/70 mt-1">
                            En Railway, el mount path del volumen tiene que ser
                            exactamente esa ruta.
                            {storage.marker &&
                                ` Arranques registrados: ${storage.marker.boots}.`}
                        </p>
                    </div>
                )}

                {/* Migración de la colección al volumen. Solo se muestra cuando falta
                    algo o cuando está corriendo: una vez completa deja de molestar. */}
                {assets && (!assets.readyForDns || assets.seeding.running) && (
                    <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-4 sm:px-6 sm:py-5">
                        <p className="text-lg font-bold text-amber-200">
                            Migración de la colección
                        </p>
                        <p className="text-sm text-amber-100/80 mt-1">
                            Trae los {assets.expected} archivos desde{' '}
                            <span className="font-mono">
                                {assets.originUrl}
                            </span>{' '}
                            a este servidor. Tiene que estar completa{' '}
                            <strong>antes</strong> de apuntar el dominio acá: si
                            no, la colección entera se ve rota en wallets y
                            marketplaces.
                        </p>

                        <div className="mt-4 flex flex-wrap gap-6 text-sm">
                            <div>
                                <span className="text-amber-100/60">
                                    Metadata:{' '}
                                </span>
                                <span className="font-mono text-amber-100">
                                    {assets.metadata} / {assets.expected}
                                </span>
                            </div>
                            <div>
                                <span className="text-amber-100/60">
                                    Imágenes:{' '}
                                </span>
                                <span className="font-mono text-amber-100">
                                    {assets.images} / {assets.expected}
                                </span>
                            </div>
                            {assets.seeding.bytes > 0 && (
                                <div>
                                    <span className="text-amber-100/60">
                                        Descargado:{' '}
                                    </span>
                                    <span className="font-mono text-amber-100">
                                        {formatBytes(assets.seeding.bytes)}
                                    </span>
                                </div>
                            )}
                            {assets.seeding.errorCount > 0 && (
                                <div>
                                    <span className="text-amber-100/60">
                                        Errores:{' '}
                                    </span>
                                    <span className="font-mono text-red-300">
                                        {assets.seeding.errorCount}
                                    </span>
                                </div>
                            )}
                        </div>

                        {assets.seeding.running ? (
                            <div className="mt-4">
                                <div className="h-2 w-full overflow-hidden rounded-full bg-amber-500/20">
                                    <div
                                        className="h-full bg-amber-400 transition-all duration-500"
                                        style={{
                                            width: `${Math.round((assets.seeding.done / Math.max(1, assets.seeding.total)) * 100)}%`,
                                        }}
                                    />
                                </div>
                                <p className="mt-2 text-sm text-amber-100/70">
                                    {assets.seeding.done} de{' '}
                                    {assets.seeding.total} tokens. Podés cerrar
                                    esta página: sigue corriendo en el servidor.
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={startAssetsSeed}
                                className="mt-4 rounded-lg bg-amber-500 px-5 py-2 font-semibold text-black transition-colors hover:bg-amber-400"
                            >
                                {assets.metadata > 0 || assets.images > 0
                                    ? 'Continuar migración'
                                    : 'Empezar migración'}
                            </button>
                        )}

                        {assets.seeding.sampleErrors.length > 0 && (
                            <details className="mt-3 text-xs text-red-300/80">
                                <summary className="cursor-pointer">
                                    Ver errores
                                </summary>
                                <ul className="mt-2 space-y-1 font-mono">
                                    {assets.seeding.sampleErrors.map(
                                        (error, index) => (
                                            <li key={index}>{error}</li>
                                        )
                                    )}
                                </ul>
                            </details>
                        )}
                    </div>
                )}

                {/* Estado de la publicacion en el hosting de la coleccion. */}
                {publisher && !publisher.ok && (
                    <div className="rounded-2xl border-2 border-red-500 bg-red-500/20 px-4 py-4 sm:px-6 sm:py-5">
                        <p className="text-lg font-bold text-red-200">
                            Las customizaciones no se están publicando
                        </p>
                        <p className="text-sm text-red-200 mt-1">
                            Los holders pueden guardar, pero el cambio no se va
                            a ver en ninguna wallet.
                        </p>
                        {!publisher.configured ? (
                            <p className="text-sm text-red-200/80 mt-2 font-mono">
                                Faltan variables en el servidor:{' '}
                                {publisher.missing?.join(', ')}
                            </p>
                        ) : (
                            <p className="text-sm text-red-200/80 mt-2 font-mono">
                                {publisher.error}
                            </p>
                        )}
                    </div>
                )}

                {status && (
                    <div
                        className={`rounded-2xl px-4 py-3 sm:px-6 sm:py-4 border shadow-lg shadow-darkblue/50 ${
                            status.kind === 'ok'
                                ? 'bg-darkblue border-yellow/40 text-yellow'
                                : 'bg-red-500/20 border-red-500/50 text-red-300'
                        }`}
                    >
                        {status.text}
                    </div>
                )}

                {/* Categorías */}
                <div className="bg-darkblue rounded-2xl p-4 sm:p-6 shadow-lg shadow-darkblue/50">
                    <h3 className="font-accent uppercase text-yellow text-2xl mb-4">
                        Categories
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {data?.categories.map((category) => {
                            const total = category.directories.reduce(
                                (sum, directory) =>
                                    sum + directory.traits.length,
                                0
                            );
                            const isActive = category.name === activeCategory;
                            return (
                                <button
                                    key={category.name}
                                    onClick={() => {
                                        setActiveCategory(category.name);
                                        setActiveDirectory(null);
                                    }}
                                    className={`font-accent uppercase text-darkblue rounded-md px-3 pb-1.5 cursor-pointer active:scale-97 transition-all duration-300 ${
                                        isActive
                                            ? 'bg-yellow'
                                            : 'bg-lightblue hover:bg-yellow'
                                    }`}
                                >
                                    {category.name}
                                    <span className="ml-2 text-xs opacity-60">
                                        {total}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
                    {/* Carpetas */}
                    <div className="lg:col-span-1">
                        <div
                            data-lenis-prevent
                            className="bg-darkblue rounded-2xl p-4 sm:p-6 shadow-lg shadow-darkblue/50 max-h-[50vh] lg:max-h-[70vh] overflow-y-auto"
                        >
                            <h3 className="font-accent uppercase text-yellow text-2xl mb-4">
                                Folders
                            </h3>
                            <ul className="space-y-1">
                                {currentCategory?.directories.map(
                                    (directory) => {
                                        const isActive =
                                            directory.name === activeDirectory;
                                        return (
                                            <li key={directory.name}>
                                                <button
                                                    onClick={() =>
                                                        setActiveDirectory(
                                                            directory.name
                                                        )
                                                    }
                                                    className={`w-full text-left px-3 pt-0.5 pb-1.5 rounded-md font-accent uppercase flex items-center justify-between gap-2 cursor-pointer transition-all duration-200 ${
                                                        isActive
                                                            ? 'bg-yellow text-darkblue'
                                                            : 'bg-white/5 text-lightblue hover:bg-white/10 hover:text-yellow'
                                                    }`}
                                                >
                                                    <span className="truncate">
                                                        {directory.isGlobal && (
                                                            <span className="mr-1">
                                                                🌐
                                                            </span>
                                                        )}
                                                        {directory.name}
                                                    </span>
                                                    <span className="text-xs opacity-60 shrink-0">
                                                        {
                                                            directory.traits
                                                                .length
                                                        }
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    }
                                )}
                            </ul>
                        </div>
                    </div>

                    {/* Traits */}
                    <div className="lg:col-span-2">
                        <div className="bg-darkblue rounded-2xl p-4 sm:p-6 shadow-lg shadow-darkblue/50">
                            <h3 className="font-accent uppercase text-yellow text-2xl mb-4 sm:mb-6 break-all">
                                {activeCategory} / {activeDirectory}
                            </h3>

                            {/* Zona de subida */}
                            <div
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`mb-6 rounded-2xl border-2 border-dashed px-4 py-6 sm:px-6 sm:py-7 text-center cursor-pointer transition-all duration-200 ${
                                    dragging
                                        ? 'border-yellow bg-yellow/10'
                                        : 'border-lightblue/30 hover:border-yellow bg-white/5'
                                }`}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".png,.gif,.bmp,.webp"
                                    multiple
                                    className="hidden"
                                    onChange={(event) => {
                                        if (event.target.files?.length)
                                            uploadFiles(event.target.files);
                                        event.target.value = '';
                                    }}
                                />
                                <p className="font-accent uppercase text-lightblue">
                                    {busy
                                        ? 'Uploading...'
                                        : 'Drop files here or click to browse'}
                                </p>
                                <p className="text-sm text-lightblue/70 mt-1 break-all">
                                    Target:{' '}
                                    <span className="font-mono">
                                        {activeCategory || '-'}/
                                        {activeDirectory || '-'}
                                    </span>
                                    {currentDirectory?.isGlobal &&
                                        ' · visible to every NFT'}
                                </p>
                                <p className="text-xs text-lightblue/50 mt-1">
                                    PNG, GIF, BMP or WEBP · max 25 MB
                                </p>
                            </div>

                            {/* Grilla */}
                            {loading ? (
                                <div className="text-center py-16">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow mx-auto mb-4"></div>
                                    <div className="text-lightblue text-xl">
                                        Loading traits...
                                    </div>
                                </div>
                            ) : currentDirectory &&
                              currentDirectory.traits.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                                    {currentDirectory.traits.map((trait) => (
                                        <div
                                            key={trait.file}
                                            className="transition-all duration-200"
                                        >
                                            <div className="bg-white/10 rounded-[10px] p-2 mb-2">
                                                <img
                                                    src={`${BACKEND_BASE_URL}${trait.url}`}
                                                    alt={trait.name}
                                                    className="w-full aspect-square object-cover rounded-md"
                                                    style={{
                                                        imageRendering:
                                                            'pixelated',
                                                    }}
                                                />
                                            </div>
                                            <p
                                                className="text-center font-accent uppercase text-yellow text-sm truncate"
                                                title={trait.name}
                                            >
                                                {trait.name}
                                            </p>
                                            <p className="text-center text-xs text-lightblue/50 mb-2">
                                                {formatBytes(trait.sizeBytes)}
                                            </p>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                <button
                                                    onClick={() =>
                                                        handleRename(trait)
                                                    }
                                                    disabled={busy}
                                                    className="text-xs bg-lightblue text-darkblue font-accent uppercase rounded-md px-2.5 pb-1 cursor-pointer hover:bg-yellow disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handleDelete(
                                                            trait,
                                                            'one'
                                                        )
                                                    }
                                                    disabled={busy}
                                                    className="text-xs bg-red text-lightblue font-accent uppercase rounded-md px-2.5 pb-1 cursor-pointer hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                                                >
                                                    Delete
                                                </button>
                                                {!currentDirectory.isGlobal && (
                                                    <button
                                                        onClick={() =>
                                                            handleDelete(
                                                                trait,
                                                                'all'
                                                            )
                                                        }
                                                        disabled={busy}
                                                        title={`Deletes this file from every ${activeCategory} folder`}
                                                        className="text-xs inset-ring-1 inset-ring-red text-red-300 font-accent uppercase rounded-md px-2.5 pb-1 cursor-pointer hover:bg-red hover:text-lightblue disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                                                    >
                                                        Delete everywhere
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-lightblue/70 py-16 text-center">
                                    This folder is empty.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
