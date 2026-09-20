/// El mismo pie que el Cultomizer, con los mismos assets, para que las dos
/// paginas cierren igual. No depende de nada: se copia y anda.

const REDES = [
  {
    nombre: "Discord",
    href: "https://discord.gg/djJaV4keCQ",
    img: "/assets/discord.svg",
  },
  {
    nombre: "OpenSea",
    href: "https://opensea.io/collection/primalcult",
    img: "/assets/opensea.svg",
  },
];

export default function Footer() {
  return (
    <footer className="flex flex-col md:flex-row gap-10 items-center justify-between bg-white/5 border border-white/10 rounded-xl p-6 text-center text-white/50">
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-nowrap text-xs lg:text-md">
        <a
          href="https://primalcult.xyz/"
          target="_blank"
          rel="noopener noreferrer"
          className="scale-100 hover:scale-105 transition-transform duration-300 w-6 h-6 lg:w-9 lg:h-9"
        >
          <img
            src="/assets/primalwhite.svg"
            alt="Primal Cult"
            className="inline-block"
          />
        </a>
        &copy; {new Date().getFullYear()} Primal Cult. All rights reserved.
      </div>

      <div className="flex justify-center gap-6">
        <a
          href={REDES[0]!.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Discord"
          className="scale-100 hover:scale-105 transition-transform duration-300"
        >
          <img src={REDES[0]!.img} alt="Discord" width={28} height={28} />
        </a>

        <a
          href="https://x.com/primal_cult"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="X"
          className="scale-100 hover:scale-105 transition-transform duration-300"
        >
          <svg width="28" height="28" viewBox="0 0 240 240">
            <g fill="#fff" fillRule="nonzero" transform="scale(8.53333,8.53333)">
              <path d="M26.37,26l-8.795,-12.822l0.015,0.012l7.93,-9.19h-2.65l-6.46,7.48l-5.13,-7.48h-6.95l8.211,11.971l-0.001,-0.001l-8.66,10.03h2.65l7.182,-8.322l5.708,8.322zM10.23,6l12.34,18h-2.1l-12.35,-18z" />
            </g>
          </svg>
        </a>

        <a
          href="https://primalcult.xyz/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Website"
          className="scale-100 hover:scale-105 transition-transform duration-300"
        >
          <svg width="28" height="28" viewBox="0 0 1024 1024">
            <path
              d="M372.288 745.792a394.048 394.048 0 0 0 113.728 102.848v-127.744a390.08 390.08 0 0 0-113.728 24.896z m-51.584 24.192a392.96 392.96 0 0 0-60.16 41.6h-1.28a390.336 390.336 0 0 0 205.696 89.6 450.24 450.24 0 0 1-144.256-131.2z m-24.704-230.016c3.968 56.768 20.096 110.208 45.696 157.696a445.696 445.696 0 0 1 144.32-32.896v-124.8h-190.08z m-56.128 0H120.96a390.4 390.4 0 0 0 98.56 233.024c22.208-19.2 46.272-36.224 71.808-50.752a445.312 445.312 0 0 1-51.456-182.272z m445.824 158.784c25.984-47.808 42.24-101.568 46.336-158.72H540.992v124.864c51.072 3.2 99.776 14.976 144.704 33.92z m50.24 24.96c24.448 14.08 47.552 30.464 68.928 48.896a390.4 390.4 0 0 0 98.176-232.576h-114.88a445.312 445.312 0 0 1-52.224 183.68z m-194.944 125.44a394.048 394.048 0 0 0 113.92-102.4 389.888 389.888 0 0 0-113.92-25.728v128.192z m23.104 51.392a390.4 390.4 0 0 0 200.704-88.96h-0.512a392.96 392.96 0 0 0-57.92-40.32 450.24 450.24 0 0 1-142.272 129.28zM341.76 326.144a389.632 389.632 0 0 0-45.76 157.824h190.016V358.976a445.696 445.696 0 0 1-144.256-32.768z m-50.368-24.576a449.216 449.216 0 0 1-71.808-50.56 390.4 390.4 0 0 0-98.56 232.96h118.848a445.312 445.312 0 0 1 51.52-182.4z m194.56-126.208A394.048 394.048 0 0 0 372.48 278.016a390.08 390.08 0 0 0 113.536 24.768V175.36z m-20.992-52.544a390.272 390.272 0 0 0-205.312 89.152h0.512c18.88 15.872 39.168 29.888 60.608 41.92a450.24 450.24 0 0 1 144.192-131.072z m189.76 154.048a394.048 394.048 0 0 0-113.728-102.08v127.808a389.952 389.952 0 0 0 113.728-25.728z m51.392-24.576a392.96 392.96 0 0 0 57.856-40.32h0.384A390.336 390.336 0 0 0 564.16 123.52a450.24 450.24 0 0 1 141.952 128.832z m25.92 231.68a389.632 389.632 0 0 0-46.528-159.168 445.568 445.568 0 0 1-144.512 33.92v125.248h191.04z m56.128 0h114.88a390.4 390.4 0 0 0-98.56-232.96 449.28 449.28 0 0 1-68.736 48.896c29.824 55.424 48.32 117.76 52.416 184.128zM512 960A448 448 0 1 1 512 64a448 448 0 0 1 0 896z"
              fill="#fff"
            />
          </svg>
        </a>

        <a
          href={REDES[1]!.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="OpenSea"
          className="scale-100 hover:scale-105 transition-transform duration-300"
        >
          <img src={REDES[1]!.img} alt="OpenSea" width={28} height={28} />
        </a>
      </div>
    </footer>
  );
}
