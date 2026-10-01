// Pantalla "Select your NFT" (isla de React).
import { useEffect, useState, useMemo } from 'react';
import { goTo } from '@/lib/navigation';
import { FiChevronDown } from 'react-icons/fi';
import { useAccount, useDisconnect } from 'wagmi';
import { useUserNFTs } from '@/hooks/cultomizer/useUserNFTs';
import { useAutoNFTDetection } from '@/hooks/cultomizer/useAutoNFTDetection';
import WelcomeNFTs from '@/components/cultomizer/WelcomeNFTs';
import NetworkSwitcher from '@/components/cultomizer/NetworkSwitcher';
import { rememberPrimal } from '@/lib/cultomizer/avatarPrimal';

interface NftVerificationResult {
    ok: boolean;
    tokenId: string;
    address?: string;
    owner?: string;
    balance?: number;
    isOwner?: boolean;
    error?: string;
}

/// `demo` rellena la grilla con NFTs inventados para ver el layout sin wallet.
/// Solo llega en dev, via `?demo=N` (ver SelectorGate).
export default function SelectorPage({ demo }: { demo?: number }) {
    const { disconnect } = useDisconnect();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'id' | 'name'>('id');
    const [verificationResult, setVerificationResult] =
        useState<NftVerificationResult | null>(null);

    const { address, status } = useAccount();
    const reales = useUserNFTs();
    const { balance, refreshNfts, checkSpecificNFT } = reales;
    const demoNfts = useMemo(
        () =>
            demo
                ? Array.from({ length: demo }, (_, i) => {
                      const tokenId = String(i + 1);
                      return {
                          id: tokenId,
                          tokenId,
                          name: `Primal Cult #${tokenId}`,
                          imageUrl: `https://ipfs.primalcult.xyz/images/${tokenId}.gif`,
                      };
                  })
                : null,
        [demo]
    );
    const nfts = demoNfts ?? reales.nfts;
    const isLoading = demoNfts ? false : reales.isLoading;
    const error = demoNfts ? null : reales.error;
    const { isFirstConnection, detectionComplete } = useAutoNFTDetection();
    const [showWelcome, setShowWelcome] = useState(false);

    // La redireccion cuando no hay wallet vive en SelectorGate, que es quien
    // monta este componente: aca ya se asume conectada.

    // Filtrar y ordenar NFTs
    const filteredAndSortedNfts = useMemo(() => {
        let filtered = nfts;

        // Filtrar por término de búsqueda
        if (searchTerm) {
            filtered = filtered.filter(
                (nft) =>
                    nft.tokenId.includes(searchTerm) ||
                    nft.name?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Ordenar
        filtered = [...filtered].sort((a, b) => {
            if (sortBy === 'id') {
                return parseInt(a.tokenId) - parseInt(b.tokenId);
            } else {
                return (a.name || '').localeCompare(b.name || '');
            }
        });

        return filtered;
    }, [nfts, searchTerm, sortBy]);

    // Esta es la unica pantalla que ya pago el costo de buscar los NFTs de la
    // wallet, asi que deja el primero anotado: el header lo usa como foto de
    // perfil sin tener que volver a buscar en cada pantalla.
    useEffect(() => {
        const primero = nfts[0];
        if (address && primero) {
            rememberPrimal(address, {
                tokenId: primero.tokenId,
                imageUrl: primero.imageUrl,
            });
        }
    }, [address, nfts]);

    // El customizer es una ruta de este mismo proyecto. Antes esto miraba una
    // variable de entorno para decidir si saltar a otro dominio, porque vivian
    // separados.
    const handleSelectNft = (tokenId: string) => {
        goTo(`/cultomizer/edit?tokenId=${tokenId}`);
    };

    const handleDisconnect = () => {
        disconnect();
        goTo('/cultomizer');
    };

    const handleRefresh = () => {
        setVerificationResult(null);
        refreshNfts();
    };

    // Mostrar bienvenida cuando se detecten NFTs por primera vez
    // DESHABILITADO: Modal de bienvenida eliminado
    // useEffect(() => {
    //   if (detectionComplete && nfts.length > 0 && !showWelcome) {
    //     setShowWelcome(true);
    //   }
    // }, [detectionComplete, nfts.length, showWelcome]);

    // Función para verificar NFT específico manualmente
    const handleCheckNFT = async (tokenId: string) => {
        if (address) {
            console.log(`🔍 Verificando NFT #${tokenId} manualmente...`);
            const result = await checkSpecificNFT(tokenId);
            if (result) {
                setVerificationResult(result);
            }
        }
    };

    const nftToVerify = nfts[0]?.tokenId || '56';

    if (status === 'connecting' || status === 'reconnecting') {
        return (
            <div className="min-h-[calc(100vh-8rem)] text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow mx-auto mb-4"></div>
                    <div className="font-accent uppercase text-xl sm:text-2xl text-lightblue">
                        Connecting wallet...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <main className="w-full text-white">
            {/* Modal de bienvenida - DESHABILITADO */}
            {/* {showWelcome && address && (
        <WelcomeNFTs
          nftsFound={nfts.length}
          address={address}
          onDismiss={() => setShowWelcome(false)}
        />
      )} */}

            {/* Network Switcher */}
            <NetworkSwitcher />

            <div className="flex flex-col gap-6 sm:gap-8">
                {/* Header */}
                <div className="flex flex-col justify-center gap-6">
                    <div data-anim="intro">
                        <h1 className="font-accent uppercase text-yellow text-5xl sm:text-7xl">
                            Select your NFT
                        </h1>
                        <p className="text-lightblue text-base sm:text-lg md:text-xl mt-3 sm:mt-4 max-w-3xl">
                            Choose the Primal you want to modify in the
                            Cultomizer.
                        </p>
                    </div>

                    {verificationResult && (
                        <div
                            className={`rounded-2xl border p-4 sm:p-5 max-w-xl ${verificationResult.ok ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/40'}`}
                        >
                            <div
                                className={`font-semibold text-base sm:text-lg mb-2 ${verificationResult.ok ? 'text-emerald-300' : 'text-red-300'}`}
                            >
                                {verificationResult.ok
                                    ? `NFT #${verificationResult.tokenId} verificado`
                                    : `No se pudo verificar el NFT #${verificationResult.tokenId}`}
                            </div>
                            {verificationResult.ok ? (
                                <div className="space-y-1 text-sm sm:text-base text-white/85">
                                    <div>Owner: {verificationResult.owner}</div>
                                    <div>
                                        Your wallet:{' '}
                                        {verificationResult.address}
                                    </div>
                                    <div>
                                        Are you the owner?:{' '}
                                        {verificationResult.isOwner
                                            ? 'YES'
                                            : 'NO'}
                                    </div>
                                    <div>
                                        Total balance:{' '}
                                        {verificationResult.balance} NFTs
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm sm:text-base text-red-200">
                                    {verificationResult.error ||
                                        'Error desconocido al verificar el NFT.'}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Controles de búsqueda y filtros */}
                {!isLoading && !error && nfts.length > 0 && (
                    <div className="bg-darkblue rounded-2xl px-4 py-4 sm:px-5 shadow-lg shadow-darkblue/50">
                        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                            <input
                                type="text"
                                placeholder="Search by token ID or name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full sm:max-w-2xl bg-lightblue text-darkblue placeholder-darkblue font-accent leading-tight rounded-md px-3 pt-1 pb-1.5 focus:outline-none transition-all duration-200"
                            />
                            <div className="flex items-center justify-between gap-6 sm:ml-auto">
                                {/* Sin la flecha nativa: su alto fijo cortaba el texto en
                                    Sunzone. La flecha se dibuja aparte. */}
                                <div className="relative">
                                <select
                                    value={sortBy}
                                    onChange={(e) =>
                                        setSortBy(
                                            e.target.value as 'id' | 'name'
                                        )
                                    }
                                    className="appearance-none bg-lightblue text-darkblue font-accent leading-tight rounded-md pl-3 pr-8 pt-1 pb-1.5 cursor-pointer focus:outline-none hover:bg-yellow transition-all duration-200"
                                >
                                    <option value="id">Sort by ID</option>
                                    <option value="name">Sort by Name</option>
                                </select>
                                <FiChevronDown aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-darkblue" />
                                </div>
                                <div className="text-xs text-lightblue/80 whitespace-nowrap sm:min-w-28 sm:text-right">
                                    {filteredAndSortedNfts.length} of{' '}
                                    {nfts.length} NFTs
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Estado de carga y errores */}
                {isLoading && (
                    <div className="flex items-center gap-3 rounded-2xl bg-darkblue px-4 py-3 shadow-lg shadow-darkblue/50">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow shrink-0"></div>
                        <span className="text-lightblue">
                            Detecting your NFTs...
                        </span>
                        <span className="text-lightblue/60 text-sm ml-auto whitespace-nowrap">
                            {balance} found
                        </span>
                    </div>
                )}

                {error && (
                    <div className="text-center py-16">
                        <div className="bg-darkblue rounded-2xl p-6 max-w-md mx-auto flex flex-col items-center gap-3 shadow-lg shadow-darkblue/50">
                            <div className="font-accent uppercase text-red text-lg">
                                Error
                            </div>
                            <div className="text-lightblue">{error}</div>
                            <button
                                onClick={handleRefresh}
                                className="bg-lightblue text-darkblue font-accent uppercase rounded-md px-3 pt-1 pb-1.5 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300"
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                )}

                {/* NFTs Grid */}
                {!isLoading && !error && (
                    <>
                        {nfts.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center py-10 text-center">
                                <div className="bg-darkblue rounded-2xl p-6 sm:p-8 max-w-md mx-auto shadow-lg shadow-darkblue/50">
                                    <div className="font-accent uppercase text-yellow text-xl mb-2">
                                        No NFTs found
                                    </div>
                                    <div className="text-lightblue/80 mb-4">
                                        This wallet has no NFTs from the Primal
                                        contract
                                    </div>
                                    <div className="text-sm text-lightblue/50">
                                        Detected balance: {balance} NFTs
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div data-anim-stagger="" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 lg:gap-6">
                                    {filteredAndSortedNfts.map((nft) => (
                                        <button
                                            key={nft.id}
                                            type="button"
                                            onClick={() =>
                                                handleSelectNft(nft.tokenId)
                                            }
                                            className="shadow-lg shadow-darkblue/50 group bg-darkblue rounded-xl sm:rounded-2xl p-2 pb-3 sm:p-3 sm:pb-4 flex flex-col items-center gap-2 sm:gap-3 cursor-pointer outline-none ring-yellow hover:ring-2 focus-visible:ring-2 hover:-translate-y-1 active:scale-97 transition-all duration-300"
                                        >
                                            <div className="w-full aspect-square rounded-lg overflow-hidden bg-blue">
                                                {nft.imageUrl ? (
                                                    <img
                                                        src={nft.imageUrl}
                                                        alt={
                                                            nft.name ||
                                                            `Primal Cult #${nft.tokenId}`
                                                        }
                                                        loading="lazy"
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center font-accent text-lightblue/40 text-2xl">
                                                        #{nft.tokenId}
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="font-accent uppercase text-yellow text-sm sm:text-base leading-none text-center">
                                                {nft.name ||
                                                    `Primal Cult #${nft.tokenId}`}
                                            </h3>
                                            <p className="text-xs text-lightblue/70 leading-none">
                                                Click to edit
                                            </p>
                                        </button>
                                    ))}
                                </div>

                                {/* Mensaje si no hay resultados en la búsqueda */}
                                {searchTerm &&
                                    filteredAndSortedNfts.length === 0 && (
                                        <div className="text-center py-8">
                                            <div className="text-lightblue/70">
                                                No NFTs were found matching
                                                &quot;{searchTerm}&quot;
                                            </div>
                                        </div>
                                    )}
                            </>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}
