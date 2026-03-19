// src/app/customizer/page.tsx

"use client"

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import GIF from 'gif.js/dist/gif.js';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { useSearchParams, useRouter } from 'next/navigation';

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
const LAYER_ORDER = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];
const NONE_SELECTION = '__NONE__';

interface GifFrame {
    dims: { left: number; top: number; width: number; height: number };
    delay?: number;
    patch: Uint8ClampedArray;
}

type LoadedImageLayer = { url: string; type: 'image'; image: HTMLImageElement };
type LoadedGifLayer = { url: string; type: 'gif'; frames: GifFrame[] };
type LoadedLayer = LoadedImageLayer | LoadedGifLayer;

// --- Componente de Contenido ---
function CustomizerContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Lee el ID de la URL
    const tokenIdFromUrl = searchParams.get('tokenId');

    const [nftId, setNftId] = useState<string>(tokenIdFromUrl || '');
    const [inputNftId, setInputNftId] = useState<string>(tokenIdFromUrl || '');
    const [customizationOptions, setCustomizationOptions] = useState<CustomizationOptions | null>(null);
    const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [activeTraitSection, setActiveTraitSection] = useState<string | null>(null);
    const [exportingGif, setExportingGif] = useState<boolean>(false);
    const [exportProgress, setExportProgress] = useState<number>(0);

    const nftDisplayRef = useRef<HTMLDivElement>(null);

    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
    const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:3001';

    const getVariantSelectionValue = (variant: TraitVariant): string => {
        if (variant.isNone) return NONE_SELECTION;
        return variant.imageUrl || NONE_SELECTION;
    };

    // Cargar datos del NFT automáticamente
    useEffect(() => {
        if (!nftId) return;
        const loadNftData = async () => {
            setLoading(true);
            setError(null);
            setCustomizationOptions(null);
            setSelectedVariants({});
            try {
                const optionsResponse = await fetch(`${BACKEND_URL}/nft/${nftId}/customize-options`);
                if (!optionsResponse.ok) throw new Error(`Error: ${optionsResponse.status}`);
                const data: CustomizationOptions = await optionsResponse.json();
                setCustomizationOptions(data);
                const initialSelections: { [key: string]: string } = {};
                for (const traitType in data) {
                    const currentValue = (data[traitType].currentValue || '').toLowerCase();
                    const defaultVariant = data[traitType].variants.find(variant => {
                        if (!variant || !variant.name) return false;
                        if (currentValue === 'none' && variant.isNone) return true;
                        return variant.name.toLowerCase() === currentValue;
                    });
                    if (defaultVariant) {
                        initialSelections[traitType] = getVariantSelectionValue(defaultVariant);
                    }
                }
                setSelectedVariants(initialSelections);
                const firstAvailableSection = LAYER_ORDER.find(trait => data[trait]) || Object.keys(data)[0] || null;
                setActiveTraitSection(firstAvailableSection);
            } catch (_error: unknown) {
                setError(`Falló la carga de datos del NFT #${nftId}.`);
            } finally {
                setLoading(false);
            }
        };
        loadNftData();
    }, [nftId, BACKEND_URL]);

    const displayedLayers = useMemo(() => {
        return LAYER_ORDER
            .map(traitType => selectedVariants[traitType])
            .filter(layerUrl => Boolean(layerUrl) && layerUrl !== NONE_SELECTION)
            .map(layerUrl => {
                if (!layerUrl) return null;
                if (layerUrl.startsWith('http://') || layerUrl.startsWith('https://')) return layerUrl;
                return `${BACKEND_BASE_URL}${layerUrl}`;
            })
            .filter(Boolean) as string[];
    }, [selectedVariants, BACKEND_BASE_URL]);

    const allAssetsSelected = useMemo(() => {
        if (!customizationOptions) return false;
        return Object.keys(customizationOptions).every(traitType => selectedVariants[traitType] !== undefined);
    }, [selectedVariants, customizationOptions]);

    const handleVariantChange = (traitType: string, variant: TraitVariant) => {
        const nextValue = getVariantSelectionValue(variant);
        setSelectedVariants(prev => {
            const updated = { ...prev };
            if (updated[traitType] === nextValue) delete updated[traitType];
            else updated[traitType] = nextValue;
            return updated;
        });
    };

    const handleLoadNft = () => {
        const trimmedId = inputNftId.trim();
        if (trimmedId && trimmedId !== nftId) setNftId(trimmedId);
    };

    const handleInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleLoadNft();
    };

    const handleBackToSelection = () => {
        router.push('/selector-nft');
    };

    const handleExportGif = async () => {
        if (!allAssetsSelected) {
            alert('Debes seleccionar una opción en cada categoría antes de exportar.');
            return;
        }

        if (displayedLayers.length === 0) {
            alert('No hay capas para exportar.');
            return;
        }

        setExportingGif(true);
        setExportProgress(0);

        try {
            const loadedLayers: LoadedLayer[] = await Promise.all(
                displayedLayers.map(async (url) => {
                    if (url.endsWith('.gif')) {
                        const response = await fetch(url);
                        if (!response.ok) {
                            throw new Error(`No se pudo cargar la capa GIF: ${url}`);
                        }

                        const buffer = await response.arrayBuffer();
                        const parsedGif = parseGIF(buffer);
                        const frames = decompressFrames(parsedGif, true) as unknown as GifFrame[];
                        return { url, type: 'gif', frames };
                    }

                    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${url}`));
                        img.src = url;
                    });

                    return { url, type: 'image', image };
                })
            );

            const gif = new GIF({
                workers: 2,
                quality: 10,
                width: GIF_EXPORT_SIZE,
                height: GIF_EXPORT_SIZE,
                workerScript: '/gif.worker.js'
            });

            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = GIF_EXPORT_SIZE;
            frameCanvas.height = GIF_EXPORT_SIZE;
            const frameCtx = frameCanvas.getContext('2d');

            const patchCanvas = document.createElement('canvas');
            const patchCtx = patchCanvas.getContext('2d');

            if (!frameCtx || !patchCtx) {
                throw new Error('No se pudo inicializar el canvas para exportación.');
            }

            const gifLayerCache = new Map<string, HTMLCanvasElement>();
            const animatedLayers = loadedLayers.filter((layer): layer is LoadedGifLayer => layer.type === 'gif');
            const totalFrames = animatedLayers.length > 0
                ? Math.max(...animatedLayers.map(layer => layer.frames.length))
                : 1;

            for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
                frameCtx.clearRect(0, 0, GIF_EXPORT_SIZE, GIF_EXPORT_SIZE);

                for (const layer of loadedLayers) {
                    if (layer.type === 'image') {
                        frameCtx.drawImage(layer.image, 0, 0, GIF_EXPORT_SIZE, GIF_EXPORT_SIZE);
                        continue;
                    }

                    const gifFrame = layer.frames[frameIndex % layer.frames.length];
                    if (!gifFrame) continue;

                    patchCanvas.width = gifFrame.dims.width;
                    patchCanvas.height = gifFrame.dims.height;

                    const imageData = patchCtx.createImageData(gifFrame.dims.width, gifFrame.dims.height);
                    imageData.data.set(gifFrame.patch);
                    patchCtx.putImageData(imageData, 0, 0);

                    let layerCanvas = gifLayerCache.get(layer.url);
                    if (!layerCanvas) {
                        layerCanvas = document.createElement('canvas');
                        layerCanvas.width = GIF_EXPORT_SIZE;
                        layerCanvas.height = GIF_EXPORT_SIZE;
                        gifLayerCache.set(layer.url, layerCanvas);
                    }

                    const layerCtx = layerCanvas.getContext('2d');
                    if (!layerCtx) continue;

                    layerCtx.drawImage(patchCanvas, gifFrame.dims.left, gifFrame.dims.top);
                    frameCtx.drawImage(layerCanvas, 0, 0, GIF_EXPORT_SIZE, GIF_EXPORT_SIZE);
                }

                const animatedDelay = animatedLayers[0]?.frames[frameIndex % animatedLayers[0].frames.length]?.delay;
                gif.addFrame(frameCanvas, { copy: true, delay: animatedDelay || 100 });
                setExportProgress(((frameIndex + 1) / totalFrames) * 100);
            }

            await new Promise<void>((resolve, reject) => {
                gif.on('finished', (blob: Blob) => {
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `primal-${nftId}.gif`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                    resolve();
                });

                gif.on('abort', () => {
                    reject(new Error('La exportación del GIF fue abortada.'));
                });

                gif.render();
            });
        } catch (exportError) {
            console.error(exportError);
            alert('No se pudo exportar el GIF. Revisa la consola para más detalle.');
        } finally {
            setExportingGif(false);
            setExportProgress(0);
        }
    };

    // Si no hay tokenId, mostrar mensaje de error
    if (!tokenIdFromUrl) {
        return (
            <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">⚠️</div>
                    <div className="text-2xl text-red-400 mb-4">Token ID no especificado</div>
                    <div className="text-blue-200 mb-6">Necesitas seleccionar un NFT primero</div>
                    <button 
                        onClick={handleBackToSelection}
                        className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold transition-all duration-200"
                    >
                        Volver a la Selección
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            CUSTOMIZE: PRIMAL #{nftId}
                        </h1>
                        <p className="text-blue-200 mt-2">Customize your character</p>
                    </div>
                </div>

                {/* Input para cambiar NFT */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-8">
                    <div className="flex gap-4 items-center">
                        <input 
                            type="text" 
                            value={inputNftId} 
                            onChange={(e) => setInputNftId(e.target.value)} 
                            onKeyPress={handleInputKeyPress} 
                            placeholder="Ingresa otro ID de NFT" 
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-blue-500" 
                        />
                        <button 
                            onClick={handleLoadNft} 
                            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-semibold transition-all duration-200"
                        >
                            Search
                        </button>
                    </div>
                </div>

                {/* Estados de carga y error */}
                {loading && (
                    <div className="text-center py-16">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <div className="text-blue-200 text-xl">NFT Loading...</div>
                    </div>
                )}

                {error && (
                    <div className="text-center py-16">
                        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 max-w-md mx-auto">
                            <div className="text-red-400 text-lg mb-2">⚠️ Error</div>
                            <div className="text-red-300">{error}</div>
                        </div>
                    </div>
                )}

                {/* Contenido del customizer */}
                {!loading && !error && customizationOptions && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Columna izquierda - Vista previa del NFT */}
                        <div className="lg:col-span-1">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                                <h3 className="text-xl font-semibold mb-4 text-center">Preview</h3>
                                <div 
                                    ref={nftDisplayRef} 
                                    className="relative mx-auto w-full max-w-[500px] aspect-square overflow-hidden rounded-lg"
                                >
                                    {displayedLayers.map((layerSrc, index) => (
                                        <img 
                                            key={index} 
                                            src={layerSrc} 
                                            alt={`NFT Layer ${index}`} 
                                            width={1000}
                                            height={1000}
                                            className="absolute inset-0 w-full h-full object-contain" 
                                            style={{ imageRendering: 'pixelated' }} 
                                        />
                                    ))}
                                </div>
                                <div className="mt-5">
                                    <button
                                        onClick={handleExportGif}
                                        disabled={!allAssetsSelected || exportingGif}
                                        className={`flex w-full items-center justify-center rounded-2xl px-6 py-3 text-lg font-black uppercase tracking-[0.12em] transition-all duration-200 ${
                                            allAssetsSelected
                                                ? 'bg-blue-600 text-white hover:bg-blue-800'
                                                : 'text-white/45'
                                        } disabled:cursor-not-allowed disabled:shadow-none`}
                                    >
                                        {exportingGif
                                            ? `Exporting ${Math.round(exportProgress)}%`
                                            : allAssetsSelected
                                                ? 'Export'
                                                : 'Complete traits'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Columna derecha - Selector de traits */}
                        <div className="lg:col-span-2">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                                <h3 className="text-xl font-semibold mb-6">Customization</h3>
                                
                                {/* Selector de categorías */}
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {[...LAYER_ORDER, ...Object.keys(customizationOptions).filter(t => !LAYER_ORDER.includes(t))]
                                        .filter((traitType, index, arr) => arr.indexOf(traitType) === index)
                                        .filter((traitType) => Boolean(customizationOptions[traitType]))
                                        .map((traitType) => (
                                        <button
                                            key={traitType}
                                            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                                                activeTraitSection === traitType
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                                            }`}
                                            onClick={() => setActiveTraitSection(traitType)}
                                        >
                                            {traitType}
                                        </button>
                                    ))}
                                </div>

                                {/* Variantes del trait seleccionado */}
                                {activeTraitSection && customizationOptions[activeTraitSection] && (
                                    <div>
                                        <h4 className="text-lg font-semibold mb-4 text-blue-200">
                                            {activeTraitSection} - {customizationOptions[activeTraitSection].currentValue}
                                        </h4>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                            {customizationOptions[activeTraitSection].variants.map((variant) => (
                                                <div
                                                    key={`${activeTraitSection}-${variant.name}`}
                                                    className={`cursor-pointer transition-all duration-200 transform hover:scale-105 ${
                                                        selectedVariants[activeTraitSection] === getVariantSelectionValue(variant)
                                                            ? 'ring-2 ring-blue-500 scale-105' 
                                                            : ''
                                                    }`}
                                                    onClick={() => handleVariantChange(activeTraitSection, variant)}
                                                >
                                                    <div className="bg-white/10 rounded-lg p-2 mb-2">
                                                        {variant.isNone ? (
                                                            <div className="w-full aspect-square rounded bg-gradient-to-br from-white/10 to-white/5 border border-white/20 flex items-center justify-center">
                                                                <div className="text-center px-2">
                                                                    <div className="text-xs font-semibold text-white/90 tracking-wide">NO LAYER</div>
                                                                    <div className="text-[10px] text-white/60 mt-1">None</div>
                                                                </div>
                                                            </div>
                                                        ) : variant.imageUrl ? (
                                                            <img 
                                                                src={variant.imageUrl.startsWith('http') ? variant.imageUrl : `${BACKEND_BASE_URL}${variant.imageUrl}`}
                                                                alt={variant.name} 
                                                                width={THUMBNAIL_SIZE} 
                                                                height={THUMBNAIL_SIZE} 
                                                                className="w-full aspect-square object-cover rounded" 
                                                                style={{ imageRendering: 'pixelated' }} 
                                                            />
                                                        ) : (
                                                            <div className="w-full aspect-square rounded bg-white/10 flex items-center justify-center text-xs text-white/70">
                                                                {variant.name}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-center text-sm font-medium">{variant.name}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Componente Principal Exportado ---
export default function NftCustomizerPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <div className="text-2xl text-blue-200">Cargando Customizer...</div>
                </div>
            </div>
        }>
            <CustomizerContent />
        </Suspense>
    );
}