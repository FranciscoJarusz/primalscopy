export const CSS = `
.mw-titulo { font-family: 'gardein', serif; font-weight: 700; }
.mw-texto { font-family: 'acme-gothic-condensed', sans-serif; }
.mw-etiqueta { font-family: 'acme-gothic-extrawide', sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.mw-brass { background: linear-gradient(100deg, #efe7bd 0%, #d8cc8c 40%, #aea35d 72%, #cdc184 100%); }
.mw-brass-texto { background: linear-gradient(100deg, #efe7bd 0%, #d8cc8c 45%, #aea35d 75%, #d2c688 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.mw-logo { -webkit-mask: url(/brand/logo-icon.svg) center / contain no-repeat; mask: url(/brand/logo-icon.svg) center / contain no-repeat; }
.mw-marco { border: 1px solid rgb(174 163 93 / .7); box-shadow: inset 0 0 0 3px #000, inset 0 0 0 4px rgb(174 163 93 / .3); }
.mw-rayos { background: repeating-conic-gradient(from 0deg at 50% 50%, rgb(174 163 93 / .07) 0 2deg, transparent 2deg 9deg); }
.mw-flota { animation: mw-flota 4s ease-in-out infinite; }
@keyframes mw-flota { 50% { transform: translateY(-8px) rotate(-1deg); } }
.mw-legendaria { box-shadow: 0 0 40px -6px rgb(236 227 168 / .6); overflow: hidden; }
.mw-legendaria::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 45%; background: linear-gradient(100deg, transparent, rgb(255 248 200 / .3), transparent); transform: translateX(-150%) skewX(-15deg); animation: mw-reflejo-carta 4s cubic-bezier(.45, 0, .25, 1) infinite; will-change: transform; pointer-events: none; }
@keyframes mw-reflejo-carta { 0% { transform: translateX(-150%) skewX(-15deg); } 45%, 100% { transform: translateX(330%) skewX(-15deg); } }
.mw-boton-brillo { position: relative; isolation: isolate; background: linear-gradient(100deg, #efe7bd 0%, #d8cc8c 40%, #aea35d 72%, #cdc184 100%); }
.mw-boton-brillo::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; box-shadow: 0 0 40px 4px rgb(236 227 168 / .75); opacity: .3; animation: mw-latido 3s ease-in-out infinite; will-change: opacity; pointer-events: none; }
.mw-boton-reflejo { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
.mw-boton-reflejo::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 40%; background: linear-gradient(100deg, transparent, rgb(255 252 225 / .85), transparent); transform: translateX(-150%) skewX(-18deg); animation: mw-reflejo 3s cubic-bezier(.45, 0, .25, 1) infinite; will-change: transform; }
.mw-boton-brillo:disabled { filter: grayscale(.6) brightness(.7); }
.mw-boton-brillo:disabled::before, .mw-boton-brillo:disabled .mw-boton-reflejo { display: none; }
@keyframes mw-latido { 50% { opacity: 1; } }
@keyframes mw-reflejo { 0% { transform: translateX(-150%) skewX(-18deg); } 60%, 100% { transform: translateX(350%) skewX(-18deg); } }
@media (prefers-reduced-motion: reduce) {
  .mw-flota, .mw-legendaria::after, .mw-boton-brillo::before, .mw-boton-reflejo::after { animation: none !important; }
}
`;
