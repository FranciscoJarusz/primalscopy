const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');
const primalThumbs = require('./primalThumbs');

const ANCHO = 1200;
const ALTO = 630;
const LADO = 450;
const MARGEN = 80;
const DIR = path.join(ASSETS_ROOT, 'og');
const ASSETS = path.join(__dirname, '..', 'assets');
const FUENTE = path.join(ASSETS, 'fonts', 'sunzone-v2.ttf');
const PATRON = path.join(ASSETS, 'brand', 'pattern.svg');
const LOGO = path.join(ASSETS, 'brand', 'logo.svg');
const AMARILLO = '#fdf468';
const CELESTE = '#dfe8ff';

const escapar = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function texto(contenido, { size, width, color = CELESTE, align = 'left' }) {
    return sharp({
        text: {
            text: `<span foreground="${color}">${escapar(contenido)}</span>`,
            font: `Sunzone ${size}`,
            fontfile: FUENTE,
            rgba: true,
            width,
            align,
            dpi: 72,
            wrap: 'word'
        }
    }).png().toBuffer();
}

const alto = async buffer => (await sharp(buffer).metadata()).height;
const ancho = async buffer => (await sharp(buffer).metadata()).width;

let fondoMemo = null;
async function fondo() {
    fondoMemo ??= sharp(PATRON).resize(ANCHO, ALTO, { fit: 'cover' }).png().toBuffer();
    return fondoMemo;
}

let logoMemo = null;
async function logo(anchoLogo) {
    logoMemo ??= sharp(LOGO, { density: 300 }).resize({ width: anchoLogo }).png().toBuffer();
    return logoMemo;
}

async function redondeada(buffer, lado, radio) {
    const mascara = Buffer.from(`<svg width="${lado}" height="${lado}"><rect width="${lado}" height="${lado}" rx="${radio}" fill="#fff"/></svg>`);
    return sharp(buffer)
        .resize(lado, lado, { fit: 'cover' })
        .composite([{ input: mascara, blend: 'dest-in' }])
        .png()
        .toBuffer();
}

async function imagenPrimal(tokenId, lado, radio) {
    let archivo = null;
    for (const tamano of [512, 384, 192]) {
        try {
            archivo = await primalThumbs.miniatura(tokenId, tamano);
            break;
        } catch (error) {
            if (tamano === 192) throw error;
        }
    }
    return redondeada(fs.readFileSync(archivo), lado, radio);
}

async function huella(tokenId) {
    if (!tokenId) return null;
    try {
        const archivo = await primalThumbs.miniatura(tokenId, 512);
        return fs.readFileSync(`${archivo}.json`, 'utf8');
    } catch {
        return null;
    }
}

function marco(lado, radio) {
    return Buffer.from(`<svg width="${lado + 24}" height="${lado + 24}"><rect x="0" y="0" width="${lado + 24}" height="${lado + 24}" rx="${radio + 10}" fill="#090050"/></svg>`);
}

async function apilar(bloques, separacion) {
    const altos = await Promise.all(bloques.map(alto));
    return { altos, total: altos.reduce((a, b) => a + b, 0) + separacion * (bloques.length - 1) };
}

async function guardar(nombre, datos, generar) {
    const clave = crypto.createHash('sha1').update(JSON.stringify(datos)).digest('hex').slice(0, 12);
    const destino = path.join(DIR, `${nombre}-${clave}.png`);
    if (fs.existsSync(destino)) return destino;
    const png = await generar();
    fs.mkdirSync(DIR, { recursive: true });
    for (const viejo of fs.readdirSync(DIR)) {
        if (viejo.startsWith(`${nombre}-`)) fs.rmSync(path.join(DIR, viejo), { force: true });
    }
    writeAtomic(destino, png);
    return destino;
}

async function conImagenALaIzquierda(tokenId, lineas, pie) {
    const x = MARGEN + LADO + 24 + 60;
    const anchoTexto = ANCHO - x - MARGEN;
    const radio = 36;
    const bloques = await Promise.all(lineas.map(l => texto(l.texto, { ...l, width: anchoTexto })));
    const separacion = 18;
    const { altos, total } = await apilar(bloques, separacion);
    const capas = [];
    const topImagen = Math.round((ALTO - LADO - 24) / 2);
    capas.push({ input: marco(LADO, radio), left: MARGEN, top: topImagen });
    if (tokenId) capas.push({ input: await imagenPrimal(tokenId, LADO, radio), left: MARGEN + 12, top: topImagen + 12 });
    let y = Math.round((ALTO - total) / 2) - 20;
    bloques.forEach((b, i) => {
        capas.push({ input: b, left: x, top: y });
        y += altos[i] + separacion;
    });
    if (pie?.length) {
        const fila = await Promise.all(pie.slice(0, 5).map(id => imagenPrimal(id, 72, 12)));
        fila.forEach((img, i) => capas.push({ input: img, left: x + i * 84, top: Math.min(y + 8, ALTO - 72 - 110) }));
    }
    const marca = await logo(170);
    capas.push({ input: marca, left: ANCHO - MARGEN - 170, top: ALTO - MARGEN - (await alto(marca)) + 20 });
    const sitio = await texto('PRIMALCULT.XYZ', { size: 30, color: AMARILLO, width: 400 });
    capas.push({ input: sitio, left: x, top: ALTO - MARGEN - (await alto(sitio)) + 14 });
    return sharp(await fondo()).composite(capas).png().toBuffer();
}

const numero = n => Number(n).toLocaleString('en-US');
const porcentaje = (n, total) => `${((n / total) * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

async function tarjetaPrimal(ficha, dueno) {
    const unico = ficha.attributes.find(a => a.trait_type === '1/1');
    const raros = ficha.attributes
        .filter(a => a.trait_type !== '1/1')
        .sort((a, b) => a.count - b.count)
        .slice(0, 3)
        .map(a => `${a.value} ${porcentaje(a.count, ficha.total)}`.toUpperCase());
    const datos = { v: 3, id: ficha.id, image: ficha.image, huella: await huella(ficha.id), rank: ficha.rank, total: ficha.total, raros, unico: unico?.value, dueno };
    return guardar(`primal-${ficha.id}`, datos, () => conImagenALaIzquierda(ficha.id, [
        { texto: 'PRIMAL CULT', size: 34 },
        { texto: `#${ficha.id}`, size: 130, color: AMARILLO },
        { texto: unico ? `1/1 · ${unico.value}`.toUpperCase() : `RARITY RANK #${numero(ficha.rank)} OF ${numero(ficha.total)}`, size: 36 },
        ...(unico ? [] : [{ texto: raros.join('\n'), size: 28, color: AMARILLO }]),
        ...(dueno ? [{ texto: `HELD BY ${dueno.startsWith('0x') ? dueno : dueno.toUpperCase()}`, size: 30 }] : [])
    ]));
}

async function tarjetaHolder(perfil) {
    const nombre = perfil.nickname ?? `${perfil.wallet.slice(0, 6)}...${perfil.wallet.slice(-4)}`;
    const primals = perfil.tokens.length;
    const fila = (perfil.profile.featured.length ? perfil.profile.featured : perfil.tokens.map(t => t.id))
        .filter(id => id !== perfil.profile.avatar)
        .slice(0, 5);
    const datos = { v: 2, nombre, avatar: perfil.profile.avatar, huella: await huella(perfil.profile.avatar), primals, fog: perfil.fog.balance, rank: perfil.rank, fila };
    return guardar(`holder-${perfil.wallet}`, datos, () => conImagenALaIzquierda(perfil.profile.avatar, [
        { texto: perfil.rank ? `HOLDER #${perfil.rank} OF ${numero(perfil.holders)}` : 'PRIMAL CULT HOLDER', size: 30 },
        { texto: perfil.nickname ? nombre.toUpperCase() : nombre, size: nombre.length > 12 ? 72 : 96, color: AMARILLO },
        { texto: `${numero(primals)} PRIMAL${primals === 1 ? '' : 'S'}  ·  ${numero(perfil.fog.balance)} FOG`, size: 36 }
    ], fila));
}

async function tarjetaPagina({ titulo, subtitulo, primals }) {
    const capas = [];
    const lado = 230;
    const separacion = 26;
    const [t, sub, ...imagenes] = await Promise.all([
        texto(titulo.toUpperCase(), { size: titulo.length > 12 ? 84 : 120, color: AMARILLO, width: ANCHO - 2 * MARGEN, align: 'center' }),
        texto(subtitulo.toUpperCase(), { size: 40, width: ANCHO - 2 * MARGEN, align: 'center' }),
        ...primals.slice(0, 4).map(f => redondeada(fs.readFileSync(f), lado, 28))
    ]);
    const [anchoT, anchoS, altoT, altoS] = await Promise.all([ancho(t), ancho(sub), alto(t), alto(sub)]);
    const total = altoT + 12 + altoS + 56 + lado;
    let y = Math.round((ALTO - total) / 2);
    capas.push({ input: t, left: Math.round((ANCHO - anchoT) / 2), top: y });
    y += altoT + 12;
    capas.push({ input: sub, left: Math.round((ANCHO - anchoS) / 2), top: y });
    y += altoS + 56;
    const anchoFila = imagenes.length * lado + (imagenes.length - 1) * separacion;
    imagenes.forEach((img, i) => {
        capas.push({ input: img, left: Math.round((ANCHO - anchoFila) / 2) + i * (lado + separacion), top: y });
    });
    return sharp(await fondo()).composite(capas).png().toBuffer();
}

module.exports = { tarjetaPrimal, tarjetaHolder, tarjetaPagina };
