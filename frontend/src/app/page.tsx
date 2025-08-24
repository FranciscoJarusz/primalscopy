// pages/customizer.tsx (o donde sea que viva tu componente)

"use client"
import React, { useState, useEffect, useMemo, useRef } from 'react';
import GIF from 'gif.js';
import { parseGIF, decompressFrames } from 'gifuct-js';

// --- Interfaces para Tipado ---
interface TraitVariant {
    name: string;
    imageUrl: string;
}

interface CustomizationOption {
    currentValue: string;
    variants: TraitVariant[];
}

interface CustomizationOptions {
    [traitType: string]: CustomizationOption;
}

// --- Constantes ---
const NFT_DISPLAY_SIZE = 500;
const THUMBNAIL_SIZE = 80;
const GIF_EXPORT_SIZE = 2000;
const LAYER_ORDER = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];

// --- Componente Principal ---
export default function NftCustomizerPage() {
    const [nftId, setNftId] = useState<string>('');
    const [inputNftId, setInputNftId] = useState<string>('');
    const [customizationOptions, setCustomizationOptions] = useState<CustomizationOptions | null>(null);
    const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [activeTraitSection, setActiveTraitSection] = useState<string | null>(null);
    const [exportingGif, setExportingGif] = useState<boolean>(false);
    const [exportProgress, setExportProgress] = useState<number>(0);

    const nftDisplayRef = useRef<HTMLDivElement>(null);

    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
    const BACKEND_BASE_URL = 'http://localhost:3001';

    // Cargar datos del NFT (sin cambios)
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
                    const defaultVariant = data[traitType].variants.find(v => v.name === data[traitType].currentValue);
                    if (defaultVariant) initialSelections[traitType] = defaultVariant.imageUrl;
                }
                setSelectedVariants(initialSelections);
                if (Object.keys(data).length > 0) setActiveTraitSection(Object.keys(data)[0]);
            } catch (error: unknown) {
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
            .filter(Boolean)
            .map(layerUrl => `${BACKEND_BASE_URL}${layerUrl}`);
    }, [selectedVariants, BACKEND_BASE_URL]);

    const allAssetsSelected = useMemo(() => {
        if (!customizationOptions) return false;
        return Object.keys(customizationOptions).every(traitType => Boolean(selectedVariants[traitType]));
    }, [selectedVariants, customizationOptions]);

    const handleVariantChange = (traitType: string, variant: TraitVariant) => {
        setSelectedVariants(prev => {
            const updated = { ...prev };
            if (updated[traitType] === variant.imageUrl) delete updated[traitType];
            else updated[traitType] = variant.imageUrl;
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

    // ==================================================================
    // ===          LÓGICA DE EXPORTACIÓN FINAL (VERSIÓN 5)           ===
    // ==================================================================
    const handleExportGif = async () => {
        if (!allAssetsSelected) {
            alert('Debes seleccionar una pieza de cada categoría para exportar.');
            return;
        }
        setExportingGif(true);
        setExportProgress(0);

        try {
            console.log("Iniciando la carga de todas las capas...");
            type LoadedImageLayer = { url: string; type: 'image'; image: HTMLImageElement };
            type GifFrame = {
                dims: { left: number; top: number; width: number; height: number };
                delay?: number;
                patch: Uint8ClampedArray;
            };
            type LoadedGifLayer = { url: string; type: 'gif'; frames: GifFrame[] };
            type LoadedLayer = LoadedImageLayer | LoadedGifLayer;

            const loadedLayers: LoadedLayer[] = await Promise.all(
                displayedLayers.map(async (url) => {
                    if (url.endsWith('.gif')) {
                        const response = await fetch(url);
                        const buffer = await response.arrayBuffer();
                        const parsedGif = parseGIF(buffer);
                        const frames = decompressFrames(parsedGif, true) as unknown as GifFrame[];
                        return { url, type: 'gif', frames } as LoadedGifLayer;
                    }
                    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = "anonymous";
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${url}`));
                        img.src = url;
                    });
                    return { url, type: 'image', image } as LoadedImageLayer;
                })
            );
            console.log("Todas las capas cargadas y procesadas.");

            const gif = new GIF({ workers: 4, quality: 10, width: GIF_EXPORT_SIZE, height: GIF_EXPORT_SIZE, workerScript: '/gif.worker.js' });

            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = GIF_EXPORT_SIZE;
            frameCanvas.height = GIF_EXPORT_SIZE;
            const frameCtx = frameCanvas.getContext('2d');
            if (!frameCtx) throw new Error("Canvas context es nulo");
            
            // Un canvas temporal para dibujar los parches de los GIFs
            const patchCanvas = document.createElement('canvas');
            const patchCtx = patchCanvas.getContext('2d');
            if (!patchCtx) throw new Error("Patch canvas context es nulo");

            const animatedLayers = loadedLayers.filter((l): l is LoadedGifLayer => l.type === 'gif');
            if (animatedLayers.length === 0) {
                 console.log("No hay capas animadas, exportando PNG.");
                 loadedLayers.forEach(layer => {
                     if (layer.type === 'image') {
                         frameCtx.drawImage(layer.image, 0, 0, GIF_EXPORT_SIZE, GIF_EXPORT_SIZE);
                     }
                 });
                 const dataURL = frameCanvas.toDataURL('image/png');
                 const a = document.createElement('a');
                 a.href = dataURL; a.download = `nft-${nftId}-customized.png`; a.click();
                 setExportingGif(false);
                 return;
            }

            const longestAnimation = animatedLayers.reduce((a, b) => (a.frames.length > b.frames.length ? a : b));
            const totalFrames = longestAnimation.frames.length;

            console.log(`Componiendo ${totalFrames} fotogramas...`);
            for (let i = 0; i < totalFrames; i++) {
                frameCtx.clearRect(0, 0, GIF_EXPORT_SIZE, GIF_EXPORT_SIZE);

                // 1) Actualizar el estado acumulado de cada capa GIF en su propio canvas
                const gifLayerStates = loadedLayers
                    .map((layer) => (layer.type === 'gif' ? (layer as LoadedGifLayer) : null))
                    .map((gifLayer) => {
                        if (!gifLayer) return null;
                        // Canvas acumulativo por capa
                        const canvas = document.createElement('canvas');
                        canvas.width = GIF_EXPORT_SIZE;
                        canvas.height = GIF_EXPORT_SIZE;
                        const ctx = canvas.getContext('2d');
                        return { gifLayer, canvas, ctx } as const;
                    });

                // Cachear estados por primera vez fuera del bucle sería más óptimo, pero mantenemos la simplicidad aquí

                // 2) Dibujar TODAS las capas en el orden correcto
                for (const layer of loadedLayers) {
                    if (layer.type === 'image') {
                        frameCtx.drawImage(layer.image, 0, 0, GIF_EXPORT_SIZE, GIF_EXPORT_SIZE);
                        continue;
                    }

                    const frameIndex = i % layer.frames.length;
                    const frame = layer.frames[frameIndex];
                    if (!frame) continue;

                    // Pintar el parche en un canvas temporal del tamaño del parche
                    patchCanvas.width = frame.dims.width;
                    patchCanvas.height = frame.dims.height;
                    const frameImageData = patchCtx.createImageData(frame.dims.width, frame.dims.height);
                    frameImageData.data.set(frame.patch);
                    patchCtx.putImageData(frameImageData, 0, 0);

                    // Para acumulación por capa, utilizamos un mapa estático en window para persistir entre frames
                    const w = window as unknown as { __gifLayerMap?: Map<string, HTMLCanvasElement> };
                    if (!w.__gifLayerMap) w.__gifLayerMap = new Map();
                    let layerCanvas = w.__gifLayerMap.get(layer.url);
                    if (!layerCanvas) {
                        layerCanvas = document.createElement('canvas');
                        layerCanvas.width = GIF_EXPORT_SIZE;
                        layerCanvas.height = GIF_EXPORT_SIZE;
                        w.__gifLayerMap.set(layer.url, layerCanvas);
                    }
                    const layerCtx = layerCanvas.getContext('2d');
                    if (!layerCtx) continue;

                    // Acumular el parche en la posición correspondiente
                    layerCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

                    // Dibujar el resultado acumulado de la capa en el frame final
                    frameCtx.drawImage(layerCanvas, 0, 0, GIF_EXPORT_SIZE, GIF_EXPORT_SIZE);
                }
                
                const delay = longestAnimation.frames[i]?.delay ?? 100;
                gif.addFrame(frameCanvas, { copy: true, delay });
                setExportProgress(((i + 1) / totalFrames) * 100);
            }

            gif.on('finished', (blob: Blob) => {
                console.log("¡GIF generado! Descargando...");
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `nft-${nftId}-customized.gif`;
                a.click();
                URL.revokeObjectURL(url);
                setExportingGif(false);
            });
            gif.render();

        } catch (err) {
            console.error('Error final al exportar el GIF:', err);
            alert('Hubo un error al generar el GIF animado.');
            setExportingGif(false);
        }
    };
    
    // --- RENDERIZADO --- (Sin cambios)
    if (!nftId) {
        return (
            <div className="initial-state">
                <h1 className="main-title">NFT DRESSROOM</h1>
                <div className="nft-id-input-section">
                    <input type="text" value={inputNftId} onChange={(e) => setInputNftId(e.target.value)} onKeyPress={handleInputKeyPress} placeholder="Ingresa un ID de NFT" className="nft-id-input" />
                    <button onClick={handleLoadNft} className="load-nft-button">Cargar NFT</button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="customizer-layout">
            <h1 className="main-title">CUSTOMIZE: PRIMAL #{nftId}</h1>
            <div className="nft-id-input-section">
                <input type="text" value={inputNftId} onChange={(e) => setInputNftId(e.target.value)} onKeyPress={handleInputKeyPress} placeholder="Ingresa otro ID" className="nft-id-input" />
                <button onClick={handleLoadNft} className="load-nft-button">Cargar NFT</button>
                <button onClick={() => setNftId('')} className="back-button">← Nueva Búsqueda</button>
            </div>
    
            {loading && <div className="loading-message">Cargando...</div>}
            {error && <div className="error-message">Error: {error}</div>}
    
            {!loading && !error && customizationOptions && (
                <div className="content-area">
                    <div className="left-column">
                        <div ref={nftDisplayRef} className="nft-display-wrapper" style={{ position: 'relative', width: NFT_DISPLAY_SIZE, height: NFT_DISPLAY_SIZE }}>
                            {displayedLayers.map((layerSrc) => (
                                <img key={layerSrc} src={layerSrc} alt={`Capa de NFT`} width={NFT_DISPLAY_SIZE} height={NFT_DISPLAY_SIZE} className="nft-image-layer" style={{ position: 'absolute', top: 0, left: 0, imageRendering: 'pixelated' }} />
                            ))}
                        </div>
                        <div className="action-buttons">
                            <button className="action-button" onClick={handleExportGif} disabled={exportingGif || !allAssetsSelected}>
                                {exportingGif ? `EXPORTANDO... ${Math.round(exportProgress)}%` : 'EXPORT GIF'}
                            </button>
                            <button className="action-button">SUBMIT</button>
                        </div>
                    </div>
    
                    <div className="right-column">
                        <div className="trait-category-selector">
                            {Object.keys(customizationOptions).map((traitType) => (
                                <div key={traitType} className={`trait-category-item ${activeTraitSection === traitType ? 'active' : ''}`} onClick={() => setActiveTraitSection(traitType)}>
                                    <span className="trait-type-name">{traitType.toUpperCase()}</span>
                                    <span className="selected-trait-value">{selectedVariants[traitType]?.split('/').pop()?.replace(/\.(png|gif)$/, '') || 'None'}</span>
                                </div>
                            ))}
                        </div>
    
                        <div className="trait-variants-display-area">
                            {activeTraitSection && customizationOptions[activeTraitSection] ? (
                                <div className="variants-grid">
                                    {customizationOptions[activeTraitSection].variants.map((variant) => (
                                        <div
                                            key={variant.imageUrl}
                                            className={`variant-item ${selectedVariants[activeTraitSection] === variant.imageUrl ? 'selected' : ''}`}
                                            onClick={() => handleVariantChange(activeTraitSection, variant)}
                                        >
                                            <img src={`${BACKEND_BASE_URL}${variant.imageUrl}`} alt={variant.name} width={THUMBNAIL_SIZE} height={THUMBNAIL_SIZE} className="variant-thumbnail" style={{ imageRendering: 'pixelated' }} />
                                            <p className="variant-name">{variant.name}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="no-trait-selected">Selecciona una categoría para ver las opciones.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}