import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { APECHAIN } from "../../lib/cultomizer/contracts";

/// Avisa cuando la wallet esta parada en otra red y ofrece cambiarla.
///
/// La version anterior hablaba directo con `window.ethereum`: escuchaba
/// `chainChanged` y pedia `eth_chainId` a mano. Eso solo existe cuando hay una
/// extension de escritorio inyectada — con una wallet de celular conectada por
/// WalletConnect no hay `window.ethereum`, asi que el aviso nunca aparecia
/// justo para los usuarios que mas lo necesitan (las wallets moviles se
/// conectan en Ethereum por defecto).
///
/// wagmi ya sabe en que red esta la wallet con cualquier conector, asi que
/// alcanza con preguntarle a el.
export default function NetworkSwitcher() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === APECHAIN.id) return null;

  return (
    <div className="fixed top-4 left-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 max-w-sm backdrop-blur-sm z-50">
      <div className="flex items-center gap-3">
        <div className="text-yellow-400 text-xl">⚠️</div>
        <div>
          <div className="text-yellow-300 font-semibold">Red incorrecta</div>
          <div className="text-yellow-200 text-sm">
            Red actual: Chain ID {chainId}
          </div>
          <div className="text-yellow-200 text-sm">
            Necesitas cambiar a {APECHAIN.nombre}
          </div>
          <button
            onClick={() => switchChain({ chainId: APECHAIN.id })}
            disabled={isPending}
            className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 cursor-pointer px-3 py-1 rounded text-white text-xs mt-2 transition-all duration-200"
          >
            {isPending ? "Cambiando..." : `Cambiar a ${APECHAIN.nombre}`}
          </button>
        </div>
      </div>
    </div>
  );
}
