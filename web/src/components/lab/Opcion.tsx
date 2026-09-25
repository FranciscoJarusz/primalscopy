// Una de las dos opciones de un roll: vista previa por capas, que cambia y el
// boton para quedarsela.
import type { Probabilidades, RollOption, Traits } from './tipos';
import { botonAmarillo } from './estilos';
import { BACKEND_BASE_URL, LAYER_ORDER, porcentaje } from './lab';

export default function Opcion({
    option,
    before,
    probabilities,
    puedeActuar,
    aplicando,
    deshabilitado,
    onElegir,
}: {
    option: RollOption;
    before: Traits;
    probabilities: Probabilidades;
    puedeActuar: boolean;
    aplicando: boolean;
    deshabilitado: boolean;
    onElegir: () => void;
}) {
    return (
        <div className="flex flex-col gap-3 rounded-xl bg-blue/40 p-3">
            <div className="relative mx-auto w-full max-w-100 lg:max-w-125 aspect-square overflow-hidden rounded-lg">
                {LAYER_ORDER.filter((c) => option.layers[c]).map((c) => (
                    <img
                        key={c}
                        src={`${BACKEND_BASE_URL}${option.layers[c].imageUrl}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                    />
                ))}
            </div>
            <ul className="flex flex-col gap-1 text-sm">
                {Object.entries(option.changes).map(([category, value]) => (
                    <li
                        key={category}
                        className="flex justify-between gap-2 leading-tight"
                    >
                        <span className="text-[10px] uppercase text-lightblue/60 pt-0.5">
                            {category}
                        </span>
                        <span className="text-right">
                            <span className="text-lightblue/40 line-through text-xs mr-1">
                                {before[category]}
                            </span>
                            <span className="text-yellow font-semibold">
                                {value}
                            </span>
                            {probabilities[category]?.[value] !== undefined && (
                                <span className="text-lightblue/50 text-xs ml-1">
                                    {porcentaje(probabilities[category][value])}
                                </span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>
            {puedeActuar && (
                <button
                    onClick={onElegir}
                    disabled={deshabilitado}
                    className={`self-start w-full bg-yellow text-darkblue font-accent uppercase leading-normal! rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 sm:mt-3`}
                >
                    {aplicando ? 'Applying...' : 'Keep this'}
                </button>
            )}
        </div>
    );
}
