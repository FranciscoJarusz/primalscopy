export default function Dato({
    label,
    valor,
    icono,
    ancho = false,
    tono = 'text-yellow',
}: {
    label: string;
    valor: string;
    icono?: string;
    ancho?: boolean;
    tono?: string;
}) {
    return (
        <div
            className={`min-w-0 flex flex-col justify-center gap-2 rounded-xl sm:rounded-2xl bg-lightblue/5 border border-lightblue/10 px-4 pt-3 pb-4 ${
                ancho ? 'col-span-2 lg:col-span-1' : ''
            }`}
        >
            <span className="text-xs sm:text-sm font-bold uppercase text-lightblue/70">
                {label}
            </span>
            <span className={`flex items-center gap-2 font-accent text-3xl sm:text-4xl ${tono} leading-none`}>
                {icono && (
                    <img src={icono} alt="" className="w-7 h-7 shrink-0" />
                )}
                <span className="relative top-[-0.19em]">{valor}</span>
            </span>
        </div>
    );
}
