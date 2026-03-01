'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { config } from '@/config/env';

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

interface NFT {
    id: string;
    tokenId: string;
    contractAddress: string;
    ownerAddress: string;
    metadata?: string;
    imageUrl?: string;
    traits?: string;
}

export default function CustomizerPage() {
    const { data: session, status } = useSession();
    const { address, isConnected } = useAccount();
    const router = useRouter();
    const params = useParams();
    const nftId = params.nftId as string;

    const [nft, setNft] = useState<NFT | null>(null);
    const [customizationOptions, setCustomizationOptions] = useState<CustomizationOptions | null>(null);
    const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [activeTraitSection, setActiveTraitSection] = useState<string | null>(null);
    const [exportingGif, setExportingGif] = useState<boolean>(false);
    const [exportProgress, setExportProgress] = useState<number>(0);

    const BACKEND_URL = config.BACKEND_URL;
    const BACKEND_BASE_URL = config.BACKEND_BASE_URL;

    // Verificar autenticación y propiedad del NFT
    useEffect(() => {
        if (status === 'loading') return;
        
        if (!session || !isConnected) {
            router.push('/');
            return;
        }

        // Verificar que el usuario posea este NFT
        const verifyNFTOwnership = async () => {
            try {
                const response = await fetch('/api/user/nfts');
                if (!response.ok) throw new Error('Error verificando NFTs');
                
                const data = await response.json();
                const userNFT = data.nfts.find((nft: NFT) => nft.tokenId === nftId);
                
                if (!userNFT) {
                    setError('No posees este NFT o no existe');
                    setLoading(false);
                    return;
                }

                setNft(userNFT);
                loadCustomizationOptions();
            } catch (err) {
                console.error('Error verificando propiedad:', err);
                setError('Error al verificar la propiedad del NFT');
                setLoading(false);
            }
        };

        verifyNFTOwnership();
    }, [session, status, isConnected, router, nftId]);

    const loadCustomizationOptions = async () => {
        try {
            setLoading(true);
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
            setError(`Falló la carga de opciones de personalización para el NFT #${nftId}.`);
        } finally {
            setLoading(false);
        }
    };

    const displayedLayers = React.useMemo(() => {
        return Object.keys(customizationOptions || {})
            .map(traitType => selectedVariants[traitType])
            .filter(Boolean)
            .map(layerUrl => `${BACKEND_BASE_URL}${layerUrl}`);
    }, [selectedVariants, customizationOptions, BACKEND_BASE_URL]);

    const allAssetsSelected = React.useMemo(() => {
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

    const handleExportGif = async () => {
        if (!allAssetsSelected) {
            alert('Debes seleccionar una pieza de cada categoría para exportar.');
            return;
        }
        // Aquí iría la lógica de exportación (similar a la del frontend original)
        setExportingGif(true);
        // ... implementar exportación
        setExportingGif(false);
    };

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] flex items-center justify-center">
                <div className="text-white text-2xl">Cargando...</div>
            </div>
        );
    }

    if (!session || !isConnected) {
        return null;
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] flex items-center justify-center">
                <div className="bg-[#1322D3]/50 p-8 rounded-2xl text-center max-w-md">
                    <h2 className="text-2xl font-bold text-white mb-4">Error</h2>
                    <p className="text-red-200 mb-6">{error}</p>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="bg-white text-blue-600 px-6 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
                    >
                        Volver al Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746]">
            {/* Header */}
            <header className="bg-[#1322D3]/80 backdrop-blur-sm p-6">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-white hover:text-blue-200 transition-colors"
                        >
                            ← Volver al Dashboard
                        </button>
                        <h1 className="text-3xl font-bold text-white">
                            Personalizar: PrimaCult #{nftId}
                        </h1>
                    </div>
                    
                    <div className="text-white">
                        <p className="text-sm text-blue-200">Wallet Conectada</p>
                        <p className="font-mono">{address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : ''}</p>
                    </div>
                </div>
            </header>

            {/* Contenido del customizador */}
            <main className="max-w-7xl mx-auto p-6">
                {!loading && !error && customizationOptions && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Columna izquierda - Vista previa */}
                        <div className="lg:col-span-2">
                            <div className="bg-[#1322D3]/50 p-6 rounded-2xl">
                                <h3 className="text-2xl font-bold text-white mb-4">Vista Previa</h3>
                                <div className="relative w-full max-w-md mx-auto aspect-square bg-gray-800 rounded-xl overflow-hidden">
                                    {displayedLayers.map((layerSrc, index) => (
                                        <img
                                            key={layerSrc}
                                            src={layerSrc}
                                            alt={`Capa ${index + 1}`}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            style={{ imageRendering: 'pixelated' }}
                                        />
                                    ))}
                                </div>
                                
                                <div className="mt-6 flex justify-center space-x-4">
                                    <button
                                        className="bg-white text-blue-600 px-6 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50"
                                        onClick={handleExportGif}
                                        disabled={exportingGif || !allAssetsSelected}
                                    >
                                        {exportingGif ? `Exportando... ${Math.round(exportProgress)}%` : 'Exportar GIF'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Columna derecha - Opciones de personalización */}
                        <div className="space-y-6">
                            {/* Selector de categorías */}
                            <div className="bg-[#1322D3]/50 p-4 rounded-2xl">
                                <h3 className="text-xl font-bold text-white mb-4">Categorías</h3>
                                <div className="space-y-2">
                                    {Object.keys(customizationOptions).map((traitType) => (
                                        <button
                                            key={traitType}
                                            className={`w-full text-left p-3 rounded-lg transition-colors ${
                                                activeTraitSection === traitType
                                                    ? 'bg-white text-blue-600'
                                                    : 'bg-white/10 text-white hover:bg-white/20'
                                            }`}
                                            onClick={() => setActiveTraitSection(traitType)}
                                        >
                                            <div className="font-semibold">{traitType.toUpperCase()}</div>
                                            <div className="text-sm opacity-75">
                                                {selectedVariants[traitType]?.split('/').pop()?.replace(/\.(png|gif)$/, '') || 'None'}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Variantes de la categoría seleccionada */}
                            {activeTraitSection && customizationOptions[activeTraitSection] && (
                                <div className="bg-[#1322D3]/50 p-4 rounded-2xl">
                                    <h3 className="text-xl font-bold text-white mb-4">
                                        {activeTraitSection.toUpperCase()}
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {customizationOptions[activeTraitSection].variants.map((variant) => (
                                            <button
                                                key={variant.imageUrl}
                                                className={`p-3 rounded-lg transition-all ${
                                                    selectedVariants[activeTraitSection] === variant.imageUrl
                                                        ? 'bg-white text-blue-600 ring-2 ring-blue-400'
                                                        : 'bg-white/10 text-white hover:bg-white/20'
                                                }`}
                                                onClick={() => handleVariantChange(activeTraitSection, variant)}
                                            >
                                                <img
                                                    src={`${BACKEND_BASE_URL}${variant.imageUrl}`}
                                                    alt={variant.name}
                                                    className="w-full h-20 object-cover rounded mb-2"
                                                    style={{ imageRendering: 'pixelated' }}
                                                />
                                                <div className="text-sm font-medium">{variant.name}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
