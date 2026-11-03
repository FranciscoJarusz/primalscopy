import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import type { CartaPack, Rareza } from '@/lib/packs';
import {
    prepararTexturas,
    texturaDorsoGuardada,
    texturaFrente,
    texturaHalo,
    texturasPack,
    type MapaDistancia,
} from './texturas3d';

const PH = 3.5;
const PW = (PH * 2212) / 3490;
const CORTE = 0.78;
const PROF = 0.12;
const CW = 2.2;
const CH = (CW * 2250) / 1621;
const VUELTA = Math.PI * 2;
const BLOOM_BASE = 0.45;
const AURA_ESCALA = 2.6;
const DISTANCIA = 10.5;
const SUBIR = 0.55;
const BRILLO_CARTAS = 1;
const MAX_PARTICULAS = 2000;

const DORADOS = ['#fff6c8', '#ece3a8', '#dcd7b7', '#aea35d', '#c9bb6c'];
const CHISPAS: Record<Rareza, string[]> = {
    common: ['#6e6c5c', '#dcd7b7'],
    uncommon: ['#6e6c5c', '#dcd7b7', '#aea35d'],
    rare: ['#dcd7b7', '#fff6c8', '#ffffff'],
    epic: DORADOS,
    legendary: [...DORADOS, '#ffffff'],
    chosen: ['#ffe27a', '#fff6c8', '#ffffff', '#ffd23f', '#f3dd85'],
};
const FOIL: Record<Rareza, { color: string; fuerza: number; iris: number }> = {
    common: { color: '#000000', fuerza: 0, iris: 0 },
    uncommon: { color: '#000000', fuerza: 0, iris: 0 },
    rare: { color: '#dcd7b7', fuerza: 0.55, iris: 0 },
    epic: { color: '#ece3a8', fuerza: 0.75, iris: 0.1 },
    legendary: { color: '#fff2a8', fuerza: 0.95, iris: 0.3 },
    chosen: { color: '#ffe27a', fuerza: 1.15, iris: 0.45 },
};
const AURA: Record<Rareza, { color: string; fuerza: number; ritmo: number }> = {
    common: { color: '#000000', fuerza: 0, ritmo: 0 },
    uncommon: { color: '#000000', fuerza: 0, ritmo: 0 },
    rare: { color: '#dcd7b7', fuerza: 0.35, ritmo: 2.5 },
    epic: { color: '#aea35d', fuerza: 0.6, ritmo: 3 },
    legendary: { color: '#fff2a8', fuerza: 0.85, ritmo: 3.5 },
    chosen: { color: '#ffe27a', fuerza: 1, ritmo: 4.5 },
};

function geometriaPack(vMin: number, vMax: number, dist: MapaDistancia) {
    const alto = ((vMax - vMin) / 2) * PH;
    const geo = new THREE.PlaneGeometry(
        PW,
        alto,
        220,
        Math.max(6, Math.round(110 * (vMax - vMin)))
    );
    geo.translate(0, (((vMin + vMax) / 2) * PH) / 2, 0);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const s = x / PW + 0.5;
        const t = y / PH + 0.5;
        const v = Math.abs(y / (PH / 2));
        const cx = Math.min(
            dist.ancho - 1,
            Math.max(0, Math.round(s * dist.ancho - 0.5))
        );
        const cy = Math.min(
            dist.alto - 1,
            Math.max(0, Math.round((1 - t) * dist.alto - 0.5))
        );
        const adentro = Math.min(
            1,
            Math.max(0, dist.datos[cy * dist.ancho + cx] - 0.014) / 0.05
        );
        const z =
            v > 0.86
                ? 0
                : PROF *
                  Math.sqrt(1 - (1 - adentro) ** 2) *
                  Math.sqrt(Math.max(0, 1 - (v / 0.86) ** 8));
        pos.setZ(i, z);
        uv.setXY(i, s, t);
    }
    geo.computeVertexNormals();
    return geo;
}

const RAYOS_VERTICE = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RAYOS_FRAGMENTO = `
uniform float uOpacidad;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float a = atan(p.y, p.x);
    float finos = pow(0.5 + 0.5 * cos(a * 18.0), 10.0);
    float caida = smoothstep(1.0, 0.05, r) * smoothstep(0.0, 0.12, r);
    float nucleo = exp(-r * 7.0) * 0.5;
    float anchos = pow(0.5 + 0.5 * cos(a * 7.0 + 1.3), 6.0) * 0.5;
    float v = ((finos + anchos) * caida * 0.38 + nucleo * 0.7) * uOpacidad;
    gl_FragColor = vec4(uColor * v, 1.0);
}
`;

const AURA_FRAGMENTO = `
uniform vec3 uColor;
uniform float uOpacidad;
uniform vec2 uPlano;
uniform vec2 uCarta;
uniform float uRadio;
varying vec2 vUv;
void main() {
    vec2 p = (vUv - 0.5) * uPlano;
    vec2 q = abs(p) - uCarta + uRadio;
    float d = max(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadio, 0.0);
    float brillo = exp(-d * 3.0) * 0.75 + exp(-d * 1.2) * 0.25;
    vec2 b = min(vUv, 1.0 - vUv);
    brillo *= smoothstep(0.0, 0.18, min(b.x, b.y));
    float ruido = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    brillo = max(brillo + (ruido - 0.5) / 160.0, 0.0);
    gl_FragColor = vec4(uColor * brillo * uOpacidad, 1.0);
}
`;

const FOIL_DECLARACION = `
uniform float uFoil;
uniform vec3 uFoilColor;
uniform float uIris;
varying vec3 vNormalFoil;
`;

const FOIL_FRAGMENTO = `
if (uFoil > 0.0) {
    vec3 nf = normalize(vNormalFoil);
    float fase = (vMapUv.x * 0.8 + vMapUv.y * 0.5) * 1.5 + nf.x * 2.4 - nf.y * 1.6;
    float banda = pow(0.5 + 0.5 * cos(fase * 6.2831853), 8.0);
    float brillo = pow(0.5 + 0.5 * cos(fase * 3.1415927 + 1.0), 3.0) * 0.25;
    vec3 iris = 0.5 + 0.5 * cos(6.2831853 * (fase * 1.3 + vec3(0.0, 0.33, 0.67)));
    vec3 tinte = mix(uFoilColor, iris, uIris);
    float luz = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    outgoingLight += tinte * (banda + brillo) * uFoil * (0.4 + 0.6 * luz);
}
`;

interface Foil {
    fuerza: { value: number };
    color: { value: THREE.Color };
    iris: { value: number };
}

function materialFrente(mapa: THREE.Texture, foil: Foil) {
    const m = new THREE.MeshBasicMaterial({
        map: mapa,
        alphaTest: 0.5,
        color: new THREE.Color(BRILLO_CARTAS, BRILLO_CARTAS, BRILLO_CARTAS),
        toneMapped: false,
    });
    m.onBeforeCompile = (s) => {
        s.uniforms.uFoil = foil.fuerza;
        s.uniforms.uFoilColor = foil.color;
        s.uniforms.uIris = foil.iris;
        s.vertexShader = s.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vNormalFoil;')
            .replace(
                '#include <project_vertex>',
                '#include <project_vertex>\nvNormalFoil = normalize(normalMatrix * normal);'
            );
        s.fragmentShader = s.fragmentShader
            .replace('#include <common>', '#include <common>' + FOIL_DECLARACION)
            .replace('#include <opaque_fragment>', FOIL_FRAGMENTO + '#include <opaque_fragment>');
    };
    return m;
}

const ruido = (t: number, s: number) =>
    (Math.sin(t * 47 + s) * 0.5 +
        Math.sin(t * 71 + s * 1.7) * 0.3 +
        Math.sin(t * 113 + s * 2.3) * 0.2) *
    0.5;

function rectRedondeado(w: number, h: number, r: number) {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
}

function lienzoATextura(c: HTMLCanvasElement | HTMLImageElement, color = false) {
    const t = new THREE.Texture(c);
    t.needsUpdate = true;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

function gradienteHaz() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, 'rgba(255,246,200,1)');
    g.addColorStop(0.4, 'rgba(236,227,168,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
    const h = ctx.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)');
    h.addColorStop(0.5, 'rgba(0,0,0,0)');
    h.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 64, 256);
    return c;
}

function gradienteCostura() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 32;
    const ctx = c.getContext('2d')!;
    const v = ctx.createLinearGradient(0, 0, 0, 32);
    v.addColorStop(0, 'rgba(236,227,168,0)');
    v.addColorStop(0.4, 'rgba(236,227,168,0.5)');
    v.addColorStop(0.5, 'rgba(255,246,200,1)');
    v.addColorStop(0.6, 'rgba(236,227,168,0.5)');
    v.addColorStop(1, 'rgba(236,227,168,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 256, 32);
    const h = ctx.createLinearGradient(0, 0, 256, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)');
    h.addColorStop(0.06, 'rgba(0,0,0,0.35)');
    h.addColorStop(0.9, 'rgba(0,0,0,0.3)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 256, 32);
    return c;
}

export interface Ranura {
    x: number;
    y: number;
    alto: number;
}

export interface Eventos {
    destello: (opacidad: number, duracion: number) => void;
    sonido: (nombre: Sonido) => void;
}

export type Sonido =
    'rasgar' | 'subir' | 'salir' | `inicio-${Rareza}` | `impacto-${Rareza}`;

interface MaterialesCarta {
    frente: THREE.MeshBasicMaterial;
    dorso: THREE.MeshStandardMaterial;
    foil: Foil;
}

export class Escena3D {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    private composer: EffectComposer;
    private bloom: UnrealBloomPass;
    private reloj = new THREE.Clock();
    private cuadro = 0;
    private tiempo = 0;
    private observador: ResizeObserver;

    private pack = new THREE.Group();
    private tapa = new THREE.Group();
    private materialesPack: THREE.MeshPhysicalMaterial[] = [];
    private materialesTapa: THREE.MeshPhysicalMaterial[] = [];
    private cartas: THREE.Group[] = [];
    private pivotes: THREE.Group[] = [];
    private materiales: MaterialesCarta[] = [];
    private costuras: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
    private tapaOriginal: Float32Array[] = [];
    private rasgado = 0;
    private rayos!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    private haz!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private halo!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    private luces: THREE.Light[] = [];

    private particulas!: THREE.Points;
    private pos = new Float32Array(MAX_PARTICULAS * 3);
    private col = new Float32Array(MAX_PARTICULAS * 3);
    private base = new Float32Array(MAX_PARTICULAS * 3);
    private vel = new Float32Array(MAX_PARTICULAS * 3);
    private vida = new Float32Array(MAX_PARTICULAS);
    private vidaMax = new Float32Array(MAX_PARTICULAS);
    private vivas = 0;

    private reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    private inclinacion = { carta: -1, x: 0, y: 0 };
    private destruida = false;
    private enPack = true;
    private arrastrando = false;
    private giro = { x: 0, y: 0, vx: 0, vy: 0 };
    private carga = 0;
    private camara = { z: DISTANCIA, temblor: 0, lejos: DISTANCIA };
    private aura = { carta: -1, color: new THREE.Color(), fuerza: 0, ritmo: 0 };

    constructor(
        private contenedor: HTMLElement,
        private datos: CartaPack[],
        private eventos: Eventos
    ) {
        const tactil = matchMedia('(pointer: coarse)').matches;
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, tactil ? 1.25 : 1.5));
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.setClearColor('#000000');
        this.renderer.domElement.style.display = 'block';
        contenedor.appendChild(this.renderer.domElement);

        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(
            new RoomEnvironment(),
            0.04
        ).texture;
        this.scene.environmentIntensity = 0.9;
        pmrem.dispose();

        const clave = new THREE.DirectionalLight('#fff4d6', 2.2);
        clave.position.set(3, 4, 6);
        const contra = new THREE.DirectionalLight('#aea35d', 3);
        contra.position.set(-4, -2, -3);
        const ambiente = new THREE.AmbientLight('#ffffff', 0.15);
        this.luces = [clave, contra, ambiente];
        this.scene.add(clave, contra, ambiente);

        this.composer = new EffectComposer(
            this.renderer,
            new THREE.WebGLRenderTarget(1, 1, {
                samples: tactil ? 2 : 4,
                type: THREE.HalfFloatType,
            })
        );
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(
            new THREE.Vector2(1, 1),
            BLOOM_BASE,
            0.6,
            1
        );
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());

        this.observador = new ResizeObserver(() => this.ajustar());
        this.observador.observe(contenedor);
        this.ajustar();
    }

    async iniciar() {
        await prepararTexturas();
        if (this.destruida) return false;
        const [arte, dorsoCarta, ...frentes] = await Promise.all([
            texturasPack(),
            texturaDorsoGuardada(),
            ...this.datos.map((c) => texturaFrente(c)),
        ]);
        if (this.destruida) return false;

        const mFrente = new THREE.MeshPhysicalMaterial({
            map: lienzoATextura(arte.color, true),
            metalnessMap: lienzoATextura(arte.metal),
            metalness: 1,
            roughness: 0.32,
            emissive: new THREE.Color('#ffe9a0'),
            emissiveMap: lienzoATextura(arte.brillo),
            emissiveIntensity: 0,
            clearcoat: 0.6,
            clearcoatRoughness: 0.2,
            alphaTest: 0.5,
            alphaToCoverage: true,
            side: THREE.DoubleSide,
        });
        const mDorso = mFrente;
        this.materialesPack = [mFrente];
        this.materialesTapa = [mFrente.clone(), mFrente.clone()];
        for (const m of this.materialesTapa) m.transparent = true;

        const cuerpoGeo = geometriaPack(-1, CORTE, arte.distancia);
        const tapaGeo = geometriaPack(CORTE, 1, arte.distancia);
        this.pack.add(
            new THREE.Mesh(cuerpoGeo, mFrente),
            new THREE.Mesh(cuerpoGeo.clone().rotateY(Math.PI), mDorso)
        );
        this.tapa.add(
            new THREE.Mesh(tapaGeo, this.materialesTapa[0]),
            new THREE.Mesh(
                tapaGeo.clone().rotateY(Math.PI),
                this.materialesTapa[1]
            )
        );
        this.pack.add(this.tapa);
        this.scene.add(this.pack);

        this.tapaOriginal = this.tapa.children.map((h) =>
            ((h as THREE.Mesh).geometry.attributes.position.array as Float32Array).slice()
        );
        const costuraGeo = new THREE.PlaneGeometry(PW * 0.96, 0.3);
        costuraGeo.translate(PW * 0.48, 0, 0);
        const costura = new THREE.Mesh(
            costuraGeo,
            new THREE.MeshBasicMaterial({
                map: lienzoATextura(gradienteCostura(), true),
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            })
        );
        costura.position.set(-PW * 0.48, (CORTE * PH) / 2, 0);
        costura.scale.x = 0.001;
        this.costuras = [costura];
        this.pack.add(costura);

        const texDorso = lienzoATextura(dorsoCarta, true);
        const lado = new THREE.MeshStandardMaterial({
            color: '#aea35d',
            metalness: 1,
            roughness: 0.3,
        });
        const forma = rectRedondeado(CW, CH, CW * 0.05);
        const cara = new THREE.ShapeGeometry(forma, 12);
        const uv = cara.attributes.uv;
        const pos = cara.attributes.position;
        for (let k = 0; k < uv.count; k++)
            uv.setXY(k, pos.getX(k) / CW + 0.5, pos.getY(k) / CH + 0.5);
        const caraDorso = cara.clone().rotateY(Math.PI);
        const canto = new THREE.ExtrudeGeometry(
            rectRedondeado(CW * 0.994, CH * 0.994, CW * 0.05 * 0.994),
            {
                depth: 0.018,
                bevelEnabled: false,
                curveSegments: 12,
            }
        );
        canto.translate(0, 0, -0.009);
        this.datos.forEach((carta, i) => {
            const mapa = lienzoATextura(frentes[i], true);
            const f = FOIL[carta.rareza];
            const foil: Foil = {
                fuerza: { value: 0 },
                color: { value: new THREE.Color(f.color) },
                iris: { value: f.iris },
            };
            const m: MaterialesCarta = {
                foil,
                frente: materialFrente(mapa, foil),
                dorso: new THREE.MeshStandardMaterial({
                    map: texDorso,
                    roughness: 0.35,
                    metalness: 0.3,
                    emissive: new THREE.Color('#ffffff'),
                    emissiveMap: texDorso,
                    emissiveIntensity: 0,
                    alphaTest: 0.5,
                    alphaToCoverage: true,
                }),
            };
            const g = new THREE.Group();
            const pivote = new THREE.Group();
            const frente = new THREE.Mesh(cara, m.frente);
            frente.position.z = 0.0095;
            const dorso = new THREE.Mesh(caraDorso, m.dorso);
            dorso.position.z = -0.0095;
            pivote.add(frente, dorso, new THREE.Mesh(canto, lado));
            g.add(pivote);
            this.pivotes.push(pivote);
            g.position.set(0, -0.3, -i * 0.07);
            g.rotation.y = Math.PI;
            g.scale.setScalar(0.92);
            g.visible = false;
            this.scene.add(g);
            this.cartas.push(g);
            this.materiales.push(m);
        });

        const aditivo = (mapa: THREE.Texture) =>
            new THREE.MeshBasicMaterial({
                map: mapa,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
        this.rayos = new THREE.Mesh(
            new THREE.PlaneGeometry(26, 26),
            new THREE.ShaderMaterial({
                uniforms: {
                    uOpacidad: { value: 0 },
                    uColor: { value: new THREE.Color('#ece3a8') },
                },
                vertexShader: RAYOS_VERTICE,
                fragmentShader: RAYOS_FRAGMENTO,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        this.rayos.position.z = -4;
        const hazGeo = new THREE.PlaneGeometry(PW * 0.85, 6);
        hazGeo.translate(0, 3, 0);
        this.haz = new THREE.Mesh(
            hazGeo,
            aditivo(lienzoATextura(gradienteHaz(), true))
        );
        this.haz.position.set(0, (CORTE * PH) / 2, 0);
        this.haz.scale.y = 0;
        const texHalo = lienzoATextura(texturaHalo());
        this.halo = new THREE.Mesh(
            new THREE.PlaneGeometry(CW * AURA_ESCALA, CH * AURA_ESCALA),
            new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: new THREE.Color() },
                    uOpacidad: { value: 0 },
                    uPlano: {
                        value: new THREE.Vector2(
                            CW * AURA_ESCALA,
                            CH * AURA_ESCALA
                        ),
                    },
                    uCarta: { value: new THREE.Vector2(CW / 2, CH / 2) },
                    uRadio: { value: CW * 0.05 },
                },
                vertexShader: RAYOS_VERTICE,
                fragmentShader: AURA_FRAGMENTO,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        this.pack.add(this.haz);
        this.scene.add(this.rayos, this.halo);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        this.particulas = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
                size: 0.09,
                map: texHalo,
                vertexColors: true,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            })
        );
        this.particulas.frustumCulled = false;
        this.scene.add(this.particulas);

        gsap.from(this.pack.position, {
            y: -4,
            duration: 0.9,
            ease: 'back.out(1.4)',
        });
        gsap.from(this.pack.rotation, {
            y: -VUELTA,
            duration: 1.2,
            ease: 'power3.out',
        });
        this.reloj.start();
        this.animar();
        return true;
    }

    private ajustar() {
        const w = this.contenedor.clientWidth || 1;
        const h = this.contenedor.clientHeight || 1;
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.bloom.resolution.set(w / 2, h / 2);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.camara.lejos = Math.max(DISTANCIA, 5 / this.camera.aspect);
        if (!gsap.isTweening(this.camara)) this.camara.z = this.camara.lejos;
    }

    private emitir(
        origen: THREE.Vector3,
        cantidad: number,
        fuerza: number,
        colores = DORADOS
    ) {
        if (this.reducido) return;
        const c = new THREE.Color();
        let puestas = 0;
        for (let i = 0; i < MAX_PARTICULAS && puestas < cantidad; i++) {
            if (this.vida[i] > 0) continue;
            puestas++;
            const tita = Math.random() * VUELTA;
            const fi = Math.acos(2 * Math.random() - 1);
            const v = fuerza * (0.3 + Math.random() * 0.7);
            this.pos.set([origen.x, origen.y, origen.z], i * 3);
            this.vel.set(
                [
                    v * Math.sin(fi) * Math.cos(tita),
                    v * Math.sin(fi) * Math.sin(tita) + fuerza * 0.2,
                    v * Math.cos(fi) * 0.6,
                ],
                i * 3
            );
            c.set(colores[Math.floor(Math.random() * colores.length)]);
            this.base.set([c.r, c.g, c.b], i * 3);
            this.vidaMax[i] = this.vida[i] = 0.8 + Math.random() * 1.2;
        }
        this.vivas += puestas;
    }

    private moverParticulas(dt: number) {
        if (!this.vivas) return;
        const freno = Math.pow(0.97, dt * 60);
        for (let i = 0; i < MAX_PARTICULAS; i++) {
            if (this.vida[i] <= 0) continue;
            this.vida[i] -= dt;
            const k = i * 3;
            if (this.vida[i] <= 0) {
                this.col[k] = this.col[k + 1] = this.col[k + 2] = 0;
                this.vivas--;
                continue;
            }
            this.vel[k] *= freno;
            this.vel[k + 1] = this.vel[k + 1] * freno - 4 * dt;
            this.vel[k + 2] *= freno;
            this.pos[k] += this.vel[k] * dt;
            this.pos[k + 1] += this.vel[k + 1] * dt;
            this.pos[k + 2] += this.vel[k + 2] * dt;
            const a = Math.max(0, this.vida[i] / this.vidaMax[i]);
            this.col[k] = this.base[k] * a;
            this.col[k + 1] = this.base[k + 1] * a;
            this.col[k + 2] = this.base[k + 2] * a;
        }
        this.particulas.geometry.attributes.position.needsUpdate = true;
        this.particulas.geometry.attributes.color.needsUpdate = true;
    }

    private animar = () => {
        this.cuadro = requestAnimationFrame(this.animar);
        this.paso(Math.min(this.reloj.getDelta(), 0.05));
    };

    congelar() {
        cancelAnimationFrame(this.cuadro);
    }

    lienzo() {
        return this.renderer.domElement;
    }

    paso(dt: number) {
        this.tiempo += dt;
        const t = this.tiempo;
        const f = dt * 60;

        if (this.enPack) {
            const g = this.giro;
            if (!this.arrastrando) {
                g.y += g.vy * f;
                g.vy *= Math.pow(0.94, f);
                g.x += g.vx * f;
                g.vx *= Math.pow(0.9, f);
                g.x *= Math.pow(0.95, f);
                if (Math.abs(g.vy) < 0.002)
                    g.y += Math.sin(t * 0.6) * 0.002 * f;
            }
            const p = this.carga;
            const temblor = this.reducido ? 0 : p;
            const suave = 1 - Math.pow(0.85, f);
            this.pack.rotation.y += (g.y - this.pack.rotation.y) * suave;
            this.pack.rotation.x += (g.x - this.pack.rotation.x) * suave;
            this.pack.rotation.z = ruido(t, 0) * 0.12 * temblor;
            this.pack.position.set(
                ruido(t, 3) * 0.18 * temblor,
                Math.sin(t * 1.5) * 0.08 * (1 - p) +
                    ruido(t, 7) * 0.18 * temblor,
                0
            );
            for (const c of this.costuras) {
                c.scale.x = Math.max(0.001, p);
                c.material.opacity = Math.min(1, p * 4);
            }
            this.rasgar(p);
            if (p > 0.05 && Math.random() < dt * 25) {
                const punta = this.pack.localToWorld(
                    new THREE.Vector3(
                        -PW * 0.48 + PW * 0.96 * p,
                        (CORTE * PH) / 2,
                        PROF * 0.5
                    )
                );
                this.emitir(punta, 2, 1.2, ['#fff6c8', '#ece3a8']);
            }
            this.pack.scale.setScalar(1 + 0.12 * p);
            for (const m of this.materialesPack) m.emissiveIntensity = p * 0.8;
            for (const m of this.materialesTapa) m.emissiveIntensity = p * 0.8;
            this.bloom.strength = BLOOM_BASE + p * 0.5;
            this.rayos.material.opacity = p * 0.35;
            this.camara.z = this.camara.lejos - p * 1.6;
            if (p > 0.35 && Math.random() < p * 0.5 * f) {
                const lado = new THREE.Vector3(
                    (Math.random() - 0.5) * PW,
                    (Math.random() - 0.5) * PH,
                    0.3
                );
                this.emitir(lado, 4, 1 + 3 * p);
            }
        }

        if (this.aura.carta >= 0) {
            const carta = this.cartas[this.aura.carta];
            const pulso = (Math.sin(t * this.aura.ritmo) + 1) / 2;
            this.halo.position.set(
                carta.position.x,
                carta.position.y,
                carta.position.z - 0.4
            );
            this.halo.material.uniforms.uColor.value.copy(this.aura.color);
            this.halo.material.uniforms.uOpacidad.value =
                this.aura.fuerza * (0.7 + 0.3 * pulso);
            this.materiales[this.aura.carta].dorso.emissiveIntensity =
                this.aura.fuerza * 0.25 * pulso;
        }

        const inc = this.inclinacion;
        const sigue = 1 - Math.pow(0.88, f);
        this.pivotes.forEach((pivote, i) => {
            const activa = i === inc.carta;
            const y = activa ? inc.x * 0.35 : 0;
            const x = activa ? inc.y * 0.28 : 0;
            pivote.rotation.y += (y - pivote.rotation.y) * sigue;
            pivote.rotation.x += (x - pivote.rotation.x) * sigue;
            pivote.position.z =
                (CW / 2) * Math.abs(Math.sin(pivote.rotation.y)) +
                (CH / 2) * Math.abs(Math.sin(pivote.rotation.x));
        });

        this.rayos.rotation.z += dt * 0.06;
        this.rayos.material.uniforms.uOpacidad.value =
            this.rayos.material.opacity;
        this.moverParticulas(dt);
        const s = this.reducido ? 0 : this.camara.temblor;
        this.camera.position.set(
            ruido(t, 11) * s,
            ruido(t, 17) * s - SUBIR,
            this.camara.z
        );
        this.camera.lookAt(0, -SUBIR, 0);
        this.composer.render();
    }

    private rasgar(p: number) {
        if (p === this.rasgado) return;
        this.rasgado = p;
        const punta = -PW * 0.48 + PW * 0.96 * p;
        this.tapa.children.forEach((hijo, k) => {
            const malla = hijo as THREE.Mesh;
            const pos = malla.geometry.attributes.position;
            const original = this.tapaOriginal[k];
            for (let i = 0; i < pos.count; i++) {
                const x = original[i * 3];
                const d = Math.max(0, punta - x);
                pos.setY(i, original[i * 3 + 1] + d * 0.07);
            }
            pos.needsUpdate = true;
        });
    }

    arrastrar(dx: number, dy: number) {
        if (!this.enPack) return;
        this.arrastrando = true;
        this.giro.y += dx * 0.012;
        this.giro.x = THREE.MathUtils.clamp(
            this.giro.x + dy * 0.008,
            -0.6,
            0.6
        );
        this.giro.vy = dx * 0.012;
        this.giro.vx = dy * 0.004;
    }

    soltar() {
        this.arrastrando = false;
    }

    inclinar(x: number, y: number) {
        this.inclinacion.x = THREE.MathUtils.clamp(x, -1, 1);
        this.inclinacion.y = THREE.MathUtils.clamp(y, -1, 1);
    }

    private aMundo(r: Ranura, z: number) {
        const w = this.contenedor.clientWidth || 1;
        const h = this.contenedor.clientHeight || 1;
        const alto =
            2 *
            (this.camara.lejos - z) *
            Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        return {
            x: (r.x / w - 0.5) * alto * this.camera.aspect,
            y: -SUBIR + (0.5 - r.y / h) * alto,
            escala: ((r.alto / h) * alto) / CH,
        };
    }

    private guardar(
        tl: gsap.core.Timeline,
        carta: THREE.Group,
        r: Ranura,
        en: number
    ) {
        const z = 0.6;
        const p = this.aMundo(r, z);
        tl.to(
            carta.position,
            { x: p.x, y: p.y, z, duration: 0.5, ease: 'power2.inOut' },
            en
        )
            .to(
                carta.rotation,
                { x: 0, y: VUELTA, z: 0, duration: 0.5, ease: 'power2.inOut' },
                en
            )
            .to(
                carta.scale,
                {
                    x: p.escala,
                    y: p.escala,
                    z: p.escala,
                    duration: 0.5,
                    ease: 'power2.inOut',
                },
                en
            )
            .set(carta, { visible: false }, en + 0.5);
    }

    cargar(p: number) {
        this.carga = p;
    }

    abrir() {
        return new Promise<void>((listo) => {
            this.enPack = false;
            const arriba = new THREE.Vector3(0, (CORTE * PH) / 2, 0.2);
            const tl = gsap.timeline({ onComplete: () => listo() });
            tl.to(this.pack.rotation, {
                x: 0,
                y: Math.round(this.pack.rotation.y / VUELTA) * VUELTA,
                z: 0,
                duration: 0.25,
                ease: 'power2.out',
            })
                .to(this.pack.position, { x: 0, y: 0, duration: 0.25 }, 0)
                .add(() => {
                    this.eventos.destello(1, 0.9);
                    this.eventos.sonido('rasgar');
                    this.emitir(arriba, 450, 9);
                    this.emitir(arriba, 150, 5, ['#ffffff']);
                    this.camara.temblor = 0.15;
                    for (const c of this.costuras) c.visible = false;
                    for (const c of this.cartas) c.visible = true;
                })
                .to(this.bloom, { strength: 1.6, duration: 0.1 }, '<')
                .to(this.camara, { temblor: 0, duration: 0.6 }, '>')
                .to(this.bloom, { strength: 0.4, duration: 1.2 }, '<')
                .to(
                    this.tapa.position,
                    { x: 2, y: 4.5, z: 2, duration: 0.9, ease: 'power2.out' },
                    0.25
                )
                .to(
                    this.tapa.rotation,
                    { x: -1.6, z: 2.4, duration: 0.9, ease: 'power2.out' },
                    0.25
                )
                .to(this.materialesTapa, { opacity: 0, duration: 0.6 }, 0.55)
                .to(
                    [...this.materialesPack, ...this.materialesTapa],
                    { emissiveIntensity: 0, duration: 0.6 },
                    0.25
                )
                .to(this.pack.scale, { x: 1, y: 1, z: 1, duration: 0.4 }, 0.25)
                .to(
                    this.haz.scale,
                    { y: 1, duration: 0.45, ease: 'power2.out' },
                    0.3
                )
                .to(this.haz.material, { opacity: 1, duration: 0.3 }, 0.3)
                .to(this.rayos.material, { opacity: 0.3, duration: 0.6 }, 0.3)
                .add(() => this.eventos.sonido('subir'), 0.4);
            tl.to(
                this.camara,
                {
                    z: this.camara.lejos * 1.3,
                    duration: 0.7,
                    ease: 'power2.out',
                },
                0.25
            ).to(
                this.pack.position,
                { y: -1.4, duration: 0.8, ease: 'power2.inOut' },
                0.35
            );
            this.cartas.forEach((c, i) => {
                tl.to(
                    c.position,
                    {
                        y: 1.5 - i * 0.05,
                        duration: 0.8,
                        ease: 'power3.out',
                    },
                    0.45 + i * 0.07
                );
            });
            tl.to(this.haz.material, { opacity: 0, duration: 0.5 }, 1.5)
                .to(
                    this.pack.position,
                    { y: -9, duration: 0.8, ease: 'power2.in' },
                    1.5
                )
                .to(
                    this.pack.rotation,
                    { x: 0.7, duration: 0.8, ease: 'power2.in' },
                    1.5
                )
                .to(this.rayos.material, { opacity: 0.18, duration: 0.6 }, 1.8)
                .to(
                    this.camara,
                    {
                        z: this.camara.lejos,
                        duration: 0.8,
                        ease: 'power2.inOut',
                    },
                    1.8
                )
                .add(() => this.acomodar(0, 0.7), 1.8);
        });
    }

    private acomodar(desde: number, duracion = 0.35) {
        this.cartas.forEach((c, i) => {
            if (i < desde) return;
            const d = i - desde;
            gsap.to(c.position, {
                x: 0,
                y: -d * 0.05,
                z: -d * 0.07,
                duration: duracion,
                ease: 'back.out(1.3)',
            });
            gsap.to(c.rotation, {
                x: 0,
                y: Math.PI,
                z: 0,
                duration: duracion,
            });
            gsap.to(c.scale, { x: 1, y: 1, z: 1, duration: duracion });
        });
    }

    mostrarAura(i: number) {
        const a = AURA[this.datos[i].rareza];
        if (!a.fuerza) return this.quitarAura();
        this.aura = {
            carta: i,
            color: new THREE.Color(a.color),
            fuerza: a.fuerza,
            ritmo: a.ritmo,
        };
    }

    quitarAura() {
        if (this.aura.carta >= 0)
            this.materiales[this.aura.carta].dorso.emissiveIntensity = 0;
        this.aura.carta = -1;
        this.halo.material.uniforms.uOpacidad.value = 0;
    }

    revelar(i: number) {
        const carta = this.cartas[i];
        const m = this.materiales[i];
        const rareza = this.datos[i].rareza;
        const centro = () =>
            carta.position.clone().setZ(carta.position.z + 0.3);
        this.quitarAura();
        this.inclinacion = { carta: -1, x: 0, y: 0 };
        this.eventos.sonido(`inicio-${rareza}`);

        return new Promise<void>((listo) => {
            const tl = gsap.timeline({
                onComplete: () => {
                    this.inclinacion = { carta: i, x: 0, y: 0 };
                    gsap.to(m.foil.fuerza, {
                        value: FOIL[rareza].fuerza,
                        duration: 0.8,
                        ease: 'power2.out',
                    });
                    listo();
                },
            });
            if (rareza === 'common' || rareza === 'uncommon') {
                tl.to(carta.position, { z: 0.3, duration: 0.2 })
                    .to(
                        carta.rotation,
                        { y: VUELTA, duration: 0.5, ease: 'power2.out' },
                        0
                    )
                    .add(() => {
                        this.emitir(centro(), 40, 3, CHISPAS.common);
                        this.eventos.sonido(`impacto-${rareza}`);
                    }, 0.25);
            } else if (rareza === 'rare') {
                tl.to(carta.position, {
                    z: 0.7,
                    duration: 0.25,
                    ease: 'power2.out',
                })
                    .to(carta.rotation, {
                        y: VUELTA,
                        duration: 0.6,
                        ease: 'back.out(1.5)',
                    })
                    .add(() => {
                        this.emitir(centro(), 120, 5, CHISPAS.rare);
                        this.eventos.sonido('impacto-rare');
                    }, 0.5)
                    .to(carta.position, { z: 0.4, duration: 0.3 });
            } else if (rareza === 'epic') {
                tl.to(carta.position, {
                    z: 1.1,
                    y: 0.2,
                    duration: 0.35,
                    ease: 'power2.out',
                })
                    .to(this.rayos.material, { opacity: 0.5, duration: 0.6 }, 0)
                    .to(
                        this.rayos.scale,
                        { x: 1.15, y: 1.15, duration: 0.6 },
                        0
                    )
                    .to(
                        carta.position,
                        {
                            x: 'random(-0.06, 0.06)',
                            duration: 0.04,
                            repeat: 15,
                            yoyo: true,
                            repeatRefresh: true,
                            ease: 'none',
                        },
                        0.35
                    )
                    .set(carta.position, { x: 0 })
                    .to(carta.rotation, {
                        y: VUELTA,
                        duration: 0.6,
                        ease: 'back.out(1.6)',
                    })
                    .add(() => {
                        this.eventos.destello(0.45, 0.6);
                        this.eventos.sonido('impacto-epic');
                        this.emitir(centro(), 320, 7, CHISPAS.epic);
                        this.camara.temblor = 0.06;
                    }, '-=0.35')
                    .to(this.bloom, { strength: 1.8, duration: 0.1 }, '<')
                    .to(this.bloom, { strength: 0.4, duration: 0.8 }, '>')
                    .to(this.camara, { temblor: 0, duration: 0.4 }, '<')
                    .to(carta.position, { z: 0.6, y: 0, duration: 0.4 }, '<')
                    .to(
                        this.rayos.material,
                        { opacity: 0.18, duration: 0.6 },
                        '<'
                    )
                    .to(this.rayos.scale, { x: 1, y: 1, duration: 0.6 }, '<');
            } else if (rareza === 'chosen') {
                const otros = this.cartas
                    .filter((_, j) => j > i)
                    .map((c) => c.position);
                const mapa = m.frente.map;
                const rayos = this.rayos.material as THREE.ShaderMaterial & { opacity: number };
                const intensidades = this.luces.map((l) => l.intensity);
                const ambiente = { v: this.scene.environmentIntensity };
                const zCamara = this.camara.z;
                const extras: THREE.Object3D[] = [];
                const oro = (op = 1) =>
                    new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });

                const haz = new THREE.Mesh(
                    new THREE.PlaneGeometry(CW * 1.6, 9),
                    new THREE.MeshBasicMaterial({ map: lienzoATextura(gradienteHaz(), true), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
                );
                haz.rotation.z = Math.PI;
                haz.position.set(0, 4.8, 1.2);
                this.scene.add(haz);
                extras.push(haz);

                const brasas: THREE.Mesh[] = [];
                for (let k = 0; k < 36; k++) {
                    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), oro(0));
                    const ang = (k / 36) * Math.PI * 2;
                    b.position.set(Math.cos(ang) * (0.9 + (k % 4) * 0.25), -1.6 - (k % 6) * 0.2, 1.3 + Math.sin(ang) * 0.5);
                    this.scene.add(b);
                    brasas.push(b);
                    extras.push(b);
                }

                tl.set(m.frente, { map: m.dorso.map }, 0)
                    .to(otros, { y: -6, duration: 0.5, ease: 'power2.in' }, 0)
                    .to(rayos, { opacity: 0, duration: 0.3 }, 0)
                    .to(this.luces, { intensity: (k: number) => intensidades[k] * 0.12, duration: 0.8, ease: 'power2.inOut' }, 0)
                    .to(ambiente, { v: 0.08, duration: 0.8, onUpdate: () => (this.scene.environmentIntensity = ambiente.v) }, 0)
                    .to(this.bloom, { strength: 0.25, duration: 0.8 }, 0)
                    .to(carta.position, { z: 1.4, y: 0.15, duration: 1, ease: 'power2.out' }, 0.2)
                    .to(haz.material, { opacity: 0.85, duration: 0.9, ease: 'power2.out' }, 0.6)
                    .to(carta.rotation, { y: Math.PI * 0.9, duration: 2.2, ease: 'sine.inOut' }, 0.6)
                    .to(carta.position, { y: 0.28, duration: 0.55, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.6)
                    .to(this.camara, { z: zCamara - 1.1, duration: 2.6, ease: 'power1.inOut' }, 0.4)
                    .to(m.dorso, { emissiveIntensity: 0.35, duration: 2, ease: 'power1.in' }, 0.6);
                brasas.forEach((b, k) => {
                    const t = 0.7 + (k % 12) * 0.12;
                    tl.to(b.material, { opacity: 0.9, duration: 0.3 }, t)
                        .to(b.position, { y: b.position.y + 3.4, x: b.position.x * 0.4, duration: 2.2, ease: 'sine.out' }, t)
                        .to(b.material, { opacity: 0, duration: 0.5 }, t + 1.7);
                });
                tl.to(carta.position, { x: 'random(-0.03, 0.03)', duration: 0.035, repeat: 13, yoyo: true, repeatRefresh: true, ease: 'none' }, 2.6)
                    .set(carta.position, { x: 0 }, 3.08)
                    .to(m.dorso, { emissiveIntensity: 1.2, duration: 0.5, ease: 'power3.in' }, 2.6)
                    .to(this.camara, { temblor: 0.05, duration: 0.5, ease: 'power2.in' }, 2.6)
                    .add(() => {
                        m.frente.map = mapa;
                        m.frente.color.setScalar(BRILLO_CARTAS);
                        m.dorso.emissiveIntensity = 0;
                        this.eventos.destello(1, 1.1);
                        this.eventos.sonido('impacto-chosen');
                        this.emitir(centro(), 900, 11, CHISPAS.chosen);
                        this.camara.temblor = 0.18;
                        for (let k = 0; k < 2; k++) {
                            const onda = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 72), oro(0.95));
                            onda.position.copy(centro());
                            onda.scale.setScalar(0.3);
                            this.scene.add(onda);
                            extras.push(onda);
                            gsap.to(onda.scale, { x: 9, y: 9, duration: 1.1 + k * 0.4, delay: k * 0.15, ease: 'power2.out' });
                            gsap.to(onda.material, { opacity: 0, duration: 1.1 + k * 0.4, delay: k * 0.15, ease: 'power1.in' });
                        }
                    }, 3.1)
                    .to(carta.rotation, { y: VUELTA, duration: 0.3, ease: 'back.out(2.5)' }, 3.1)
                    .to(this.luces, { intensity: (k: number) => intensidades[k], duration: 0.25 }, 3.1)
                    .to(ambiente, { v: 0.9, duration: 0.25, onUpdate: () => (this.scene.environmentIntensity = ambiente.v) }, 3.1)
                    .to(haz.material, { opacity: 0, duration: 0.4 }, 3.1)
                    .to(this.bloom, { strength: 2.2, duration: 0.05 }, 3.1)
                    .to(this.bloom, { strength: BLOOM_BASE, duration: 1 }, 3.2)
                    .to(this.camara, { temblor: 0, duration: 0.8 }, 3.2)
                    .to(this.camara, { z: zCamara, duration: 0.9, ease: 'power2.out' }, 3.2)
                    .to(rayos, { opacity: 0.5, duration: 0.5 }, 3.1)
                    .to(this.rayos.scale, { x: 1.5, y: 1.5, duration: 0.9 }, 3.1)
                    .to(this.rayos.rotation, { z: '+=' + Math.PI * 0.6, duration: 4, ease: 'none' }, 3.1)
                    .fromTo(carta.scale, { x: 1, y: 1, z: 1 }, { x: 1.18, y: 1.18, z: 1.18, duration: 0.6, ease: 'back.out(2.2)' }, 3.1)
                    .to(carta.position, { z: 1.3, y: 0, duration: 0.6 }, 3.1)
                    .add(() => {
                        for (const o of extras) {
                            this.scene.remove(o);
                            const malla = o as THREE.Mesh;
                            malla.geometry.dispose();
                            const mat = malla.material as THREE.MeshBasicMaterial;
                            mat.map?.dispose();
                            mat.dispose();
                        }
                    }, 4.8);
            } else {
                const otros = this.cartas
                    .filter((_, j) => j > i)
                    .map((c) => c.position);
                const mapa = m.frente.map;
                tl.set(m.frente, { map: m.dorso.map }, 0)
                    .to(otros, { y: -6, duration: 0.5, ease: 'power2.in' }, 0)
                    .to(this.rayos.material, { opacity: 0, duration: 0.3 }, 0)
                    .to(
                        carta.position,
                        { z: 1.6, y: 0.25, duration: 0.6, ease: 'power2.out' },
                        0
                    )
                    .to(
                        carta.rotation,
                        { y: Math.PI * 8, duration: 2.2, ease: 'power3.in' },
                        0.4
                    )
                    .to(
                        m.frente.color,
                        {
                            r: 1.8,
                            g: 1.7,
                            b: 1.2,
                            duration: 2.2,
                            ease: 'power2.in',
                        },
                        0.4
                    )
                    .to(
                        m.dorso,
                        {
                            emissiveIntensity: 0.7,
                            duration: 2.2,
                            ease: 'power2.in',
                        },
                        0.4
                    )
                    .to(
                        this.camara,
                        { temblor: 0.08, duration: 2.2, ease: 'power2.in' },
                        0.4
                    )
                    .to(
                        this.bloom,
                        { strength: 0.9, duration: 2.2, ease: 'power2.in' },
                        0.4
                    )
                    .add(() => {
                        m.frente.map = mapa;
                        m.frente.color.setScalar(BRILLO_CARTAS);
                        m.dorso.emissiveIntensity = 0;
                        carta.rotation.y = VUELTA;
                        this.eventos.destello(1, 1.2);
                        this.eventos.sonido('impacto-legendary');
                        this.emitir(centro(), 700, 10, CHISPAS.legendary);
                        this.emitir(centro(), 250, 6, ['#ffffff']);
                    }, 2.6)
                    .to(this.bloom, { strength: 1.8, duration: 0.05 }, 2.6)
                    .to(
                        this.bloom,
                        { strength: BLOOM_BASE, duration: 0.7 },
                        2.7
                    )
                    .to(this.camara, { temblor: 0, duration: 0.6 }, 2.6)
                    .to(
                        this.rayos.material,
                        { opacity: 0.35, duration: 0.6 },
                        2.6
                    )
                    .to(
                        this.rayos.scale,
                        { x: 1.3, y: 1.3, duration: 0.8 },
                        2.6
                    )
                    .fromTo(
                        carta.scale,
                        { x: 1, y: 1, z: 1 },
                        {
                            x: 1.12,
                            y: 1.12,
                            z: 1.12,
                            duration: 0.6,
                            ease: 'back.out(2)',
                        },
                        2.6
                    )
                    .to(carta.position, { z: 1.2, y: 0, duration: 0.6 }, 2.6);
            }
        });
    }

    siguiente(i: number, destino: Ranura) {
        const carta = this.cartas[i];
        this.inclinacion.carta = -1;
        this.eventos.sonido('salir');
        return new Promise<void>((listo) => {
            const tl = gsap.timeline({ onComplete: () => listo() });
            this.guardar(tl, carta, destino, 0);
            tl.to(this.rayos.material, { opacity: 0.18, duration: 0.5 }, 0)
                .to(this.rayos.scale, { x: 1, y: 1, duration: 0.5 }, 0)
                .to(this.bloom, { strength: 0.4, duration: 0.5 }, 0)
                .add(() => this.acomodar(i + 1), 0.15);
        });
    }

    saltar(desde: number, hasta: number, destinos: Ranura[]) {
        this.quitarAura();
        this.inclinacion.carta = -1;
        this.eventos.sonido('salir');
        return new Promise<void>((listo) => {
            const tl = gsap.timeline({ onComplete: () => listo() });
            for (let j = desde; j < hasta; j++)
                this.guardar(tl, this.cartas[j], destinos[j - desde], (j - desde) * 0.08);
            tl.to(this.rayos.material, { opacity: 0.18, duration: 0.5 }, 0)
                .to(this.rayos.scale, { x: 1, y: 1, duration: 0.5 }, 0)
                .to(this.bloom, { strength: 0.4, duration: 0.5 }, 0)
                .add(() => this.acomodar(hasta), 0.15);
        });
    }

    ocultar() {
        return gsap.to(this.renderer.domElement, {
            opacity: 0,
            duration: 0.4,
            onComplete: () => this.congelar(),
        });
    }

    destruir() {
        this.destruida = true;
        cancelAnimationFrame(this.cuadro);
        this.observador.disconnect();
        gsap.killTweensOf([
            this.camara,
            this.bloom,
            this.pack.position,
            this.pack.rotation,
            this.pack.scale,
            this.tapa.position,
            this.tapa.rotation,
            this.renderer.domElement,
            ...this.cartas.flatMap((c) => [c.position, c.rotation, c.scale]),
        ]);
        this.scene.traverse((o) => {
            const malla = o as THREE.Mesh;
            malla.geometry?.dispose();
            const mats = Array.isArray(malla.material)
                ? malla.material
                : malla.material
                  ? [malla.material]
                  : [];
            for (const mat of mats) {
                for (const v of Object.values(mat))
                    if (v instanceof THREE.Texture) v.dispose();
                mat.dispose();
            }
        });
        this.scene.environment?.dispose();
        this.composer.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();
    }
}
