// src/app/page.tsx

"use client"
import React, { useState, useEffect } from 'react';

// --- Interfaces para tipado ---
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

// --- Componente Principal de la Página ---
export default function NftCustomizerPage() {
  const [nftId, setNftId] = useState<string>('');
  const [inputNftId, setInputNftId] = useState<string>('');
  const [customizationOptions, setCustomizationOptions] = useState<CustomizationOptions | null>(null);
  
  // Este estado ahora guarda las piezas que el usuario ha seleccionado explícitamente
  const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
  
  // Este estado guarda las URLs de las capas que se deben mostrar en el lienzo
  const [displayedLayers, setDisplayedLayers] = useState<string[]>([]);
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTraitSection, setActiveTraitSection] = useState<string | null>(null);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
  const BACKEND_BASE_URL = 'http://localhost:3001';

  // Cargar datos iniciales del NFT (sin mostrar las piezas)
  useEffect(() => {
    if (!nftId) return;

    const loadNftData = async () => {
      setLoading(true);
      setError(null);
      setCustomizationOptions(null);
      setDisplayedLayers([]); // Aseguramos que el lienzo esté vacío al cargar
      setSelectedVariants({}); // Limpiamos selecciones previas

      try {
        const optionsResponse = await fetch(`${BACKEND_URL}/nft/${nftId}/customize-options`);
        if (!optionsResponse.ok) {
          throw new Error(`Error al cargar opciones: ${optionsResponse.status}`);
        }
        const data: CustomizationOptions = await optionsResponse.json();
        setCustomizationOptions(data);

        // Preparamos un objeto con los valores por defecto del NFT, pero no los mostramos aún
        const initialDefaults: { [key: string]: string } = {};
        for (const traitType in data) {
          initialDefaults[traitType] = data[traitType].currentValue || data[traitType].variants[0]?.name || 'None';
        }
        // Este estado podría servir para un botón de "reset" en el futuro
        // setInitialVariants(initialDefaults); 

        if (Object.keys(data).length > 0) {
          setActiveTraitSection(Object.keys(data)[0]);
        }
        
      } catch (e: any) {
        console.error("Error cargando datos del NFT:", e);
        setError(`Falló la carga de datos del NFT: ${e.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadNftData();
  }, [nftId, BACKEND_URL]);

  // Función que actualiza el lienzo con las piezas seleccionadas
  const updateCanvas = async (currentSelections: { [key: string]: string }) => {
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/nft/get-layers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedVariants: currentSelections }),
      });

      if (!response.ok) {
        throw new Error(`Error al obtener las capas: ${response.statusText}`);
      }

      const data = await response.json();
      const newLayers: string[] = data.layers || [];
      
      // Mapeamos a URLs completas y actualizamos el lienzo de una vez
      const fullUrlLayers = newLayers.map(layerUrl => `${BACKEND_BASE_URL}${layerUrl}`);
      setDisplayedLayers(fullUrlLayers);

    } catch (e: any) {
      console.error("Error actualizando el lienzo:", e);
      setError(`Falló la actualización de capas: ${e.message}`);
    }
  };

  // Manejar el clic en una nueva pieza
  const handleVariantChange = (traitType: string, newVariantName: string) => {
    // Si el usuario vuelve a hacer clic en la misma pieza, la quita (la deselecciona)
    const isDeselecting = selectedVariants[traitType] === newVariantName;
    
    const updatedVariants = { ...selectedVariants };

    if (isDeselecting) {
      delete updatedVariants[traitType];
    } else {
      updatedVariants[traitType] = newVariantName;
    }
    
    setSelectedVariants(updatedVariants);
    updateCanvas(updatedVariants);
  };

  const handleLoadNft = () => {
    const trimmedId = inputNftId.trim();
    if (trimmedId && trimmedId !== nftId) {
      setNftId(trimmedId);
    }
  };

  const handleInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLoadNft();
  };

  // --- RENDERIZADO ---

  if (!nftId) {
    return (
      <div className="initial-state">
        <h1 className="main-title">NFT DRESSROOM</h1>
        <div className="nft-id-input-section">
          <input 
            type="text" 
            value={inputNftId} 
            onChange={(e) => setInputNftId(e.target.value)}
            onKeyPress={handleInputKeyPress}
            placeholder="Ingresa un ID de NFT"
            className="nft-id-input"
          />
          <button onClick={handleLoadNft} className="load-nft-button">Cargar NFT</button>
        </div>
      </div>
    );
  }

  return (
    <div className="customizer-layout">
      <h1 className="main-title">CUSTOMIZE: PRIMAL #{nftId}</h1>
      
      <div className="nft-id-input-section">
        <input 
          type="text" 
          value={inputNftId} 
          onChange={(e) => setInputNftId(e.target.value)}
          onKeyPress={handleInputKeyPress}
          placeholder="Ingresa otro ID"
          className="nft-id-input"
        />
        <button onClick={handleLoadNft} className="load-nft-button">Cargar NFT</button>
        <button onClick={() => setNftId('')} className="back-button">← Nueva Búsqueda</button>
      </div>

      {loading && <div className="loading-message">Cargando...</div>}
      {error && <div className="error-message">Error: {error}</div>}
      
      {!loading && !error && customizationOptions && (
        <div className="content-area">
          <div className="left-column">
            {/* Contenedor de las capas del NFT */}
            <div 
              className="nft-display-wrapper" 
              style={{ position: 'relative', width: NFT_DISPLAY_SIZE, height: NFT_DISPLAY_SIZE, border: '1px solid #333' }}
            >
              {displayedLayers.map((layerSrc, index) => (
                <img
                  key={layerSrc} // Usar la URL como key es más estable
                  src={layerSrc}
                  alt={`Capa ${index + 1}`}
                  width={NFT_DISPLAY_SIZE}
                  height={NFT_DISPLAY_SIZE}
                  className="nft-image-layer"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }}
                />
              ))}
              {displayedLayers.length === 0 && !loading && (
                <div className="nft-placeholder-main" style={{ width: NFT_DISPLAY_SIZE, height: NFT_DISPLAY_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                  Selecciona una pieza para empezar
                </div>
              )}
            </div>
            
            <div className="action-buttons">
              <button className="action-button">EXPORT GIF</button>
              <button className="action-button">SUBMIT</button>
            </div>
          </div>

          <div className="right-column">
            <div className="trait-category-selector">
              {Object.keys(customizationOptions).map((traitType) => (
                <div 
                  key={traitType} 
                  className={`trait-category-item ${activeTraitSection === traitType ? 'active' : ''}`}
                  onClick={() => setActiveTraitSection(traitType)}
                >
                  <span className="trait-type-name">{traitType.toUpperCase()}</span>
                  <span className="selected-trait-value">{selectedVariants[traitType] || 'None'}</span>
                </div>
              ))}
            </div>

            <div className="trait-variants-display-area">
              {activeTraitSection && customizationOptions[activeTraitSection] ? (
                <div className="variants-grid">
                  {customizationOptions[activeTraitSection].variants.map((variant) => (
                    <div 
                      key={variant.name} 
                      className={`variant-item ${selectedVariants[activeTraitSection] === variant.name ? 'selected' : ''}`}
                      onClick={() => handleVariantChange(activeTraitSection, variant.name)}
                    >
                      <img
                        src={`${BACKEND_BASE_URL}${variant.imageUrl}`}
                        alt={variant.name} 
                        width={THUMBNAIL_SIZE} 
                        height={THUMBNAIL_SIZE} 
                        className="variant-thumbnail"
                      />
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
