// Las chances de cada trait en las categorias que se van a sortear. Nunca
// incluye el valor actual: un roll siempre lo cambia.
import type { ForgeStatus } from './tipos';
import { porcentaje } from './forge';
import { rarezaDe } from './rareza';

export default function Odds({
    status,
    keep,
}: {
    status: ForgeStatus;
    keep: string[];
}) {
    const categorias = status.rollableCategories.filter(
        (c) => !keep.includes(c)
    );

    return (
        <details className="group">
            <summary className="cursor-pointer list-none text-xs uppercase text-lightblue/70 hover:text-yellow transition-colors">
                <span className="inline-block transition-transform group-open:rotate-90 mr-1">
                    ▸
                </span>
                View roll odds
            </summary>
            {/* data-lenis-prevent: sin esto el scroll suave del sitio se
                queda con la rueda del mouse y esta lista no scrollea. */}
            <div
                data-lenis-prevent
                className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-4 max-h-80 overflow-y-auto pr-1"
            >
                {categorias.map((category) => (
                    <div key={category}>
                        <p className="font-accent uppercase text-yellow text-sm mb-1">
                            {category}
                        </p>
                        <ul className="flex flex-col gap-0.5">
                            {Object.entries(
                                status.probabilities?.[category] || {}
                            )
                                .sort((a, b) => b[1] - a[1])
                                .map(([value, p]) => (
                                    <li
                                        key={value}
                                        className="flex justify-between gap-2 text-xs text-lightblue"
                                    >
                                        <span
                                            className={`truncate ${rarezaDe(status.collectionShare, category, value)?.color ?? ''}`}
                                        >
                                            {value}
                                        </span>
                                        <span className="text-lightblue/60">
                                            {porcentaje(p)}
                                        </span>
                                    </li>
                                ))}
                        </ul>
                    </div>
                ))}
            </div>
        </details>
    );
}
