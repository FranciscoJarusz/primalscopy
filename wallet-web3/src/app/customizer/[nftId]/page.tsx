'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { config } from '@/config/env';

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

const LAYER_ORDER = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];
const NONE_SELECTION = '__NONE__';

const isNoneVariant = (variant: TraitVariant): boolean => {
    if (!variant) return true;
    if (variant.isNone) return true;
    return (variant.name || '').trim().toLowerCase() === 'none';
};

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

    // Ref para evitar que el efecto de autenticación recargue las opciones si ya están cargadas
    const loadedNftIdRef = useRef<string | null>(null);

    const BACKEND_URL = config.BACKEND_URL;
    const BACKEND_BASE_URL = config.BACKEND_BASE_URL;

    const getVariantSelectionValue = (variant: TraitVariant): string => variant.imageUrl || NONE_SELECTION;

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
                // Solo cargar opciones si no se han cargado antes para este NFT.
                // En móvil, isConnected puede fluctuar brevemente (WalletConnect) y
                // volver a llamar a loadCustomizationOptions resetearía selectedVariants.
                if (loadedNftIdRef.current !== nftId) {
                    loadedNftIdRef.current = nftId;
                    loadCustomizationOptions();
                }
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
                if (defaultVariant) initialSelections[traitType] = getVariantSelectionValue(defaultVariant);
            }
            setSelectedVariants(initialSelections);

            const firstAvailableSection = LAYER_ORDER.find(trait => sanitizedData[trait]) || Object.keys(sanitizedData)[0] || null;
            setActiveTraitSection(firstAvailableSection);
        } catch (_error: unknown) {
            setError(`Falló la carga de opciones de personalización para el NFT #${nftId}.`);
        } finally {
            setLoading(false);
        }
    };

    const displayedLayers = React.useMemo(() => {
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

    const allAssetsSelected = React.useMemo(() => {
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

    const handleExportGif = async () => {
        if (!allAssetsSelected) {
            alert('You must select a piece from each category to export.');
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
                <div className="text-white text-2xl">Loading...</div>
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
                        Back to Dashboard
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
                            ← Back to Dashboard
                        </button>
                        <h1 className="text-3xl font-bold text-white">
                            Customize: PrimaCult #{nftId}
                        </h1>
                    </div>

                    <div className="text-white">
                        <p className="text-sm text-blue-200">Wallet Connected</p>
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
                                <h3 className="text-2xl font-bold text-white mb-4">Preview</h3>
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
                                        {exportingGif ? `Exporting... ${Math.round(exportProgress)}%` : 'Export GIF'}
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
                                    {[...LAYER_ORDER, ...Object.keys(customizationOptions).filter(t => !LAYER_ORDER.includes(t))]
                                        .filter((traitType, index, arr) => arr.indexOf(traitType) === index)
                                        .filter((traitType) => Boolean(customizationOptions[traitType]))
                                        .map((traitType) => (
                                        <button
                                            key={traitType}
                                            className={`w-full text-left p-3 rounded-lg transition-colors ${activeTraitSection === traitType
                                                    ? 'bg-white text-blue-600'
                                                    : 'bg-white/10 text-white hover:bg-white/20'
                                                }`}
                                            onClick={() => setActiveTraitSection(traitType)}
                                        >
                                            <div className="font-semibold">{traitType.toUpperCase()}</div>
                                            <div className="text-sm opacity-75">
                                                {(selectedVariants[traitType]?.split('/').pop()?.replace(/\.(png|gif|bmp|webp)$/i, '') || '-')}
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
                                                key={`${activeTraitSection}-${variant.name}`}
                                                className={`p-3 rounded-lg transition-all ${selectedVariants[activeTraitSection] === getVariantSelectionValue(variant)
                                                        ? 'bg-white text-blue-600 ring-2 ring-blue-400'
                                                        : 'bg-white/10 text-white hover:bg-white/20'
                                                    }`}
                                                onClick={() => handleVariantChange(activeTraitSection, variant)}
                                            >
                                                {variant.imageUrl ? (
                                                    <img
                                                        src={variant.imageUrl.startsWith('http') ? variant.imageUrl : `${BACKEND_BASE_URL}${variant.imageUrl}`}
                                                        alt={variant.name}
                                                        className="w-full aspect-square object-cover rounded mb-2"
                                                        style={{ imageRendering: 'pixelated' }}
                                                    />
                                                ) : (
                                                    <div className="w-full aspect-square rounded mb-2 bg-white/10 flex items-center justify-center text-xs text-white/70">
                                                        {variant.name}
                                                    </div>
                                                )}
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
