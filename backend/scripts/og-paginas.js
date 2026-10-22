const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { tarjetaPagina } = require('../lib/ogCards');

const WEB = path.join(__dirname, '..', '..', 'web', 'public');
const PRIMALS = path.join(WEB, 'images', 'primals');
const DESTINO = path.join(WEB, 'og');

const PAGINAS = [
    { slug: 'explore', titulo: 'Explore', subtitulo: 'Every Primal in the cult', primals: [1, 15, 100, 1500] },
    { slug: 'stats', titulo: 'Stats', subtitulo: 'Primal Cult in numbers', primals: [10, 1501, 12, 1502] },
    { slug: 'staking', titulo: 'Staking', subtitulo: 'Train your Primals, earn FOG', primals: [11, 1503, 13, 1504] },
    { slug: 'forge', titulo: 'Forge', subtitulo: "Roll your Primal's traits", primals: [14, 1505, 1506, 1507] },
    { slug: 'cultomizer', titulo: 'Cultomizer', subtitulo: 'Customize your Primals for free', primals: [1508, 1509, 1510, 1511] },
    { slug: 'recent', titulo: 'Recent customizations', subtitulo: 'The latest looks of the cult', primals: [1512, 1513, 1514, 1515] },
    { slug: 'shop', titulo: 'Shop', subtitulo: 'Spend your FOG on keys and more', primals: [1516, 1517, 1518, 1519] }
];

async function main() {
    fs.mkdirSync(DESTINO, { recursive: true });
    for (const pagina of PAGINAS) {
        const primals = pagina.primals.map(id => path.join(PRIMALS, `${id}.webp`)).filter(f => fs.existsSync(f));
        const png = await tarjetaPagina({ ...pagina, primals });
        const archivo = path.join(DESTINO, `${pagina.slug}.jpg`);
        await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toFile(archivo);
        console.log(`${pagina.slug}: ${Math.round(fs.statSync(archivo).size / 1024)} KB`);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
