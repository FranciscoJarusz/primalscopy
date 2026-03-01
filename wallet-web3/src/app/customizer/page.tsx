// src/app/customizer/page.tsx

"use client"

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

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
const LAYER_ORDER = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];

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

    const nftDisplayRef = useRef<HTMLDivElement>(null);

    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
    const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:3001';

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

    const handleBackToSelection = () => {
        router.push('/selector-nft');
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
                        <p className="text-blue-200 mt-2">Personaliza tu personaje</p>
                    </div>
                    <button 
                        onClick={handleBackToSelection}
                        className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-xl font-semibold transition-all duration-200"
                    >
                        ← Volver a la Selección
                    </button>
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
                            Cargar NFT
                        </button>
                    </div>
                </div>

                {/* Estados de carga y error */}
                {loading && (
                    <div className="text-center py-16">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <div className="text-blue-200 text-xl">Cargando NFT...</div>
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
                                <h3 className="text-xl font-semibold mb-4 text-center">Vista Previa</h3>
                                <div 
                                    ref={nftDisplayRef} 
                                    className="relative mx-auto" 
                                    style={{ width: NFT_DISPLAY_SIZE, height: NFT_DISPLAY_SIZE }}
                                >
                                    {displayedLayers.map((layerSrc, index) => (
                                        <img 
                                            key={index} 
                                            src={layerSrc} 
                                            alt={`Capa de NFT`} 
                                            width={NFT_DISPLAY_SIZE} 
                                            height={NFT_DISPLAY_SIZE} 
                                            className="absolute top-0 left-0" 
                                            style={{ imageRendering: 'pixelated' }} 
                                        />
                                    ))}
                                </div>
                                <div className="text-center mt-4">
                                    <div className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                                        allAssetsSelected 
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                                    }`}>
                                        {allAssetsSelected ? '✅ Completado' : '⚠️ Faltan traits'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Columna derecha - Selector de traits */}
                        <div className="lg:col-span-2">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                                <h3 className="text-xl font-semibold mb-6">Personalización</h3>
                                
                                {/* Selector de categorías */}
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {Object.keys(customizationOptions).map((traitType) => (
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
                                                    key={variant.imageUrl}
                                                    className={`cursor-pointer transition-all duration-200 transform hover:scale-105 ${
                                                        selectedVariants[activeTraitSection] === variant.imageUrl 
                                                            ? 'ring-2 ring-blue-500 scale-105' 
                                                            : ''
                                                    }`}
                                                    onClick={() => handleVariantChange(activeTraitSection, variant)}
                                                >
                                                    <div className="bg-white/10 rounded-lg p-2 mb-2">
                                                        <img 
                                                            src={`${BACKEND_BASE_URL}${variant.imageUrl}`} 
                                                            alt={variant.name} 
                                                            width={THUMBNAIL_SIZE} 
                                                            height={THUMBNAIL_SIZE} 
                                                            className="w-full h-auto rounded" 
                                                            style={{ imageRendering: 'pixelated' }} 
                                                        />
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