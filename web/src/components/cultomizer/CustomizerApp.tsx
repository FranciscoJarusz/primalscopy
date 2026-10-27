import React, { useState, useEffect, useMemo, useRef } from 'react';
import GIF from 'gif.js/dist/gif.js';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { goTo, replaceWith, useSearchParams } from '@/lib/navigation';
import { nombreWallet, useApodos } from '@/lib/nicknames';
import { miniaturaDeTrait } from '@/lib/miniaturas';
import { FiLock, FiRotateCcw } from 'react-icons/fi';
import Confirmacion from '@/components/forge/Confirmacion';
import StakeCompartir from '@/components/staking/StakeCompartir';
import PaginasGrilla from '@/components/shared/PaginasGrilla';
import { ICONO_FOG_CHICO } from '@/lib/staking';
import {
    useWalletSession,
    useNftOwnership,
} from '@/hooks/cultomizer/useWalletSession';
import { BACKEND_URL, BACKEND_BASE_URL } from '@/lib/backend';
import { LAYER_ORDER } from '@/lib/capas';

// La venta de un trait exclusivo (ver lib/traitShopStore.js en el backend).
interface Drop {
    price: number;
    status: 'scheduled' | 'live' | 'ended' | 'sold-out';
    startsAt: string;
    endsAt: string | null;
    left: number | null;
}

interface TraitVariant {
    name: string;
    imageUrl: string | null;
    isNone?: boolean;
    // El drop si es un trait exclusivo, o null si es comun.
    drop?: Drop | null;
}

interface CustomizationOption {
    currentValue: string;
    variants: TraitVariant[];
}

interface CustomizationOptions {
    [traitType: string]: CustomizationOption;
}

const THUMBNAIL_SIZE = 80;
const GIF_EXPORT_SIZE = 2000;
const NONE_SELECTION = '__NONE__';

const isNoneVariant = (variant: TraitVariant): boolean => {
    if (!variant) return true;
    if (variant.isNone) return true;
    return (variant.name || '').trim().toLowerCase() === 'none';
};

interface GifFrame {
    dims: { left: number; top: number; width: number; height: number };
    delay?: number;
    disposalType?: number;
    patch: Uint8ClampedArray;
}

type LoadedImageLayer = { url: string; type: 'image'; image: HTMLImageElement };
type LoadedGifLayer = {
    url: string;
    type: 'gif';
    frames: GifFrame[];
    origWidth: number;
    origHeight: number;
};
type LoadedLayer = LoadedImageLayer | LoadedGifLayer;

function CustomizerContent() {
    const searchParams = useSearchParams();

    const tokenIdFromUrl = searchParams.get('tokenId');

    const [nftId, setNftId] = useState<string>(tokenIdFromUrl || '');
    const [inputNftId, setInputNftId] = useState<string>(tokenIdFromUrl || '');
    const [customizationOptions, setCustomizationOptions] =
        useState<CustomizationOptions | null>(null);
    const [selectedVariants, setSelectedVariants] = useState<{
        [key: string]: string;
    }>({});
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [activeTraitSection, setActiveTraitSection] = useState<string | null>(
        null
    );
    // Lo que el Primal tiene hoy, para marcar las categorias que cambiaron.
    const [original, setOriginal] = useState<{ [key: string]: string }>({});
    // La opcion bajo el mouse: se ve en el preview sin elegirla.
    const [probando, setProbando] = useState<{
        trait: string;
        valor: string;
    } | null>(null);
    // Los traits que esta wallet ya desbloqueo con FOG y su saldo. null hasta
    // que firma.
    const [tienda, setTienda] = useState<{
        unlocked: string[];
        balance: number;
    } | null>(null);
    const [desbloqueando, setDesbloqueando] = useState(false);
    const [errorDesbloqueo, setErrorDesbloqueo] = useState<string | null>(null);
    const [aDesbloquear, setADesbloquear] = useState<{
        trait: string;
        variant: TraitVariant;
        precio: number;
    } | null>(null);
    const [desbloqueado, setDesbloqueado] = useState<TraitVariant | null>(null);
    // Capas cuyo archivo no cargó: se sacan del preview en vez de dejar que el
    // navegador dibuje el ícono de imagen rota encima del NFT.
    const [failedLayers, setFailedLayers] = useState<string[]>([]);
    // Capas cuya miniatura de preview no cargo (por ejemplo, un backend sin
    // ese tamaño todavia): esas se muestran con el GIF original.
    const [sinMiniatura, setSinMiniatura] = useState<string[]>([]);
    const [exportingGif, setExportingGif] = useState<boolean>(false);
    const [exportingJpg, setExportingJpg] = useState<boolean>(false);
    const [exportProgress, setExportProgress] = useState<number>(0);

    const nftDisplayRef = useRef<HTMLDivElement>(null);

    // Sesion probada ante el backend (firma) y si esa wallet es dueña de este
    // token. De esto cuelga el boton de guardar.
    const walletSession = useWalletSession();
    const apodos = useApodos();
    const { state: ownership, owner } = useNftOwnership(
        nftId || null,
        walletSession.token
    );

    useEffect(() => {
        if (!walletSession.token) {
            setTienda(null);
            return;
        }
        let vigente = true;
        fetch(`${BACKEND_URL}/traits/me`, {
            headers: { authorization: `Bearer ${walletSession.token}` },
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => vigente && d && setTienda(d))
            .catch(() => {});
        return () => {
            vigente = false;
        };
    }, [walletSession.token]);

    const [saving, setSaving] = useState<boolean>(false);
    const [saveResult, setSaveResult] = useState<{
        kind: 'ok' | 'error';
        text: string;
    } | null>(null);

    // Pre-cargar el worker de gif.js al montar la página.
    // En iOS Safari, la primera vez que se usa el worker se descarga el script
    // justo cuando el canvas ya consume RAM → pico de memoria → Safari mata el tab.
    // Pre-cargándolo queda en caché del browser antes de que el usuario toque Export.
    useEffect(() => {
        fetch('/gif.worker.js').catch(() => {});
    }, []);

    // El ultimo primal que se estuvo customizando. Es el respaldo para volver
    // desde "Recent Customizations" cuando se llega a esa pantalla sin el id en
    // la URL, por ejemplo entrando por un link directo.
    useEffect(() => {
        if (!nftId) return;
        try {
            sessionStorage.setItem('cultomizer:lastTokenId', nftId);
        } catch {
            // En modo privado puede tirar error. No pasa nada: el boton de
            // volver cae en el selector, que es un destino valido.
        }
    }, [nftId]);

    const getVariantSelectionValue = (variant: TraitVariant): string =>
        variant.imageUrl || NONE_SELECTION;

    useEffect(() => {
        if (!nftId) return;
        const loadNftData = async () => {
            setLoading(true);
            setError(null);
            setCustomizationOptions(null);
            setSelectedVariants({});
            setOriginal({});
            setProbando(null);
            setFailedLayers([]);
            try {
                const optionsResponse = await fetch(
                    `${BACKEND_URL}/nft/${nftId}/customize-options`
                );
                if (!optionsResponse.ok)
                    throw new Error(`Error: ${optionsResponse.status}`);
                const data: CustomizationOptions = await optionsResponse.json();
                const sanitizedData = Object.fromEntries(
                    Object.entries(data).map(([traitType, option]) => {
                        const variants = (option?.variants || []).filter(
                            (variant) => !isNoneVariant(variant)
                        );
                        return [traitType, { ...option, variants }];
                    })
                ) as CustomizationOptions;

                setCustomizationOptions(sanitizedData);
                const initialSelections: { [key: string]: string } = {};
                for (const traitType in sanitizedData) {
                    const currentValue = (
                        sanitizedData[traitType].currentValue || ''
                    ).toLowerCase();
                    const defaultVariant =
                        sanitizedData[traitType].variants.find((variant) => {
                            if (!variant || !variant.name) return false;
                            return variant.name.toLowerCase() === currentValue;
                        }) || sanitizedData[traitType].variants[0];
                    if (defaultVariant) {
                        initialSelections[traitType] =
                            getVariantSelectionValue(defaultVariant);
                    }
                }

                // Lo que el NFT tiene aplicado HOY, segun el servidor. Manda sobre
                // todo lo demas: es la unica fuente que no depende del dispositivo.
                let appliedOnChain: { [key: string]: string } | null = null;
                try {
                    const savedResponse = await fetch(
                        `${BACKEND_URL}/nft/${nftId}/customization`
                    );
                    if (savedResponse.ok) {
                        const savedData = await savedResponse.json();
                        // El NFT cambio fuera del customizer (lo edito el dueño
                        // de la coleccion). Lo que este navegador tenia guardado
                        // era sobre la imagen de antes: se olvida, una sola vez
                        // por cambio, para no borrar lo que se elija despues.
                        const supersededAt = savedData?.supersededAt;
                        const resetKey = `nft_custom_${nftId}_reset`;
                        if (
                            supersededAt &&
                            localStorage.getItem(resetKey) !== supersededAt
                        ) {
                            localStorage.removeItem(`nft_custom_${nftId}`);
                            localStorage.setItem(resetKey, supersededAt);
                        }
                        if (savedData?.saved && savedData.applied) {
                            const fromServer: { [key: string]: string } = {};
                            for (const [traitType, variant] of Object.entries(
                                savedData.applied
                            )) {
                                const imageUrl = (
                                    variant as { imageUrl?: string }
                                )?.imageUrl;
                                // Se valida igual que el resto: un trait que ya no
                                // existe no puede quedar seleccionado.
                                const stillOffered =
                                    imageUrl &&
                                    sanitizedData[traitType]?.variants.some(
                                        (v) =>
                                            getVariantSelectionValue(v) ===
                                            imageUrl
                                    );
                                if (stillOffered)
                                    fromServer[traitType] = imageUrl as string;
                            }
                            if (Object.keys(fromServer).length > 0)
                                appliedOnChain = fromServer;
                        }
                    }
                } catch {
                    // Si no se puede consultar, se sigue con el comportamiento
                    // anterior en vez de dejar la pagina sin cargar.
                }

                setOriginal(initialSelections);
                if (appliedOnChain) {
                    const applied = { ...initialSelections, ...appliedOnChain };
                    setOriginal(applied);
                    setSelectedVariants(applied);
                    try {
                        localStorage.setItem(
                            `nft_custom_${nftId}`,
                            JSON.stringify(applied)
                        );
                    } catch {
                        /* storage lleno */
                    }
                    const firstSection =
                        LAYER_ORDER.find((trait) => sanitizedData[trait]) ||
                        Object.keys(sanitizedData)[0] ||
                        null;
                    setActiveTraitSection(firstSection);
                    setLoading(false);
                    return;
                }

                try {
                    const saved = localStorage.getItem(`nft_custom_${nftId}`);
                    if (saved) {
                        const savedSelections: { [key: string]: string } =
                            JSON.parse(saved);
                        // No alcanza con que la categoría siga existiendo: hay que validar
                        // la URL guardada contra las variantes de ahora. Si un trait se
                        // renombró o se borró desde /admin, el navegador se queda con la
                        // URL vieja y esa capa da 404. Ojo que el server es Linux: un
                        // cambio de mayúsculas (STANDART.gif → Standart.gif) ya es otro
                        // archivo, aunque en Windows local parezca el mismo.
                        const restored: { [key: string]: string } = {
                            ...initialSelections,
                        };
                        for (const traitType in savedSelections) {
                            const option = sanitizedData[traitType];
                            if (!option) continue;
                            const savedValue = savedSelections[traitType];
                            const stillExists =
                                savedValue === NONE_SELECTION ||
                                option.variants.some(
                                    (variant) =>
                                        getVariantSelectionValue(variant) ===
                                        savedValue
                                );
                            if (stillExists) {
                                restored[traitType] = savedValue;
                            }
                        }
                        setSelectedVariants(restored);
                        // Reescribir lo guardado para que las selecciones muertas no
                        // vuelvan a aparecer en cada carga.
                        try {
                            localStorage.setItem(
                                `nft_custom_${nftId}`,
                                JSON.stringify(restored)
                            );
                        } catch {
                            /* storage lleno */
                        }
                    } else {
                        setSelectedVariants(initialSelections);
                    }
                } catch {
                    setSelectedVariants(initialSelections);
                }
                const firstAvailableSection =
                    LAYER_ORDER.find((trait) => sanitizedData[trait]) ||
                    Object.keys(sanitizedData)[0] ||
                    null;
                setActiveTraitSection(firstAvailableSection);
            } catch (_error: unknown) {
                setError(`Failed to load NFT #${nftId} data.`);
            } finally {
                setLoading(false);
            }
        };
        loadNftData();
    }, [nftId, BACKEND_URL]);

    const capasDe = (seleccion: { [key: string]: string }) =>
        LAYER_ORDER.flatMap((trait) => {
            const layerUrl = seleccion[trait];
            if (!layerUrl || layerUrl === NONE_SELECTION) return [];
            const url = /^https?:\/\//.test(layerUrl)
                ? layerUrl
                : `${BACKEND_BASE_URL}${layerUrl}`;
            return [{ trait, url }];
        });

    const displayedLayers = useMemo(
        () => capasDe(selectedVariants).map(({ url }) => url),
        [selectedVariants, BACKEND_BASE_URL]
    );

    const capasPreview = useMemo(
        () =>
            capasDe(
                probando
                    ? { ...selectedVariants, [probando.trait]: probando.valor }
                    : selectedVariants
            ),
        [selectedVariants, probando, BACKEND_BASE_URL]
    );

    // Un trait con drop queda bloqueado hasta que la wallet lo desbloquea. El
    // que el Primal ya tiene puesto no: vino con el NFT.
    const dropBloqueado = (trait: string, variant: TraitVariant) => {
        if (!variant.drop) return null;
        const valor = getVariantSelectionValue(variant);
        if (valor === original[trait] || tienda?.unlocked.includes(valor))
            return null;
        return variant.drop;
    };
    const precioDe = (trait: string, variant: TraitVariant) =>
        dropBloqueado(trait, variant)?.price ?? null;
    // Lo bloqueado solo se ve mientras esta a la venta: un drop programado,
    // terminado o agotado no aparece para quien no lo compro.
    const visible = (trait: string, variant: TraitVariant) => {
        const drop = dropBloqueado(trait, variant);
        return !drop || drop.status === 'live';
    };

    const allAssetsSelected = useMemo(() => {
        if (!customizationOptions) return false;
        return Object.keys(customizationOptions).every(
            (traitType) => selectedVariants[traitType] !== undefined
        );
    }, [selectedVariants, customizationOptions]);

    const handleVariantChange = (traitType: string, variant: TraitVariant) => {
        const nextValue = getVariantSelectionValue(variant);
        setSelectedVariants((prev) => {
            const updated = { ...prev };
            if (updated[traitType] === nextValue) delete updated[traitType];
            else updated[traitType] = nextValue;
            try {
                localStorage.setItem(
                    `nft_custom_${nftId}`,
                    JSON.stringify(updated)
                );
            } catch {
                /* storage lleno */
            }
            return updated;
        });
    };

    // El dado del Preview: una variante al azar en cada categoria, entre las
    // que este Primal ya puede elegir a mano (incluidos los adornos de
    // _GLOBAL). Nunca "ninguno": el dado no deja categorias vacias. Queda
    // guardado igual que una eleccion manual.
    const hayCambios = useMemo(
        () =>
            Object.keys(original).length > 0 &&
            Object.keys(customizationOptions ?? {}).some(
                (trait) => selectedVariants[trait] !== original[trait]
            ),
        [original, selectedVariants, customizationOptions]
    );

    const handleReset = () => {
        setProbando(null);
        setSelectedVariants(original);
        try {
            localStorage.setItem(
                `nft_custom_${nftId}`,
                JSON.stringify(original)
            );
        } catch {
            /* storage lleno */
        }
    };

    const handleRandomize = () => {
        if (!customizationOptions) return;
        const random: { [traitType: string]: string } = {};
        for (const [traitType, option] of Object.entries(
            customizationOptions
        )) {
            const elegibles = option.variants.filter(
                (v) =>
                    !v.isNone && v.imageUrl && precioDe(traitType, v) === null
            );
            if (elegibles.length === 0) continue;
            const variant =
                elegibles[Math.floor(Math.random() * elegibles.length)];
            random[traitType] = getVariantSelectionValue(variant);
        }
        setSelectedVariants((prev) => {
            const updated = { ...prev, ...random };
            try {
                localStorage.setItem(
                    `nft_custom_${nftId}`,
                    JSON.stringify(updated)
                );
            } catch {
                /* storage lleno */
            }
            return updated;
        });
    };

    const handleDesbloquear = async () => {
        if (!aDesbloquear || !walletSession.token) return;
        setDesbloqueando(true);
        setErrorDesbloqueo(null);
        try {
            const r = await fetch(`${BACKEND_URL}/traits/unlock`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${walletSession.token}`,
                },
                body: JSON.stringify({ trait: aDesbloquear.variant.imageUrl }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Couldn't unlock it.");
            setTienda({ unlocked: d.unlocked, balance: d.balance });
            handleVariantChange(aDesbloquear.trait, aDesbloquear.variant);
            setActiveTraitSection(aDesbloquear.trait);
            setProbando(null);
            setDesbloqueado(aDesbloquear.variant);
            setADesbloquear(null);
        } catch (error) {
            setErrorDesbloqueo(
                error instanceof Error ? error.message : "Couldn't unlock it."
            );
        }
        setDesbloqueando(false);
    };

    // Guarda la combinacion en el NFT de verdad: el backend recompone la imagen
    // y reescribe la metadata que leen las wallets. Tarda, porque componer un
    // GIF de 2000x2000 no es instantaneo y ademas hay que subirlo.
    const handleSaveToNft = async () => {
        if (!walletSession.token || ownership !== 'owner' || !allAssetsSelected)
            return;

        setSaving(true);
        setSaveResult(null);
        try {
            const response = await fetch(
                `${BACKEND_URL}/nft/${nftId}/customization`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        authorization: `Bearer ${walletSession.token}`,
                    },
                    body: JSON.stringify({ selections: selectedVariants }),
                }
            );
            const body = await response.json();

            if (!response.ok) {
                setSaveResult({
                    kind: 'error',
                    text: body.error || 'Could not save.',
                });
                return;
            }
            // Aviso explicito de la demora: los marketplaces cachean y el holder
            // que no lo sepa va a pensar que no funciono.
            //
            // Si ademas no se pudo avisar al marketplace, la miniatura de las
            // grillas puede quedar vieja bastante mas tiempo. Se dice, porque si
            // no el unico sintoma es un usuario confundido.
            const refreshOk = body.marketplaceRefresh?.requested !== false;
            setSaveResult({
                kind: 'ok',
                text: refreshOk
                    ? 'Saved. Your wallet may take a while to refresh.'
                    : 'Saved, but the marketplace was not notified: the thumbnail may stay outdated for a while.',
            });
        } catch {
            setSaveResult({
                kind: 'error',
                text: 'Could not reach the server.',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleLoadNft = () => {
        const trimmedId = inputNftId.trim();
        if (trimmedId && trimmedId !== nftId) {
            setNftId(trimmedId);
            // Actualizar la URL para que un reload en móvil mantenga el NFT correcto
            replaceWith(`/cultomizer/edit?tokenId=${trimmedId}`);
        }
    };

    const handleInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleLoadNft();
    };

    const handleBackToSelection = () => {
        goTo('/cultomizer/select');
    };

    const handleExportGif = async () => {
        if (!allAssetsSelected) {
            alert(
                'You must select an option in each category before exporting.'
            );
            return;
        }

        if (displayedLayers.length === 0) {
            alert('There are no layers to export.');
            return;
        }

        setExportingGif(true);
        setExportProgress(0);

        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

        try {
            // En iOS usamos tamaño reducido para no agotar la RAM del dispositivo
            const exportSize = isIOS ? 1200 : GIF_EXPORT_SIZE;
            const loadedLayers: LoadedLayer[] = await Promise.all(
                displayedLayers.map(async (url) => {
                    if (url.endsWith('.gif')) {
                        const response = await fetch(url);
                        if (!response.ok)
                            throw new Error(`Failed to load GIF layer: ${url}`);
                        const buffer = await response.arrayBuffer();
                        const parsedGif = parseGIF(buffer);
                        const frames = decompressFrames(
                            parsedGif,
                            true
                        ) as unknown as GifFrame[];
                        // Dimensiones originales del GIF: máximo de (left+width) y (top+height) entre todos los frames
                        const origWidth = Math.max(
                            ...frames.map((f) => f.dims.left + f.dims.width)
                        );
                        const origHeight = Math.max(
                            ...frames.map((f) => f.dims.top + f.dims.height)
                        );
                        return {
                            url,
                            type: 'gif',
                            frames,
                            origWidth,
                            origHeight,
                        };
                    }
                    const image = await new Promise<HTMLImageElement>(
                        (resolve, reject) => {
                            const img = new Image();
                            img.crossOrigin = 'anonymous';
                            img.onload = () => resolve(img);
                            img.onerror = () =>
                                reject(
                                    new Error(`Failed to load image: ${url}`)
                                );
                            img.src = url;
                        }
                    );
                    return { url, type: 'image', image };
                })
            );

            // GIF animado — iOS usa 500px + 1 worker para caber en RAM, desktop usa 2000px + 2 workers
            const gif = new GIF({
                workers: isIOS ? 1 : 2,
                quality: isIOS ? 15 : 10,
                width: exportSize,
                height: exportSize,
                workerScript: '/gif.worker.js',
            });

            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = exportSize;
            frameCanvas.height = exportSize;
            const frameCtx = frameCanvas.getContext('2d');

            const patchCanvas = document.createElement('canvas');
            const patchCtx = patchCanvas.getContext('2d');

            if (!frameCtx || !patchCtx) {
                throw new Error('Failed to initialize canvas for export.');
            }

            const gifLayerCache = new Map<string, HTMLCanvasElement>();
            const gifLayerPrevInfo = new Map<
                string,
                {
                    dims: GifFrame['dims'];
                    disposalType: number;
                    savedData?: ImageData;
                }
            >();

            const animatedLayers = loadedLayers.filter(
                (layer): layer is LoadedGifLayer => layer.type === 'gif'
            );
            const totalFrames =
                animatedLayers.length > 0
                    ? Math.max(
                          ...animatedLayers.map((layer) => layer.frames.length)
                      )
                    : 1;

            for (
                let frameIndex = 0;
                frameIndex < totalFrames;
                frameIndex += 1
            ) {
                frameCtx.clearRect(0, 0, exportSize, exportSize);

                for (const layer of loadedLayers) {
                    if (layer.type === 'image') {
                        frameCtx.drawImage(
                            layer.image,
                            0,
                            0,
                            exportSize,
                            exportSize
                        );
                        continue;
                    }

                    const localFrameIndex = frameIndex % layer.frames.length;
                    const gifFrame = layer.frames[localFrameIndex];
                    if (!gifFrame) continue;

                    patchCanvas.width = gifFrame.dims.width;
                    patchCanvas.height = gifFrame.dims.height;

                    const imageData = patchCtx.createImageData(
                        gifFrame.dims.width,
                        gifFrame.dims.height
                    );
                    imageData.data.set(gifFrame.patch);
                    patchCtx.putImageData(imageData, 0, 0);

                    let layerCanvas = gifLayerCache.get(layer.url);
                    if (!layerCanvas) {
                        layerCanvas = document.createElement('canvas');
                        layerCanvas.width = layer.origWidth;
                        layerCanvas.height = layer.origHeight;
                        gifLayerCache.set(layer.url, layerCanvas);
                    }

                    const layerCtx = layerCanvas.getContext('2d');
                    if (!layerCtx) continue;

                    // Cuando el GIF llega al frame 0 (primer frame o reinicio del loop),
                    // limpiar el canvas acumulado para que no queden restos del ciclo anterior
                    if (localFrameIndex === 0) {
                        layerCtx.clearRect(
                            0,
                            0,
                            layerCanvas.width,
                            layerCanvas.height
                        );
                        gifLayerPrevInfo.delete(layer.url);
                    }

                    const prevInfo = gifLayerPrevInfo.get(layer.url);
                    if (prevInfo) {
                        if (prevInfo.disposalType === 2) {
                            // Restore to background: borrar el área que ocupó el frame anterior
                            layerCtx.clearRect(
                                prevInfo.dims.left,
                                prevInfo.dims.top,
                                prevInfo.dims.width,
                                prevInfo.dims.height
                            );
                        } else if (
                            prevInfo.disposalType === 3 &&
                            prevInfo.savedData
                        ) {
                            // Restore to previous: restaurar el estado guardado
                            layerCtx.putImageData(
                                prevInfo.savedData,
                                prevInfo.dims.left,
                                prevInfo.dims.top
                            );
                        }
                        // disposalType 0 o 1: no dispose / leave in place → no action needed
                    }

                    // Para disposal type 3: guardar el área actual antes de pintar
                    const frameDisposalType = gifFrame.disposalType ?? 1;
                    let savedData: ImageData | undefined;
                    if (frameDisposalType === 3) {
                        savedData = layerCtx.getImageData(
                            gifFrame.dims.left,
                            gifFrame.dims.top,
                            gifFrame.dims.width,
                            gifFrame.dims.height
                        );
                    }

                    // Pintar el patch en sus coordenadas originales (sin escalar)
                    layerCtx.drawImage(
                        patchCanvas,
                        gifFrame.dims.left,
                        gifFrame.dims.top
                    );

                    gifLayerPrevInfo.set(layer.url, {
                        dims: gifFrame.dims,
                        disposalType: frameDisposalType,
                        savedData,
                    });

                    frameCtx.drawImage(
                        layerCanvas,
                        0,
                        0,
                        exportSize,
                        exportSize
                    );
                }

                const animatedDelay =
                    animatedLayers[0]?.frames[
                        frameIndex % animatedLayers[0].frames.length
                    ]?.delay;
                gif.addFrame(frameCanvas, {
                    copy: true,
                    delay: animatedDelay || 100,
                });
                setExportProgress(((frameIndex + 1) / totalFrames) * 100);
            }

            await new Promise<void>((resolve, reject) => {
                gif.on('finished', (blob: Blob) => {
                    const url = URL.createObjectURL(blob);
                    if (isIOS) {
                        // iOS Safari no permite anchor.click() con blobs — navegar al blob
                        // directamente abre el GIF en Safari y el usuario lo guarda con Compartir.
                        window.location.href = url;
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                    } else {
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.download = `${nftId}.gif`;
                        anchor.click();
                        URL.revokeObjectURL(url);
                    }
                    resolve();
                });

                gif.on('abort', () => {
                    reject(new Error('GIF export aborted.'));
                });

                gif.render();
            });
        } catch (exportError) {
            console.error(exportError);
            alert('Failed to export GIF. Check console for details.');
        } finally {
            setExportingGif(false);
            setExportProgress(0);
        }
    };

    // Imagen fija: el primer frame de cada capa, apiladas en el mismo orden que
    // el preview. Se toma el frame 0 del GIF decodificado y no el <img>, porque
    // qué frame dibuja un GIF en un canvas depende del navegador.
    const handleExportJpg = async () => {
        if (!allAssetsSelected) {
            alert(
                'You must select an option in each category before exporting.'
            );
            return;
        }

        if (displayedLayers.length === 0) {
            alert('There are no layers to export.');
            return;
        }

        setExportingJpg(true);
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

        try {
            const exportSize = isIOS ? 1200 : GIF_EXPORT_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = exportSize;
            canvas.height = exportSize;
            const ctx = canvas.getContext('2d');
            if (!ctx)
                throw new Error('Failed to initialize canvas for export.');

            // JPEG no tiene transparencia: sin esto, lo que no cubra el
            // background sale negro de todas formas, pero de forma explicita.
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, exportSize, exportSize);

            const capas = await Promise.all(
                displayedLayers.map(async (url): Promise<CanvasImageSource> => {
                    if (url.endsWith('.gif')) {
                        const response = await fetch(url);
                        if (!response.ok)
                            throw new Error(`Failed to load GIF layer: ${url}`);
                        const frames = decompressFrames(
                            parseGIF(await response.arrayBuffer()),
                            true
                        ) as unknown as GifFrame[];
                        const primero = frames[0];
                        const layerCanvas = document.createElement('canvas');
                        layerCanvas.width = Math.max(
                            ...frames.map((f) => f.dims.left + f.dims.width)
                        );
                        layerCanvas.height = Math.max(
                            ...frames.map((f) => f.dims.top + f.dims.height)
                        );
                        const layerCtx = layerCanvas.getContext('2d');
                        if (primero && layerCtx) {
                            const imageData = layerCtx.createImageData(
                                primero.dims.width,
                                primero.dims.height
                            );
                            imageData.data.set(primero.patch);
                            layerCtx.putImageData(
                                imageData,
                                primero.dims.left,
                                primero.dims.top
                            );
                        }
                        return layerCanvas;
                    }
                    return new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => resolve(img);
                        img.onerror = () =>
                            reject(new Error(`Failed to load image: ${url}`));
                        img.src = url;
                    });
                })
            );

            for (const capa of capas) {
                ctx.drawImage(capa, 0, 0, exportSize, exportSize);
            }

            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/jpeg', 0.92)
            );
            if (!blob) throw new Error('Failed to encode JPEG.');

            const url = URL.createObjectURL(blob);
            if (isIOS) {
                // Mismo motivo que en el GIF: iOS Safari no descarga blobs con
                // anchor.click(), asi que se abre y se guarda con Compartir.
                window.location.href = url;
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            } else {
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `${nftId}.jpg`;
                anchor.click();
                URL.revokeObjectURL(url);
            }
        } catch (exportError) {
            console.error(exportError);
            alert('Failed to export JPG. Check console for details.');
        } finally {
            setExportingJpg(false);
        }
    };

    if (!tokenIdFromUrl) {
        return (
            <div className="flex flex-1 items-center justify-center py-10 text-center">
                <div className="bg-darkblue rounded-2xl p-6 sm:p-8 max-w-md mx-auto flex flex-col items-center gap-3 shadow-lg shadow-darkblue/50">
                    <div className="font-accent uppercase text-yellow text-xl sm:text-2xl">
                        Token ID not specified
                    </div>
                    <div className="text-lightblue/80">
                        You need to select an NFT first
                    </div>
                    <button
                        onClick={handleBackToSelection}
                        className="mt-2 bg-yellow text-darkblue font-accent uppercase rounded-md px-4 pt-1 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300"
                    >
                        Back to Selection
                    </button>
                </div>
            </div>
        );
    }

    const botonClaro =
        'bg-lightblue text-darkblue font-accent uppercase rounded-md px-3 pb-1 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue disabled:active:scale-100';

    const seccionesDeTraits = customizationOptions
        ? [
              ...LAYER_ORDER,
              ...Object.keys(customizationOptions).filter(
                  (t) => !LAYER_ORDER.includes(t)
              ),
          ]
              .filter(
                  (traitType, index, arr) => arr.indexOf(traitType) === index
              )
              .filter((traitType) => Boolean(customizationOptions[traitType]))
        : [];

    // Primero lo que el Primal ya puede usar y al final lo que se desbloquea.
    const variantesActivas = (() => {
        const todas = (
            (activeTraitSection &&
                customizationOptions?.[activeTraitSection]?.variants) ||
            []
        ).filter((v) => visible(activeTraitSection!, v));
        const bloqueada = (v: TraitVariant) =>
            precioDe(activeTraitSection!, v) !== null;
        return [
            ...todas.filter((v) => !bloqueada(v)),
            ...todas.filter(bloqueada),
        ];
    })();

    // Lo que vive en _GLOBAL es universal: lo puede usar cualquier Primal. Lo
    // de la carpeta de un trait, solo los Primals con ese trait. En los dos
    // casos vale para toda la wallet.
    const alcance = (() => {
        if (!aDesbloquear) return { quien: '', texto: '' };
        const nombre = (t: string) =>
            t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        const categoria = nombre(aDesbloquear.trait);
        const carpeta = (aDesbloquear.variant.imageUrl ?? '').match(
            /\/assets\/traits\/[^/]+\/([^/]+)\//
        )?.[1];
        if (!carpeta || carpeta === '_GLOBAL')
            return {
                quien: `${categoria} for all your Primals`,
                texto: 'Once unlocked, every Primal in your wallet can wear it, whatever traits it has.',
            };
        const familia = `${nombre(carpeta)} ${categoria.toLowerCase()}`;
        return {
            quien: `${categoria} for your Primals with ${familia}`,
            texto: `Once unlocked, every Primal in your wallet with ${familia} can wear it.`,
        };
    })();

    const firmaPendiente =
        walletSession.isConnected && walletSession.status === 'needs-signature';
    const aviso = !walletSession.isConnected
        ? 'Connect your wallet to unlock it.'
        : firmaPendiente
          ? 'Verify your wallet first. You will sign a message, it does not authorize any transaction.'
          : walletSession.status !== 'ready' || !tienda
            ? 'Checking your wallet...'
            : ownership !== 'owner'
              ? 'Unlock it from one of your own Primals.'
              : null;
    const alcanza =
        tienda !== null &&
        aDesbloquear !== null &&
        tienda.balance >= aDesbloquear.precio;

    const capasDelPreview = capasPreview
        .filter(({ url }) => !failedLayers.includes(url))
        .map(({ trait, url }) => {
            // Se muestra la version de 1000 px: el GIF
            // original es de 2000 y decodificar 7 capas
            // asi trababa la pagina. Las exportaciones
            // siguen usando el original. La key es la
            // categoria: al cambiar de opcion el
            // navegador deja la capa vieja hasta que
            // carga la nueva, sin parpadeo.
            const miniatura =
                url.includes('/assets/traits/') && !sinMiniatura.includes(url);
            return (
                <img
                    key={trait}
                    src={
                        miniatura
                            ? miniaturaDeTrait(url, {
                                  tamano: 'preview',
                              })
                            : url
                    }
                    alt=""
                    width={1000}
                    height={1000}
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{
                        imageRendering: 'pixelated',
                    }}
                    onError={() =>
                        miniatura
                            ? setSinMiniatura((prev) => [...prev, url])
                            : setFailedLayers((prev) =>
                                  prev.includes(url) ? prev : [...prev, url]
                              )
                    }
                />
            );
        });

    return (
        <div className="w-full text-white flex flex-col gap-5 sm:gap-8">
            {/* Sin animaciones de entrada: es una herramienta, y el contenido
                ya espera a que carguen los datos del NFT. Sumarle una
                animacion lo hacia sentir lento. */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                        Customizing: Primal #{nftId}
                    </h1>
                    <p className="text-lightblue text-base sm:text-lg md:text-xl mt-3 sm:mt-4 max-w-5xl">
                        Try different combinations and customize at your liking.
                        Once you finish, validate ownership to update on-chain.
                    </p>
                </div>
                <button
                    onClick={() => goTo(`/cultomizer/recent?from=${nftId}`)}
                    className="self-start shrink-0 bg-yellow text-darkblue font-accent uppercase rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 sm:mt-3"
                >
                    Recent customizations
                </button>
            </div>

            <div className="bg-darkblue rounded-2xl px-4 py-4 sm:px-5 shadow-lg shadow-darkblue/50">
                <div className="flex flex-col min-[420px]:flex-row gap-3 sm:gap-4 min-[420px]:items-center">
                    <input
                        type="text"
                        value={inputNftId}
                        onChange={(e) => setInputNftId(e.target.value)}
                        onKeyPress={handleInputKeyPress}
                        placeholder="NFT ID"
                        className="flex-1 min-w-0 bg-lightblue text-darkblue placeholder-darkblue/60 font-accent leading-tight rounded-md px-3 pt-1 pb-1.5 focus:outline-none transition-all duration-300"
                    />
                    <button
                        onClick={handleLoadNft}
                        className={`shrink-0 ${botonClaro}`}
                    >
                        Search other NFT
                    </button>
                </div>
            </div>

            {loading && (
                <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow mx-auto mb-4"></div>
                    <div className="text-lightblue text-xl">NFT Loading...</div>
                </div>
            )}

            {error && (
                <div className="text-center py-16">
                    <div className="bg-darkblue rounded-2xl p-6 max-w-md mx-auto">
                        <div className="font-accent uppercase text-red text-lg mb-2">
                            Error
                        </div>
                        <div className="text-lightblue">{error}</div>
                    </div>
                </div>
            )}

            {!loading && !error && customizationOptions && (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 sm:gap-8 items-start lg:items-stretch">
                    <div className="contents lg:flex lg:flex-col lg:gap-4 lg:bg-darkblue lg:rounded-2xl lg:p-5 lg:shadow-lg lg:shadow-darkblue/50">
                        <div className="order-1 shadow-lg shadow-darkblue/50 lg:shadow-none bg-darkblue rounded-2xl p-3 sm:p-5 lg:p-0 lg:mx-auto lg:w-full lg:max-w-[max(18rem,calc(100svh-22rem))] flex flex-col gap-3 sm:gap-4">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="font-accent uppercase text-yellow text-2xl">
                                    Preview
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        disabled={!hayCambios}
                                        title="Back to your Primal"
                                        aria-label="Undo all changes"
                                        className="grid place-items-center w-9 h-9 rounded-md bg-lightblue text-darkblue cursor-pointer hover:bg-yellow hover:-rotate-12 active:scale-90 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue disabled:hover:rotate-0 disabled:active:scale-100"
                                    >
                                        <FiRotateCcw
                                            className="size-5"
                                            strokeWidth={2.5}
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRandomize}
                                        disabled={!customizationOptions}
                                        title="Randomize"
                                        aria-label="Randomize all traits"
                                        className="flex items-center justify-center w-9 h-9 rounded-md btn-rainbow text-darkblue cursor-pointer hover:rotate-12 active:scale-90 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            className="w-6 h-6"
                                            aria-hidden="true"
                                        >
                                            <rect
                                                x="3"
                                                y="3"
                                                width="18"
                                                height="18"
                                                rx="4"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            />
                                            <circle
                                                cx="8"
                                                cy="8"
                                                r="1.6"
                                                fill="currentColor"
                                            />
                                            <circle
                                                cx="16"
                                                cy="8"
                                                r="1.6"
                                                fill="currentColor"
                                            />
                                            <circle
                                                cx="12"
                                                cy="12"
                                                r="1.6"
                                                fill="currentColor"
                                            />
                                            <circle
                                                cx="8"
                                                cy="16"
                                                r="1.6"
                                                fill="currentColor"
                                            />
                                            <circle
                                                cx="16"
                                                cy="16"
                                                r="1.6"
                                                fill="currentColor"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div
                                ref={nftDisplayRef}
                                className="relative w-full aspect-square overflow-hidden rounded-lg"
                            >
                                {capasDelPreview}
                            </div>
                        </div>

                        <div className="order-3 shadow-lg shadow-darkblue/50 lg:shadow-none bg-darkblue rounded-2xl p-4 sm:p-5 lg:p-0 lg:mx-auto lg:w-full lg:max-w-[max(18rem,calc(100svh-22rem))] flex flex-col gap-4">
                            {/* Dos exportaciones con un "OR" en el medio. Mientras una corre, las dos quedan
                                bloqueadas: comparten la RAM del canvas. */}
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    onClick={handleExportGif}
                                    disabled={
                                        !allAssetsSelected ||
                                        exportingGif ||
                                        exportingJpg
                                    }
                                    className={`flex-1 text-sm ${botonClaro}`}
                                >
                                    {exportingGif
                                        ? `Exporting ${Math.round(exportProgress)}%`
                                        : 'Export GIF'}
                                </button>
                                <span className="font-accent uppercase text-sm text-yellow">
                                    or
                                </span>
                                <button
                                    onClick={handleExportJpg}
                                    disabled={
                                        !allAssetsSelected ||
                                        exportingGif ||
                                        exportingJpg
                                    }
                                    className={`flex-1 text-sm ${botonClaro}`}
                                >
                                    {exportingJpg
                                        ? 'Exporting...'
                                        : 'Export JPG'}
                                </button>
                            </div>
                            {!allAssetsSelected && (
                                <p className="-mt-2 text-center text-lightblue/60 text-xs">
                                    Complete all traits to export.
                                </p>
                            )}

                            <div className="text-sm text-center">
                                {!walletSession.isConnected && (
                                    <p className="text-lightblue/60 text-xs">
                                        Connect your wallet to save changes to
                                        this NFT.
                                    </p>
                                )}

                                {walletSession.isConnected &&
                                    walletSession.status ===
                                        'needs-signature' && (
                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={walletSession.signIn}
                                                className={`w-full text-sm ${botonClaro}`}
                                            >
                                                Verify wallet
                                            </button>
                                            <p className="text-lightblue/60 text-[10px]">
                                                You will sign a message. It does
                                                not authorize any transaction.
                                            </p>
                                        </div>
                                    )}

                                {(walletSession.status === 'checking' ||
                                    walletSession.status === 'signing') && (
                                    <p className="text-lightblue">
                                        {walletSession.status === 'signing'
                                            ? 'Waiting for signature...'
                                            : 'Verifying session...'}
                                    </p>
                                )}

                                {walletSession.status === 'ready' && (
                                    <div className="flex flex-col gap-1">
                                        {ownership === 'checking' && (
                                            <p className="text-lightblue">
                                                Checking ownership...
                                            </p>
                                        )}
                                        {ownership === 'owner' && (
                                            <>
                                                <p className="font-accent uppercase text-yellow">
                                                    You own this NFT
                                                </p>
                                                <button
                                                    onClick={handleSaveToNft}
                                                    disabled={
                                                        !allAssetsSelected ||
                                                        saving
                                                    }
                                                    className="mt-2 w-full text-sm bg-yellow text-darkblue font-accent uppercase rounded-md px-3 pt-1 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-yellow"
                                                >
                                                    {saving
                                                        ? 'Saving...'
                                                        : allAssetsSelected
                                                          ? 'Update art on chain'
                                                          : 'Complete traits'}
                                                </button>
                                                {saving && (
                                                    <p className="text-lightblue/60 text-xs">
                                                        Building the image. This
                                                        takes a few seconds,
                                                        don&apos;t close the
                                                        page.
                                                    </p>
                                                )}
                                                {saveResult && !saving && (
                                                    <p
                                                        className={`text-xs ${saveResult.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}
                                                    >
                                                        {saveResult.text}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                        {ownership === 'not-owner' && (
                                            <>
                                                <p className="font-accent uppercase text-lightblue">
                                                    You don&apos;t own this NFT
                                                </p>
                                                {owner && (
                                                    <p className="text-lightblue/50 text-xs font-mono">
                                                        Owner:{' '}
                                                        {nombreWallet(
                                                            owner,
                                                            apodos
                                                        )}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                        {ownership === 'not-found' && (
                                            <p className="text-lightblue/60">
                                                This NFT does not exist.
                                            </p>
                                        )}
                                        {ownership === 'unavailable' && (
                                            <p className="text-lightblue/60">
                                                Could not verify ownership right
                                                now.
                                            </p>
                                        )}
                                        <p className="text-lightblue/40 text-xs font-mono">
                                            {nombreWallet(
                                                walletSession.address,
                                                apodos
                                            )}
                                        </p>
                                    </div>
                                )}

                                {walletSession.error && (
                                    <p className="mt-2 text-red-400 text-xs">
                                        {walletSession.error}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="order-2 lg:relative">
                        <div className="@container lg:absolute lg:inset-0 bg-darkblue rounded-2xl p-4 sm:p-5 flex flex-col gap-4 sm:gap-5 shadow-lg shadow-darkblue/50">
                            <h3 className="font-accent uppercase text-yellow text-2xl">
                                Choose a trait
                            </h3>

                            <div className="grid grid-cols-4 @2xl:grid-cols-none @2xl:grid-flow-col @2xl:auto-cols-fr gap-2">
                                {seccionesDeTraits.map((traitType) => {
                                    const valor = selectedVariants[traitType];
                                    const cambiado =
                                        original[traitType] !== undefined &&
                                        valor !== original[traitType];
                                    return (
                                        <button
                                            key={traitType}
                                            title={
                                                cambiado ? 'Changed' : undefined
                                            }
                                            className={`relative min-w-0 font-accent uppercase text-sm text-darkblue rounded-md px-2 pb-1.5 cursor-pointer active:scale-97 transition-all duration-300 ${
                                                activeTraitSection === traitType
                                                    ? 'bg-yellow'
                                                    : 'bg-lightblue hover:bg-yellow'
                                            }`}
                                            onClick={() => {
                                                setActiveTraitSection(
                                                    traitType
                                                );
                                                setProbando(null);
                                            }}
                                        >
                                            <span className="block whitespace-nowrap truncate">
                                                {traitType}
                                            </span>
                                            {cambiado && (
                                                <span
                                                    aria-hidden="true"
                                                    className="absolute -top-1 -right-1 size-3 rounded-full bg-yellow ring-2 ring-darkblue"
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {activeTraitSection &&
                                variantesActivas.length > 0 && (
                                    <Opciones
                                        key={activeTraitSection}
                                        cubrir={
                                            activeTraitSection.toUpperCase() ===
                                            'BACKGROUND'
                                        }
                                        variantes={variantesActivas}
                                        elegido={
                                            selectedVariants[activeTraitSection]
                                        }
                                        alElegir={(variant) =>
                                            handleVariantChange(
                                                activeTraitSection,
                                                variant
                                            )
                                        }
                                        alProbar={(valor) =>
                                            setProbando(
                                                valor === null
                                                    ? null
                                                    : {
                                                          trait: activeTraitSection,
                                                          valor,
                                                      }
                                            )
                                        }
                                        dropDe={(variant) =>
                                            dropBloqueado(
                                                activeTraitSection,
                                                variant
                                            )
                                        }
                                        alDesbloquear={(variant, precio) =>
                                            setADesbloquear({
                                                trait: activeTraitSection,
                                                variant,
                                                precio,
                                            })
                                        }
                                    />
                                )}
                        </div>
                    </div>
                </div>
            )}

            {desbloqueado && (
                <StakeCompartir
                    tokenIds={[]}
                    dias={0}
                    zona={null}
                    primera={false}
                    otro={{
                        titulo: 'Trait unlocked!',
                        imagen: desbloqueado.imageUrl
                            ? miniaturaDeTrait(
                                  `${BACKEND_BASE_URL}${desbloqueado.imageUrl}`,
                                  { tamano: 'grilla' }
                              )
                            : '',
                        mensaje: (
                            <>
                                <span className="text-yellow">
                                    {desbloqueado.name}
                                </span>{' '}
                                is yours now. It&apos;s already on your Primal:
                                save it with Update art on chain.
                            </>
                        ),
                        tweet: `I just unlocked ${desbloqueado.name} for my Primal on Primal Cult 🔥 Customize yours: ${window.location.origin}/cultomizer\n\n#CultNeverDies #PrimalCult`,
                    }}
                    onCerrar={() => setDesbloqueado(null)}
                />
            )}

            {aDesbloquear && (
                <Confirmacion
                    titulo="Unlock trait"
                    textoConfirmar={
                        firmaPendiente
                            ? 'Verify wallet'
                            : desbloqueando
                              ? 'Unlocking...'
                              : `Unlock for ${aDesbloquear.precio.toLocaleString('en-US')} FOG`
                    }
                    deshabilitado={
                        desbloqueando ||
                        (!firmaPendiente && (aviso !== null || !alcanza))
                    }
                    onConfirmar={
                        firmaPendiente
                            ? walletSession.signIn
                            : handleDesbloquear
                    }
                    onCancelar={() => {
                        setADesbloquear(null);
                        setErrorDesbloqueo(null);
                    }}
                >
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            {aDesbloquear.variant.imageUrl && (
                                <img
                                    src={miniaturaDeTrait(
                                        `${BACKEND_BASE_URL}${aDesbloquear.variant.imageUrl}`,
                                        { tamano: 'grilla' }
                                    )}
                                    alt=""
                                    className="size-20 shrink-0 rounded-xl bg-white/10 object-contain"
                                />
                            )}
                            <div className="flex flex-col gap-1.5 min-w-0">
                                <span className="font-accent uppercase text-yellow text-xl leading-none pb-1 break-all">
                                    {aDesbloquear.variant.name}
                                </span>
                                <span>{alcance.quien}</span>
                            </div>
                        </div>
                        <p>{alcance.texto}</p>
                        {aDesbloquear.variant.drop && (
                            <p className="font-accent uppercase text-yellow leading-none pb-0.5">
                                {[
                                    aDesbloquear.variant.drop.endsAt &&
                                        `Ends in ${restante(aDesbloquear.variant.drop.endsAt, Date.now())}`,
                                    aDesbloquear.variant.drop.left !== null &&
                                        `${aDesbloquear.variant.drop.left} left`,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                        )}
                        {aviso ? (
                            <p className="text-lightblue/80">{aviso}</p>
                        ) : (
                            tienda && (
                                <dl className="flex flex-col m-0">
                                    {[
                                        ['Price', aDesbloquear.precio],
                                        ['Your FOG', tienda.balance],
                                        ...(alcanza
                                            ? [
                                                  [
                                                      'After unlocking',
                                                      tienda.balance -
                                                          aDesbloquear.precio,
                                                  ],
                                              ]
                                            : []),
                                    ].map(([nombre, valor]) => (
                                        <div
                                            key={nombre}
                                            className="flex justify-between gap-3 py-2 border-b border-lightblue/12 last:border-b-0"
                                        >
                                            <dt>{nombre}</dt>
                                            <dd className="m-0 inline-flex items-center gap-1.5 text-white tabular-nums">
                                                <img
                                                    src={ICONO_FOG_CHICO}
                                                    alt=""
                                                    className="size-4"
                                                />
                                                {Number(valor).toLocaleString(
                                                    'en-US'
                                                )}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )
                        )}
                        {tienda && !aviso && !alcanza && (
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                You need{' '}
                                {(
                                    aDesbloquear.precio - tienda.balance
                                ).toLocaleString('en-US')}{' '}
                                more FOG.
                                <a
                                    href="/shop"
                                    className="bg-yellow text-darkblue font-accent uppercase text-sm rounded-md px-3 pb-1 hover:scale-102 active:scale-97 transition-all duration-300"
                                >
                                    Buy FOG
                                </a>
                            </p>
                        )}
                        {errorDesbloqueo && (
                            <p className="text-red-300 text-sm">
                                {errorDesbloqueo}
                            </p>
                        )}
                    </div>
                </Confirmacion>
            )}
        </div>
    );
}

// Cuanto falta para una fecha, corto: "3d 4h", "5h 12m", "12m".
function restante(iso: string, ahora: number) {
    const minutos = Math.max(1, Math.floor((Date.parse(iso) - ahora) / 60000));
    const horas = Math.floor(minutos / 60);
    const dias = Math.floor(horas / 24);
    if (dias > 0) return `${dias}d ${horas % 24}h`;
    if (horas > 0) return `${horas}h ${minutos % 60}m`;
    return `${minutos}m`;
}

// Las opciones de la categoria en la grilla de 4x3 (ver PaginasGrilla). En la
// compu la isla mide lo mismo que la del preview. Arranca en la pagina de la
// elegida.
// El espacio entre la imagen y la etiqueta, mas el alto fijo de la etiqueta.
const ALTO_ETIQUETA = 8 + 26;

function Opciones({
    variantes,
    elegido,
    alElegir,
    alProbar,
    dropDe,
    alDesbloquear,
    cubrir,
}: {
    variantes: TraitVariant[];
    elegido: string | undefined;
    alElegir: (variant: TraitVariant) => void;
    alProbar: (valor: string | null) => void;
    dropDe: (variant: TraitVariant) => Drop | null;
    alDesbloquear: (variant: TraitVariant, precio: number) => void;
    cubrir: boolean;
}) {
    const valorDe = (v: TraitVariant) => v.imageUrl || NONE_SELECTION;
    const [ahora, setAhora] = useState(Date.now);
    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);
    return (
        <PaginasGrilla
            items={variantes}
            clave={valorDe}
            altoExtra={ALTO_ETIQUETA}
            ajustarAlAlto
            inicial={Math.max(
                0,
                variantes.findIndex((v) => valorDe(v) === elegido)
            )}
            alSalir={() => alProbar(null)}
            render={(variant, lado) => {
                const valor = valorDe(variant);
                const drop = dropDe(variant);
                const precio = drop?.price ?? null;
                return (
                    <button
                        type="button"
                        className="group w-full min-w-0 flex flex-col items-center gap-2 cursor-pointer outline-none"
                        onClick={() =>
                            precio === null
                                ? alElegir(variant)
                                : alDesbloquear(variant, precio)
                        }
                        onPointerEnter={(e) => {
                            if (e.pointerType === 'mouse') alProbar(valor);
                        }}
                    >
                        <div
                            style={{ height: lado }}
                            className={`relative w-full rounded-xl overflow-hidden transition-all duration-300 ${
                                drop ? 'btn-rainbow p-[2px]' : 'bg-white/10'
                            } ${
                                elegido === valor
                                    ? 'ring-2 ring-yellow'
                                    : 'group-hover:ring-2 group-hover:ring-lightblue group-focus-visible:ring-2 group-focus-visible:ring-lightblue'
                            }`}
                        >
                            <div
                                className={`w-full h-full overflow-hidden ${drop ? 'rounded-[10px] bg-darkblue' : ''}`}
                            >
                                {variant.imageUrl ? (
                                    // La de grilla: 500 px sin perdida, recortada a lo
                                    // que ocupa el trait. Si el backend todavia no la
                                    // tiene, la grande.
                                    <img
                                        src={miniaturaDeTrait(
                                            variant.imageUrl.startsWith('http')
                                                ? variant.imageUrl
                                                : `${BACKEND_BASE_URL}${variant.imageUrl}`,
                                            { tamano: 'grilla' }
                                        )}
                                        onError={(e) => {
                                            const img = e.currentTarget;
                                            if (img.src.includes('t=grilla'))
                                                img.src = img.src.replace(
                                                    't=grilla',
                                                    't=grande'
                                                );
                                        }}
                                        alt={variant.name}
                                        width={THUMBNAIL_SIZE}
                                        height={THUMBNAIL_SIZE}
                                        className={`w-full h-full ${cubrir ? 'object-cover' : 'object-contain'}`}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-lightblue/70">
                                        {variant.name}
                                    </div>
                                )}
                            </div>
                            {drop && (
                                <>
                                    <span className="absolute top-1.5 left-1.5 rounded-md bg-yellow text-darkblue font-accent uppercase text-[10px] sm:text-xs leading-none px-1.5 pt-1 pb-1.5">
                                        Drop
                                    </span>
                                    <span className="absolute top-1.5 right-1.5 grid place-items-center size-7 rounded-md bg-darkblue/80 text-yellow">
                                        <FiLock
                                            className="size-4"
                                            strokeWidth={2.5}
                                        />
                                    </span>
                                    {(drop.endsAt || drop.left !== null) && (
                                        <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-md bg-darkblue/80 text-lightblue text-[10px] sm:text-xs leading-none px-1.5 py-1 text-center">
                                            {[
                                                drop.endsAt &&
                                                    restante(
                                                        drop.endsAt,
                                                        ahora
                                                    ),
                                                drop.left !== null &&
                                                    `${drop.left} left`,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="h-[26px] max-w-full flex items-center justify-center">
                            {precio === null ? (
                                <p className="max-w-full truncate whitespace-nowrap pb-0.5 font-accent uppercase text-yellow text-xs sm:text-sm leading-none text-center">
                                    {variant.name}
                                </p>
                            ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-yellow text-darkblue font-accent uppercase text-xs sm:text-sm leading-none px-1.5 sm:px-2 pt-1 pb-1.5 whitespace-nowrap group-hover:scale-105 transition-all duration-300">
                                    <span className="hidden sm:inline">
                                        Unlock
                                    </span>
                                    <img
                                        src={ICONO_FOG_CHICO}
                                        alt=""
                                        className="size-4 relative top-[0.12em]"
                                    />
                                    {precio.toLocaleString('en-US')}
                                </span>
                            )}
                        </div>
                    </button>
                );
            }}
        />
    );
}

export default CustomizerContent;
