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
type LoadedGifLayer = { url: string; type: 'gif'; frames: GifFrame[]; origWidth: number; origHeight: number };
type LoadedLayer = LoadedImageLayer | LoadedGifLayer;

// --- Componente de Contenido ---
function CustomizerContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);

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

    // Pre-cargar el worker de gif.js al montar la página.
    // En iOS Safari, la primera vez que se usa el worker se descarga el script
    // justo cuando el canvas ya consume RAM → pico de memoria → Safari mata el tab.
    // Pre-cargándolo queda en caché del browser antes de que el usuario toque Export.
    useEffect(() => {
        fetch('/gif.worker.js').catch(() => {});
    }, []);

    const getVariantSelectionValue = (variant: TraitVariant): string => variant.imageUrl || NONE_SELECTION;

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
                const sanitizedData = Object.fromEntries(
                    Object.entries(data).map(([traitType, option]) => {
                        const variants = (option?.variants || []).filter(variant => !isNoneVariant(variant));
                        return [traitType, { ...option, variants }];
                    })
                ) as CustomizationOptions;

                setCustomizationOptions(sanitizedData);
                const initialSelections: { [key: string]: string } = {};
                for (const traitType in sanitizedData) {
                    const currentValue = (sanitizedData[traitType].currentValue || '').toLowerCase();
                    const defaultVariant = sanitizedData[traitType].variants.find(variant => {
                        if (!variant || !variant.name) return false;
                        return variant.name.toLowerCase() === currentValue;
                    }) || sanitizedData[traitType].variants[0];
                    if (defaultVariant) {
                        initialSelections[traitType] = getVariantSelectionValue(defaultVariant);
                    }
                }

                // Restaurar selecciones guardadas (si el usuario vuelve después de navegar)
                try {
                    const saved = localStorage.getItem(`nft_custom_${nftId}`);
                    if (saved) {
                        const savedSelections: { [key: string]: string } = JSON.parse(saved);
                        // Solo restaurar keys que sigan siendo válidas en los datos actuales
                        const restored: { [key: string]: string } = { ...initialSelections };
                        for (const traitType in savedSelections) {
                            if (sanitizedData[traitType]) {
                                restored[traitType] = savedSelections[traitType];
                            }
                        }
                        setSelectedVariants(restored);
                    } else {
                        setSelectedVariants(initialSelections);
                    }
                } catch {
                    setSelectedVariants(initialSelections);
                }
                const firstAvailableSection = LAYER_ORDER.find(trait => sanitizedData[trait]) || Object.keys(sanitizedData)[0] || null;
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
            // Persistir cambios para sobrevivir navegación
            try { localStorage.setItem(`nft_custom_${nftId}`, JSON.stringify(updated)); } catch { /* storage lleno */ }
            return updated;
        });
    };

    const handleLoadNft = () => {
        const trimmedId = inputNftId.trim();
        if (trimmedId && trimmedId !== nftId) {
            setNftId(trimmedId);
            // Actualizar la URL para que un reload en móvil mantenga el NFT correcto
            router.replace(`/customizer?tokenId=${trimmedId}`);
        }
    };

    const handleInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleLoadNft();
    };

    const handleBackToSelection = () => {
        router.push('/selector-nft');
    };

    const handleExportGif = async () => {
        if (!allAssetsSelected) {
            alert('You must select an option in each category before exporting.');
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
                        if (!response.ok) throw new Error(`Failed to load GIF layer: ${url}`);
                        const buffer = await response.arrayBuffer();
                        const parsedGif = parseGIF(buffer);
                        const frames = decompressFrames(parsedGif, true) as unknown as GifFrame[];
                        // Dimensiones originales del GIF: máximo de (left+width) y (top+height) entre todos los frames
                        const origWidth = Math.max(...frames.map(f => f.dims.left + f.dims.width));
                        const origHeight = Math.max(...frames.map(f => f.dims.top + f.dims.height));
                        return { url, type: 'gif', frames, origWidth, origHeight };
                    }
                    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
                        img.src = url;
                    });
                    return { url, type: 'image', image };
                })
            );

            // GIF animado — iOS usa 500px + 1 worker para caber en RAM, desktop usa 2000px + 2 workers
            const gif = new GIF({
                workers: isIOS ? 1 : 2,
                quality: isIOS ? 15 : 10,
                width: exportSize,
                height: exportSize,
                workerScript: '/gif.worker.js'
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
            const gifLayerPrevInfo = new Map<string, { dims: GifFrame['dims']; disposalType: number; savedData?: ImageData }>();

            const animatedLayers = loadedLayers.filter((layer): layer is LoadedGifLayer => layer.type === 'gif');
            const totalFrames = animatedLayers.length > 0
                ? Math.max(...animatedLayers.map(layer => layer.frames.length))
                : 1;

            for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
                frameCtx.clearRect(0, 0, exportSize, exportSize);

                for (const layer of loadedLayers) {
                    if (layer.type === 'image') {
                        frameCtx.drawImage(layer.image, 0, 0, exportSize, exportSize);
                        continue;
                    }

                    const localFrameIndex = frameIndex % layer.frames.length;
                    const gifFrame = layer.frames[localFrameIndex];
                    if (!gifFrame) continue;

                    patchCanvas.width = gifFrame.dims.width;
                    patchCanvas.height = gifFrame.dims.height;

                    const imageData = patchCtx.createImageData(gifFrame.dims.width, gifFrame.dims.height);
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
                        layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
                        gifLayerPrevInfo.delete(layer.url);
                    }

                    // Aplicar el disposal del frame anterior antes de pintar el actual
                    const prevInfo = gifLayerPrevInfo.get(layer.url);
                    if (prevInfo) {
                        if (prevInfo.disposalType === 2) {
                            // Restore to background: borrar el área que ocupó el frame anterior
                            layerCtx.clearRect(prevInfo.dims.left, prevInfo.dims.top, prevInfo.dims.width, prevInfo.dims.height);
                        } else if (prevInfo.disposalType === 3 && prevInfo.savedData) {
                            // Restore to previous: restaurar el estado guardado
                            layerCtx.putImageData(prevInfo.savedData, prevInfo.dims.left, prevInfo.dims.top);
                        }
                        // disposalType 0 o 1: no dispose / leave in place → no action needed
                    }

                    // Para disposal type 3: guardar el área actual antes de pintar
                    const frameDisposalType = gifFrame.disposalType ?? 1;
                    let savedData: ImageData | undefined;
                    if (frameDisposalType === 3) {
                        savedData = layerCtx.getImageData(gifFrame.dims.left, gifFrame.dims.top, gifFrame.dims.width, gifFrame.dims.height);
                    }

                    // Pintar el patch en sus coordenadas originales (sin escalar)
                    layerCtx.drawImage(patchCanvas, gifFrame.dims.left, gifFrame.dims.top);

                    // Guardar info de este frame para el disposal del siguiente
                    gifLayerPrevInfo.set(layer.url, { dims: gifFrame.dims, disposalType: frameDisposalType, savedData });

                    // Escalar el canvas acumulado al tamaño de exportación
                    frameCtx.drawImage(layerCanvas, 0, 0, exportSize, exportSize);
                }

                const animatedDelay = animatedLayers[0]?.frames[frameIndex % animatedLayers[0].frames.length]?.delay;
                gif.addFrame(frameCanvas, { copy: true, delay: animatedDelay || 100 });
                setExportProgress(((frameIndex + 1) / totalFrames) * 100);
            }

            await new Promise<void>((resolve, reject) => {
                gif.on('finished', (blob: Blob) => {
                    setGeneratedBlob(blob);
                    
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
                    setExportingGif(false);
                    setExportProgress(0);
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

    const handleShareOnX = async () => {
        if (!generatedBlob) {
            alert("Primero debés exportar el NFT para poder compartirlo.");
            return;
        }

        setExportingGif(true); // Usamos el loader para el feedback de subida
        
        try {
            const formData = new FormData();
            formData.append('file', generatedBlob, `primal-${nftId}.gif`);

            const response = await fetch(`${BACKEND_URL}/nft/share-gif`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (data.shareUrl) {
                const tweetText = encodeURIComponent(`I just customized my Primal NFT #${nftId}! 🎭✨`);
                window.open(`https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(data.shareUrl)}`, '_blank');
            }
        } catch (err) {
            alert("Error al subir el GIF a Railway.");
        } finally {
            setExportingGif(false);
        }
    };

    // Si no hay tokenId, mostrar mensaje de error
    if (!tokenIdFromUrl) {
        return (
            <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">⚠️</div>
                    <div className="text-2xl text-red-400 mb-4">Token ID not specified</div>
                    <div className="text-blue-200 mb-6">You need to select an NFT first</div>
                    <button 
                        onClick={handleBackToSelection}
                        className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold transition-all duration-200"
                    >
                        Back to Selection
                    </button>
                </div>
            </div>
        );
    }

    return (

        <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white px-4 py-6 sm:p-8">
            <div className="max-w-7xl mx-auto flex flex-col gap-10">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            CUSTOMIZE: PRIMAL #{nftId}
                        </h1>
                        <p className="text-blue-200 mt-2">Customize your character</p>
                    </div>
                </div>

                {/* Input para cambiar NFT */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4">
                    <div className="flex gap-2 sm:gap-4 items-center">
                        <input 
                            type="text" 
                            value={inputNftId} 
                            onChange={(e) => setInputNftId(e.target.value)} 
                            onKeyPress={handleInputKeyPress} 
                            placeholder="NFT ID" 
                            className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-3 sm:px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-blue-500 text-sm sm:text-base" 
                        />
                        <button 
                            onClick={handleLoadNft} 
                            className="shrink-0 bg-blue-600 hover:bg-blue-700 px-4 sm:px-6 py-2 rounded-lg font-semibold transition-all duration-200 text-sm sm:text-base"
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
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center justify-center">
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
                                <div className="flex flex-col gap-3 mt-5">
                                    {/* Botón 1: Siempre activo */}
                                    <button
                                        onClick={handleExportGif}
                                        disabled={exportingGif}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all"
                                    >
                                        {exportingGif ? `Generando ${Math.round(exportProgress)}%` : '1. Generar y Descargar GIF'}
                                    </button>

                                    {/* Botón 2: Deshabilitado hasta que generatedBlob tenga datos */}
                                    <button
                                        onClick={handleShareOnX}
                                        disabled={!generatedBlob || exportingGif}
                                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                                            generatedBlob 
                                            ? 'bg-black text-white border border-white/20 hover:bg-white/10' 
                                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                        }`}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                        </svg>
                                        {generatedBlob ? '2. Compartir en X' : 'Esperando GIF...'}
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
                                            {activeTraitSection}
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
                                                        {variant.imageUrl ? (
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

                {/* Footer */}
                <footer className="flex flex-col md:flex-row gap-10 items-center justify-between bg-white/5 border border-white/10 rounded-xl p-6 text-center text-white/50">
                    
                    <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-nowrap text-xs lg:text-md">
                        <a href="/" className="scale-100 hover:scale-105 transition-transform duration-300 w-6 h-6 lg:w-9 lg:h-9">
                            <img src="/primalwhite.svg" alt="Cultomizer Logo" className="inline-block" />
                        </a>
                        &copy; {new Date().getFullYear()} Cultomizer - Primal Cult. All rights reserved.
                    </div>
                   

                    <div className="flex justify-center gap-6">
                        {/* Discord */}
                        <a href="https://discord.gg/djJaV4keCQ" target="_blank" rel="noopener noreferrer" aria-label="Discord" className="scale-100 hover:scale-105 transition-transform duration-300">
                            <img src="/discord.svg" alt="Discord" width={28} height={28} />
                        </a>
                        {/* X (Twitter) */}
                        <a href="https://x.com/primal_cult" target="_blank" rel="noopener noreferrer" aria-label="X" className="scale-100 hover:scale-105 transition-transform duration-300">
                            <svg width="28" height="28" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
                                <g fill="#fff" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none" style={{mixBlendMode: 'normal'}}>
                                    <g transform="scale(8.53333,8.53333)">
                                        <path d="M26.37,26l-8.795,-12.822l0.015,0.012l7.93,-9.19h-2.65l-6.46,7.48l-5.13,-7.48h-6.95l8.211,11.971l-0.001,-0.001l-8.66,10.03h2.65l7.182,-8.322l5.708,8.322zM10.23,6l12.34,18h-2.1l-12.35,-18z"></path>
                                    </g>
                                </g>
                            </svg>
                        </a>                        
                        {/* Network (Ethereum) */}
                        <a href="https://primalcult.xyz/" target="_blank" rel="noopener noreferrer" aria-label="Ethereum" className="scale-100 hover:scale-105 transition-transform duration-300">
                            <svg width="28" height="28" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                                <path d="M372.288 745.792a394.048 394.048 0 0 0 113.728 102.848v-127.744a390.08 390.08 0 0 0-113.728 24.896z m-51.584 24.192a392.96 392.96 0 0 0-60.16 41.6h-1.28a390.336 390.336 0 0 0 205.696 89.6 450.24 450.24 0 0 1-144.256-131.2z m-24.704-230.016c3.968 56.768 20.096 110.208 45.696 157.696a445.696 445.696 0 0 1 144.32-32.896v-124.8h-190.08z m-56.128 0H120.96a390.4 390.4 0 0 0 98.56 233.024c22.208-19.2 46.272-36.224 71.808-50.752a445.312 445.312 0 0 1-51.456-182.272z m445.824 158.784c25.984-47.808 42.24-101.568 46.336-158.72H540.992v124.864c51.072 3.2 99.776 14.976 144.704 33.92z m50.24 24.96c24.448 14.08 47.552 30.464 68.928 48.896a390.4 390.4 0 0 0 98.176-232.576h-114.88a445.312 445.312 0 0 1-52.224 183.68z m-194.944 125.44a394.048 394.048 0 0 0 113.92-102.4 389.888 389.888 0 0 0-113.92-25.728v128.192z m23.104 51.392a390.4 390.4 0 0 0 200.704-88.96h-0.512a392.96 392.96 0 0 0-57.92-40.32 450.24 450.24 0 0 1-142.272 129.28zM341.76 326.144a389.632 389.632 0 0 0-45.76 157.824h190.016V358.976a445.696 445.696 0 0 1-144.256-32.768z m-50.368-24.576a449.216 449.216 0 0 1-71.808-50.56 390.4 390.4 0 0 0-98.56 232.96h118.848a445.312 445.312 0 0 1 51.52-182.4z m194.56-126.208A394.048 394.048 0 0 0 372.48 278.016a390.08 390.08 0 0 0 113.536 24.768V175.36z m-20.992-52.544a390.272 390.272 0 0 0-205.312 89.152h0.512c18.88 15.872 39.168 29.888 60.608 41.92a450.24 450.24 0 0 1 144.192-131.072z m189.76 154.048a394.048 394.048 0 0 0-113.728-102.08v127.808a389.952 389.952 0 0 0 113.728-25.728z m51.392-24.576a392.96 392.96 0 0 0 57.856-40.32h0.384A390.336 390.336 0 0 0 564.16 123.52a450.24 450.24 0 0 1 141.952 128.832z m25.92 231.68a389.632 389.632 0 0 0-46.528-159.168 445.568 445.568 0 0 1-144.512 33.92v125.248h191.04z m56.128 0h114.88a390.4 390.4 0 0 0-98.56-232.96 449.28 449.28 0 0 1-68.736 48.896c29.824 55.424 48.32 117.76 52.416 184.128zM512 960A448 448 0 1 1 512 64a448 448 0 0 1 0 896z" fill="#fff" />
                            </svg>
                        </a>
                        {/* OpenSea */}
                        <a href="https://opensea.io/collection/primalcult" target="_blank" rel="noopener noreferrer" aria-label="OpenSea" className="scale-100 hover:scale-105 transition-transform duration-300">
                            <img src="/opensea.svg" alt="OpenSea" width={28} height={28} />
                        </a>

                    </div>

                </footer>

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
                    <div className="text-2xl text-blue-200">Customizer Loading...</div>
                </div>
            </div>
        }>
            <CustomizerContent />
        </Suspense>
    );
}