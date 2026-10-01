// Pantalla del Cultomizer (isla de React).
import React, { useState, useEffect, useMemo, useRef } from 'react';
import GIF from 'gif.js/dist/gif.js';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { goTo, replaceWith, useSearchParams } from '@/lib/navigation';
import { miniaturaDeTrait } from '@/lib/miniaturas';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import {
    useWalletSession,
    useNftOwnership,
} from '@/hooks/cultomizer/useWalletSession';

// --- Interfaces para Tipado ---
interface TraitVariant {
    name: string;
    imageUrl: string | null;
    isNone?: boolean;
}

interface CustomizationOption {
    currentValue: string;
    variants: TraitVariant[];
}

interface CustomizationOptions {
    [traitType: string]: CustomizationOption;
}

// --- Constantes ---
const THUMBNAIL_SIZE = 80;
const GIF_EXPORT_SIZE = 2000;
const LAYER_ORDER = [
    'Background',
    'Fur',
    'Tunic',
    'Face',
    'Eyes',
    'Hat',
    'Effect',
];
const NONE_SELECTION = '__NONE__';
// Variantes por pagina en "Choose a trait": dos filas de seis.
const TRAITS_PER_PAGE = 12;

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

// --- Componente de Contenido ---
function CustomizerContent() {
    const searchParams = useSearchParams();

    // Lee el ID de la URL
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
    // Pagina de la grilla de variantes. Pintar las decenas de miniaturas de un
    // trait de una sola vez era lo que trababa la pantalla.
    const [traitPage, setTraitPage] = useState(0);
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
    const { state: ownership, owner } = useNftOwnership(
        nftId || null,
        walletSession.token
    );

    const [saving, setSaving] = useState<boolean>(false);
    const [saveResult, setSaveResult] = useState<{
        kind: 'ok' | 'error';
        text: string;
    } | null>(null);

    const BACKEND_URL =
        import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
    const BACKEND_BASE_URL =
        import.meta.env.PUBLIC_BACKEND_BASE_URL ||
        BACKEND_URL.replace(/\/api\/?$/, '');

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

    // Cargar datos del NFT automáticamente
    useEffect(() => {
        if (!nftId) return;
        const loadNftData = async () => {
            setLoading(true);
            setError(null);
            setCustomizationOptions(null);
            setSelectedVariants({});
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
                //
                // Sin esto, al abrir el customizer se veia lo que hubiera en el
                // localStorage de esa maquina, o los traits originales de la
                // metadata. Por eso un NFT ya customizado se veia distinto en la
                // compu y en el celular, y ninguno de los dos mostraba lo que
                // realmente tiene aplicado.
                let appliedOnChain: { [key: string]: string } | null = null;
                try {
                    const savedResponse = await fetch(
                        `${BACKEND_URL}/nft/${nftId}/customization`
                    );
                    if (savedResponse.ok) {
                        const savedData = await savedResponse.json();
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

                if (appliedOnChain) {
                    const applied = { ...initialSelections, ...appliedOnChain };
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

                // Restaurar selecciones guardadas (si el usuario vuelve después de navegar)
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
                            // Si la selección murió, queda el default de la metadata.
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

    const displayedLayers = useMemo(() => {
        return LAYER_ORDER.map((traitType) => selectedVariants[traitType])
            .filter(
                (layerUrl) => Boolean(layerUrl) && layerUrl !== NONE_SELECTION
            )
            .map((layerUrl) => {
                if (!layerUrl) return null;
                if (
                    layerUrl.startsWith('http://') ||
                    layerUrl.startsWith('https://')
                )
                    return layerUrl;
                return `${BACKEND_BASE_URL}${layerUrl}`;
            })
            .filter(Boolean) as string[];
    }, [selectedVariants, BACKEND_BASE_URL]);

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
            // Persistir cambios para sobrevivir navegación
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
    const handleRandomize = () => {
        if (!customizationOptions) return;
        const random: { [traitType: string]: string } = {};
        for (const [traitType, option] of Object.entries(
            customizationOptions
        )) {
            const elegibles = option.variants.filter(
                (v) => !v.isNone && v.imageUrl
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
            // Tracks the previous frame's disposal info for each GIF layer
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

                    // Aplicar el disposal del frame anterior antes de pintar el actual
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

                    // Guardar info de este frame para el disposal del siguiente
                    gifLayerPrevInfo.set(layer.url, {
                        dims: gifFrame.dims,
                        disposalType: frameDisposalType,
                        savedData,
                    });

                    // Escalar el canvas acumulado al tamaño de exportación
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

    // Si no hay tokenId, mostrar mensaje de error
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

    // Botones claros del sitio: mismos que el "Connect wallet" del header.
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

    const variantesActivas =
        (activeTraitSection &&
            customizationOptions?.[activeTraitSection]?.variants) ||
        [];
    const totalPaginas = Math.max(
        1,
        Math.ceil(variantesActivas.length / TRAITS_PER_PAGE)
    );
    const paginaActual = Math.min(traitPage, totalPaginas - 1);
    const variantesDePagina = variantesActivas.slice(
        paginaActual * TRAITS_PER_PAGE,
        (paginaActual + 1) * TRAITS_PER_PAGE
    );

    return (
        <div className="w-full text-white flex flex-col gap-5 sm:gap-8">
            {/* Header */}
            {/* Sin animaciones de entrada: es una herramienta, y el contenido
                ya espera a que carguen los datos del NFT. Sumarle una
                animacion lo hacia sentir lento. */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-4"
            >
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

            {/* Input para cambiar NFT */}
            <div className="bg-darkblue rounded-2xl px-4 py-4 sm:px-5 shadow-lg shadow-darkblue/50">
                <div className="flex flex-col min-[420px]:flex-row gap-3 sm:gap-4 min-[420px]:items-center">
                    <input
                        type="text"
                        value={inputNftId}
                        onChange={(e) => setInputNftId(e.target.value)}
                        onKeyPress={handleInputKeyPress}
                        placeholder="NFT ID"
                        className="flex-1 min-w-0 bg-lightblue text-darkblue placeholder-darkblue/60 font-accent leading-tight rounded-md px-3 pt-1 pb-1.5 focus:outline-none transition-all duration-200"
                    />
                    <button
                        onClick={handleLoadNft}
                        className={`shrink-0 ${botonClaro}`}
                    >
                        Search other NFT
                    </button>
                </div>
            </div>

            {/* Estados de carga y error */}
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

            {/* Contenido del customizer */}
            {!loading && !error && customizationOptions && (
                // items-start, no items-center: la columna de traits es mucho más
                // alta que la del preview, y centrarlas dejaba el preview flotando
                // en el medio con un hueco muerto arriba.
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2.85fr)] gap-5 sm:gap-8 items-start"
                >
                    {/* Columna izquierda - Vista previa del NFT */}
                    <div className="shadow-lg shadow-darkblue/50 bg-darkblue rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
                        <div className="relative flex items-center justify-center">
                            <h3 className="font-accent uppercase text-yellow text-2xl text-center">
                                Preview
                            </h3>
                            <button
                                type="button"
                                onClick={handleRandomize}
                                disabled={!customizationOptions}
                                title="Randomize"
                                aria-label="Randomize all traits"
                                className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-md btn-rainbow text-darkblue cursor-pointer hover:rotate-12 active:scale-90 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <div
                            ref={nftDisplayRef}
                            className="relative mx-auto w-full max-w-100 lg:max-w-125 aspect-square overflow-hidden rounded-lg"
                        >
                            {displayedLayers
                                .filter(
                                    (layerSrc) =>
                                        !failedLayers.includes(layerSrc)
                                )
                                .map((layerSrc) => {
                                    // Se muestra la version de 1000 px: el GIF
                                    // original es de 2000 y decodificar 7 capas
                                    // asi trababa la pagina. Las exportaciones
                                    // siguen usando el original.
                                    const miniatura =
                                        layerSrc.includes('/assets/traits/') &&
                                        !sinMiniatura.includes(layerSrc);
                                    return (
                                    <img
                                        key={layerSrc}
                                        src={
                                            miniatura
                                                ? miniaturaDeTrait(layerSrc, {
                                                      tamano: 'preview',
                                                  })
                                                : layerSrc
                                        }
                                        // Las capas son decorativas y se apilan: un alt por
                                        // capa solo sirve para que el navegador lo dibuje
                                        // encima del preview cuando el archivo no carga.
                                        alt=""
                                        width={1000}
                                        height={1000}
                                        className="absolute inset-0 w-full h-full object-contain"
                                        style={{ imageRendering: 'pixelated' }}
                                        onError={() =>
                                            miniatura
                                                ? setSinMiniatura((prev) => [
                                                      ...prev,
                                                      layerSrc,
                                                  ])
                                                : setFailedLayers((prev) =>
                                                      prev.includes(layerSrc)
                                                          ? prev
                                                          : [...prev, layerSrc]
                                                  )
                                        }
                                    />
                                    );
                                })}
                        </div>
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
                                {exportingJpg ? 'Exporting...' : 'Export JPG'}
                            </button>
                        </div>
                        {!allAssetsSelected && (
                            <p className="-mt-2 text-center text-lightblue/60 text-xs">
                                Complete all traits to export.
                            </p>
                        )}

                        {/* Estado de la wallet y de la propiedad del NFT.
                Hoy solo informa; cuando exista el guardado, el boton
                va a colgar de ownership === 'owner'. El chequeo real
                lo hace el backend en cada escritura: esto es interfaz,
                no seguridad. */}
                        <div className="text-sm text-center">
                            {!walletSession.isConnected && (
                                <p className="text-lightblue/60 text-xs">
                                    Connect your wallet to save changes to this
                                    NFT.
                                </p>
                            )}

                            {walletSession.isConnected &&
                                walletSession.status === 'needs-signature' && (
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={walletSession.signIn}
                                            className={`w-full text-sm ${botonClaro}`}
                                        >
                                            Verify wallet
                                        </button>
                                        <p className="text-lightblue/60 text-[10px]">
                                            You will sign a message. It does not
                                            authorize any transaction.
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
                                                    !allAssetsSelected || saving
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
                                                    don&apos;t close the page.
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
                                                    Owner: {owner.slice(0, 6)}
                                                    ...{owner.slice(-4)}
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
                                        {walletSession.address?.slice(0, 6)}...
                                        {walletSession.address?.slice(-4)}
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

                    {/* Columna derecha - Selector de traits */}
                    <div className="bg-darkblue rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-lg shadow-darkblue/50">
                        <h3 className="font-accent uppercase text-yellow text-2xl">
                            Choose a trait
                        </h3>

                        {/* Selector de categorías */}
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                            {seccionesDeTraits.map((traitType) => (
                                <button
                                    key={traitType}
                                    className={`grow shrink-0 basis-auto min-w-20 whitespace-nowrap font-accent uppercase text-sm sm:text-base text-darkblue rounded-md px-3 pb-1.5 cursor-pointer active:scale-97 transition-all duration-300 ${
                                        activeTraitSection === traitType
                                            ? 'bg-yellow'
                                            : 'bg-lightblue hover:bg-yellow'
                                    }`}
                                    onClick={() => {
                                        setActiveTraitSection(traitType);
                                        setTraitPage(0);
                                    }}
                                >
                                    {traitType}
                                </button>
                            ))}
                        </div>

                        {/* Variantes del trait seleccionado */}
                        {activeTraitSection && variantesActivas.length > 0 && (
                            <>
                                <p className="text-xs uppercase text-lightblue/70">
                                    Selected:{' '}
                                    <span className="font-bold text-lightblue">
                                        {activeTraitSection}
                                    </span>
                                </p>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-5">
                                    {variantesDePagina.map((variant) => {
                                        const elegido =
                                            selectedVariants[
                                                activeTraitSection
                                            ] ===
                                            getVariantSelectionValue(variant);
                                        return (
                                            <button
                                                type="button"
                                                key={`${activeTraitSection}-${getVariantSelectionValue(variant)}`}
                                                className="group flex flex-col items-center gap-2 cursor-pointer outline-none"
                                                onClick={() =>
                                                    handleVariantChange(
                                                        activeTraitSection,
                                                        variant
                                                    )
                                                }
                                            >
                                                <div
                                                    className={`w-full aspect-square rounded-[10px] overflow-hidden bg-white/10 transition-all duration-200 ${
                                                        elegido
                                                            ? 'ring-2 ring-yellow'
                                                            : 'group-hover:ring-2 group-hover:ring-lightblue group-focus-visible:ring-2 group-focus-visible:ring-lightblue'
                                                    }`}
                                                >
                                                    {variant.imageUrl ? (
                                                        // La miniatura de grilla (500 px,
                                                        // el arte en su tamaño real): la
                                                        // chica de 256 se estiraba en
                                                        // pantallas de alta densidad, y la
                                                        // grande de 640 pesaba ~720 KB. Sin
                                                        // "pixelated": al achicar, tomar
                                                        // pixeles sueltos deja los trazos
                                                        // dentados. Si el backend todavia
                                                        // no tiene ese tamaño, la grande.
                                                        <img
                                                            src={miniaturaDeTrait(
                                                                variant.imageUrl.startsWith(
                                                                    'http'
                                                                )
                                                                    ? variant.imageUrl
                                                                    : `${BACKEND_BASE_URL}${variant.imageUrl}`,
                                                                { tamano: 'grilla' }
                                                            )}
                                                            onError={(e) => {
                                                                const img =
                                                                    e.currentTarget;
                                                                if (
                                                                    img.src.includes(
                                                                        't=grilla'
                                                                    )
                                                                )
                                                                    img.src =
                                                                        img.src.replace(
                                                                            't=grilla',
                                                                            't=grande'
                                                                        );
                                                            }}
                                                            alt={variant.name}
                                                            width={
                                                                THUMBNAIL_SIZE
                                                            }
                                                            height={
                                                                THUMBNAIL_SIZE
                                                            }
                                                            loading="lazy"
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xs text-lightblue/70">
                                                            {variant.name}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="font-accent uppercase text-yellow text-xs sm:text-sm leading-none text-center break-all">
                                                    {variant.name}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>

                                {totalPaginas > 1 && (
                                    <div className="flex items-center justify-center sm:justify-start gap-4 sm:gap-3 font-accent uppercase text-sm sm:text-xs text-lightblue">
                                        <button
                                            type="button"
                                            aria-label="Previous page"
                                            disabled={paginaActual === 0}
                                            onClick={() =>
                                                setTraitPage(paginaActual - 1)
                                            }
                                            className="bg-lightblue text-darkblue rounded-md sm:rounded-sm w-9 h-8 sm:w-5 sm:h-4 flex items-center justify-center cursor-pointer hover:bg-yellow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue transition-all duration-300 active:scale-97"
                                        >
                                            <FiChevronLeft className="w-4 h-4 sm:w-3 sm:h-3" strokeWidth={3} />
                                        </button>
                                        <span className="pb-1.5">
                                            Page {paginaActual + 1} of{' '}
                                            {totalPaginas}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label="Next page"
                                            disabled={
                                                paginaActual >= totalPaginas - 1
                                            }
                                            onClick={() =>
                                                setTraitPage(paginaActual + 1)
                                            }
                                            className="bg-lightblue text-darkblue rounded-md sm:rounded-sm w-9 h-8 sm:w-5 sm:h-4 flex items-center justify-center cursor-pointer hover:bg-yellow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue transition-all duration-300 active:scale-97"
                                        >
                                            <FiChevronRight className="w-4 h-4 sm:w-3 sm:h-3" strokeWidth={3} />
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// El Suspense que envolvia esto existia solo por el useSearchParams de Next,
// que obligaba a un limite de suspension para poder prerenderizar. El
// equivalente propio lee la URL directo, asi que no hace falta.
export default CustomizerContent;
