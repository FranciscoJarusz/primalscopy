// NFTCONTROLLER.JS - VERSIÓN FINAL Y LIMPIA
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const METADATA_BASE_URL = 'https://ipfs.primalcult.xyz/metadata/';
const ASSETS_PATH = path.join(__dirname, '../assets');
const GENERATED_IMAGES_PATH = path.join(__dirname, '../generated_images');
const NFT_WIDTH = 2000;
const NFT_HEIGHT = 2000;

async function getNftMetadata(nftId) {
  try {
    const { data } = await axios.get(`${METADATA_BASE_URL}${nftId}`);
    return data;
  } catch (err) {
    console.error(`[ERROR] No metadata for NFT ${nftId} →`, err.message);
    return null;
  }
}

async function getProxiedMetadata(req, res) {
  const { nftId } = req.params;
  const metadataUrl = `https://art.ipfsprimalcult.xyz/updating/metadata/${nftId}`;

  try {
    const { data } = await axios.get(metadataUrl);
    res.json(data);
  } catch (err) {
    console.error(`[ERROR] Proxy falló para NFT ${nftId} ->`, err.message);
    res.status(err.response?.status || 500).json({ error: 'No se pudo obtener la metadata externa.' });
  }
}

function getTraitVariants(traitType, traitValue) {
  const dir = path.join(ASSETS_PATH, 'traits', traitType, traitValue);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.png') || f.endsWith('.gif'));
}

async function getCustomizationOptions(req, res) {
  try {
    const { nftId } = req.params;
    const metadata = await getNftMetadata(nftId);
    if (!metadata) {
      return res.status(404).json({ error: 'Metadata not found' });
    }

    const customizationOptions = {};
    if (!metadata.attributes) {
      return res.json(customizationOptions);
    }

    const nftTraits = metadata.attributes.filter(attr =>
      attr.value && attr.value !== 'None' && attr.trait_type
    );

    for (const trait of nftTraits) {
      const traitType = trait.trait_type;
      const currentValue = trait.value;
      const files = getTraitVariants(traitType, currentValue);
      if (files.length === 0) {
        console.warn(`[WARN] No asset found for ${traitType} → ${currentValue}`);
        continue;
      }

      customizationOptions[traitType] = {
        currentValue,
        variants: [
          {
            name: currentValue,
            imageUrl: `/assets/traits/${traitType}/${currentValue}/${files[0]}`,
            isSelected: true
          }
        ]
      };
    }
    res.json(customizationOptions);
  } catch (error) {
    console.error(`[FATAL ERROR] en getCustomizationOptions para NFT ID ${req.params.nftId}:`, error);
    res.status(500).json({ error: 'Ocurrió un error interno en el servidor.' });
  }
}

async function generateAndSaveNftImage(req, res) {
  const { nftId, selectedVariants } = req.body;
  if (!nftId || !selectedVariants) {
    return res.status(400).json({ error: 'Missing params' });
  }

  const layerOrder = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];
  const layers = [];

  console.log('\n\n--- NUEVA GENERACIÓN (con loop clásico) ---');
  console.log('Variantes recibidas:', selectedVariants);

  // --- CAMBIO DE ESTRATEGIA: USANDO UN LOOP CLÁSICO 'for...i' ---
  for (let i = 0; i < layerOrder.length; i++) {
    const traitType = layerOrder[i];
    let value = selectedVariants[traitType];

    console.log(`\n[ITERACIÓN ${i+1}/${layerOrder.length}] Procesando Trait: ${traitType}`);

    if (!value || value === 'None') {
      console.log(`   -> Valor no encontrado o es 'None'. Saltando.`);
      continue;
    }
    value = value.toUpperCase();

    console.log(`   -> Valor a buscar: ${value}`);
    const variantDir = path.join(ASSETS_PATH, 'traits', traitType, value);
    console.log(`   1. Verificando carpeta: ${variantDir}`);

    if (!fs.existsSync(variantDir)) {
      console.log(`      -> ERROR: La carpeta no existe.`);
      continue;
    }
    console.log(`      -> OK: La carpeta existe.`);

    const files = getTraitVariants(traitType, value);
    console.log(`   2. Archivos encontrados: [${files.join(', ')}]`);

    if (files.length === 0) {
      console.log(`      -> ERROR: No se encontraron archivos .png o .gif.`);
      continue;
    }

    const imgPath = path.join(variantDir, files[0]);
    console.log(`   3. Usando archivo de imagen: ${imgPath}`);

    if (fs.existsSync(imgPath)) {
      console.log(`      -> ÉXITO: Capa encontrada y añadida.`);
      layers.push({ input: imgPath, top: 0, left: 0 });
    } else {
      console.log(`      -> ERROR: ¡La ruta final al archivo es inválida!`);
    }
  }
  // --- FIN DEL LOOP ---

  console.log(`\n--- PROCESO FINALIZADO ---`);
  console.log(`Total de capas encontradas: ${layers.length} / ${layerOrder.length}`);

  if (layers.length === 0) {
    return res.status(500).json({ error: 'No se encontraron capas para generar la imagen.' });
  }

  // ... (El resto del código para generar la imagen con sharp sigue igual)
  if (!fs.existsSync(GENERATED_IMAGES_PATH)) {
    fs.mkdirSync(GENERATED_IMAGES_PATH, { recursive: true });
  }

  const fileName = `custom_${nftId}_${Date.now()}.png`;
  const outputPath = path.join(GENERATED_IMAGES_PATH, fileName);

  try {
    await sharp({
      create: { width: NFT_WIDTH, height: NFT_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(layers).png().toFile(outputPath);
  } catch (err) {
    return res.status(500).json({ error: 'Image generation failed', detail: err.message });
  }

  res.json({ imageUrl: `/generated_images/${fileName}` });
}
async function getNftLayers(req, res) {
  const { selectedVariants } = req.body;
  if (!selectedVariants) {
    return res.status(400).json({ error: 'Missing selectedVariants' });
  }

  const layerOrder = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];
  const layerUrls = [];

  layerOrder.forEach(traitType => {
    let value = selectedVariants[traitType];
    if (!value || value === 'None') return;

    value = value.toUpperCase();
    const variantDir = path.join(ASSETS_PATH, 'traits', traitType, value);

    if (fs.existsSync(variantDir)) {
      const files = getTraitVariants(traitType, value);
      if (files.length > 0) {
        // Construimos la URL pública que el frontend puede usar
        const imageUrl = `/assets/traits/${traitType}/${value}/${files[0]}`;
        layerUrls.push(imageUrl);
      }
    }
  });

  res.json({ layers: layerUrls });
}
// ESTE DEBE SER EL ÚNICO EXPORT EN TODO EL ARCHIVO
module.exports = {
  getCustomizationOptions,
  generateAndSaveNftImage,
  getProxiedMetadata,
   getNftLayers
};