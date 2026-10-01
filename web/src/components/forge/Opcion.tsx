// Una de las dos opciones de un roll: vista previa por capas, que cambia y el
// boton para quedarsela.
import type { Probabilidades, RollOption, Traits } from './tipos';
import { botonAmarillo } from './estilos';
import { BACKEND_BASE_URL, LAYER_ORDER, porcentaje } from './forge';
import { rarezaDe } from './rareza';
import { miniaturaDeTrait } from '@/lib/miniaturas';

export default function Opcion({
    option,
    before,
    probabilities,
    shares,
    puedeActuar,
    aplicando,
    deshabilitado,
    onElegir,
}: {
    option: RollOption;
    before: Traits;
    probabilities: Probabilidades;
    shares?: Probabilidades;
    puedeActuar: boolean;
    aplicando: boolean;
    deshabilitado: boolean;
    onElegir: () => void;
}) {
    return (
        <div className="flex flex-col gap-3 rounded-xl bg-blue/40 p-3">
            {/* Mas chica que el Preview: son dos, y lo que importa comparar
                es la lista de cambios de abajo. Con las miniaturas grandes (640
                px, sin perdida): son 7 capas por opcion, y 14 GIFs de 2000x2000
                a la vez traban la pagina justo cuando las opciones entran
                animadas. Sin "pixelated": la miniatura se achica, y tomar pixeles
                sueltos dejaria los trazos dentados. */}
            <div className="relative mx-auto w-full max-w-72 aspect-square overflow-hidden rounded-lg">
                {LAYER_ORDER.filter((c) => option.layers[c]).map((c) => (
                    <img
                        key={c}
                        src={miniaturaDeTrait(
                            `${BACKEND_BASE_URL}${option.layers[c].imageUrl}`,
                            { grande: true }
                        )}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
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
                            <span
                                className={`font-semibold ${rarezaDe(shares, category, value)?.color ?? 'text-yellow'}`}
                            >
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
