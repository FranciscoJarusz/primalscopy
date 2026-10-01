export default function Cargando({ texto }: { texto: string }) {
    return (
        <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow mx-auto mb-4"></div>
            <div className="text-lightblue text-xl">{texto}</div>
        </div>
    );
}
