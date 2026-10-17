// El aviso de una accion de la pagina: amarillo si salio bien, rojo si no.
export type Aviso = { ok: boolean; texto: string };

export default function Mensaje({ ok, texto }: Aviso) {
    return (
        <p className={`text-sm ${ok ? 'text-yellow' : 'text-red-400'}`}>{texto}</p>
    );
}
