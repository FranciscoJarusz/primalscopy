/// El recuadro con el arte del ticket.
///
/// Es solo un dibujo: en el contrato un ticket es un contador por wallet, no un
/// token que se pueda mandar ni ver en la wallet. Para cambiar el arte se
/// reemplaza public/ticket.svg y listo, no hay que tocar codigo.
export default function Ticket({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl bg-black/30 border border-white/10 flex items-center justify-center px-6 py-5 ${className}`}
    >
      <img
        src="/icons/ticket.svg"
        alt="Primal Cult raffle ticket"
        className="w-full max-w-[280px] h-auto"
      />
    </div>
  );
}
