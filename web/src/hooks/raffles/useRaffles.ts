import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { useStore } from "@nanostores/react";
import { accountIndex, version, refresh } from "../../stores/raffles/session";
import { ACCOUNTS } from "../../lib/raffles/accounts";
import {
  provider,
  HUB,
  VRNG,
  ABI_HUB,
  ABI_VRNG,
  type Item,
  type Raffle,
  type Actions,
} from "../../lib/raffles/contrato";

export type Aviso = { tipo: "ok" | "error"; texto: string } | null;

/// Todo lo que habla con la blockchain vive aca, y los componentes solo pintan
/// lo que este hook devuelve. Cuando llegue la wallet de verdad, se cambia de
/// donde sale `firmante` y no hay que tocar ninguna vista.
export function useRaffles() {
  const indice = useStore(accountIndex);
  const v = useStore(version);

  const [raffles, setRaffles] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  const cuenta = ACCOUNTS[indice]!;

  const firmante = useMemo(
    () => new ethers.Wallet(cuenta.clave, provider),
    [cuenta.clave],
  );
  const hub = useMemo(
    () => new ethers.Contract(HUB, ABI_HUB, firmante),
    [firmante],
  );
  const vrng = useMemo(
    () => new ethers.Contract(VRNG, ABI_VRNG, firmante),
    [firmante],
  );

  const cargar = useCallback(async () => {
    try {
      const total = Number(await hub.nextRaffleId!());
      const lista: Item[] = [];
      for (let id = 0; id < total; id++) {
        const r = (await hub.verRaffle!(id)) as unknown as Raffle;
        lista.push({
          id,
          r,
          mios: Number(await hub.ticketsOf!(id, cuenta.dir)),
        });
      }
      setRaffles(lista);
    } catch {
      setAviso({
        tipo: "error",
        texto: "No se pudo leer la blockchain local. Esta corriendo anvil?",
      });
    }
    setCargando(false);
  }, [hub, cuenta.dir]);

  // `v` sube cuando el header retira saldo: tambien hay que releer desde aca.
  useEffect(() => {
    setCargando(true);
    cargar();
  }, [cargar, v]);

  /// Manda la transaccion, espera a que entre y vuelve a leer todo. El mensaje
  /// de error sale tal cual lo devuelve el contrato, sin el prefijo tecnico.
  const ejecutar = async (
    texto: string,
    fn: () => Promise<ethers.ContractTransactionResponse>,
  ) => {
    setOcupado(true);
    setAviso(null);
    try {
      const tx = await fn();
      await tx.wait();
      setAviso({ tipo: "ok", texto });
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setAviso({
        tipo: "error",
        texto: (err.shortMessage || err.message || "").replace(
          "execution reverted: ",
          "",
        ),
      });
    }
    setOcupado(false);
    await cargar();
    // Avisa al header, que tiene los saldos y esta fuera de esta isla.
    refresh();
  };

  const acciones: Actions = {
    comprar: (id, cant, precio) =>
      ejecutar(`Compraste ${cant} ticket${cant > 1 ? "s" : ""}`, () =>
        hub.buyTickets!(id, cant, { value: precio * BigInt(cant) }),
      ),
    forzar: (id) => ejecutar("Forzaste el sorteo", () => hub.forzarSorteo!(id)),
    retirarNFT: (id) => ejecutar("Retiraste el NFT", () => hub.retirarNFT!(id)),
    reembolso: (id) =>
      ejecutar("Recuperaste tu APE", () => hub.reclamarReembolso!(id)),
    // En local no hay vRNG real: esto hace lo que en produccion hace la cadena.
    sortear: (id) =>
      ejecutar("La cadena respondio: ya hay ganador", async () => {
        const r = (await hub.verRaffle!(id)) as unknown as Raffle;
        return vrng.responder!(
          r.pedidoActual,
          ethers.hexlify(ethers.randomBytes(32)),
        );
      }),
  };

  return { cuenta, raffles, cargando, ocupado, aviso, acciones };
}
