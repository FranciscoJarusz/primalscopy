// Las regiones, con el lore del mapa. "etiqueta" es donde va el nombre, en
// coordenadas del mundo.
export const ZONAS = [
    {
        id: 'fogreach',
        days: 90,
        nombre: 'Fogreach',
        titulo: 'Fogreach Republic',
        lugar: 'West continent',
        lema: 'For the loyal ones. They work hard, then unwind with a beer at Cultbrew or the Primal Pour taverns once the rituals are done.',
        color: '#3b62f2',
        etiqueta: { x: 427, y: 571 },
    },
    {
        id: 'lornshore',
        days: 30,
        nombre: 'Lornshore',
        titulo: 'Lornshore State',
        lugar: 'Center of the east continent',
        lema: 'For the tryhards. Sharp minds, ritual focus only, and one goal: the biggest share of FOG.',
        color: '#19b387',
        etiqueta: { x: 1045, y: 463 },
    },
    {
        id: 'baum',
        days: 14,
        nombre: 'Baum',
        titulo: 'Baum Land',
        lugar: 'East and southeast',
        lema: 'The land of relief. Slow days, long breaks, and a permanent vacation.',
        color: '#ef5a3d',
        etiqueta: { x: 1298, y: 314 },
    },
    {
        id: 'varnoss',
        days: 7,
        nombre: 'Varnoss',
        titulo: 'Varnoss Island',
        lugar: 'South, isolated island',
        lema: 'For those who love a good brawl and are always sharpening their fight moves. Huge beer chuggers too.',
        color: '#9060f5',
        etiqueta: { x: 872, y: 738 },
    },
];

export type Zona = (typeof ZONAS)[number];
