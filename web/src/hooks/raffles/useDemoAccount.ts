import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { useStore } from "@nanostores/react";
import { accountIndex, version, refresh } from "../../stores/raffles/session";
import { ACCOUNTS } from "../../lib/raffles/accounts";
import { provider, HUB, ABI_HUB } from "../../lib/raffles/contrato";

/// Lo que necesita la barra de arriba: quien sos, cuanto tenes y cuanto podes
/// retirar. Vive aparte de useRaffles porque el header esta en el layout, fuera
/// de la isla del contenido.
export function useDemoAccount() {
  const indice = useStore(accountIndex);
  const v = useStore(version);

  const [saldo, setSaldo] = useState(0n);
  const [claim, setClaim] = useState(0n);
  const [ocupado, setOcupado] = useState(false);

  const cuenta = ACCOUNTS[indice]!;

  const hub = useMemo(
    () => new ethers.Contract(HUB, ABI_HUB, new ethers.Wallet(cuenta.clave, provider)),
    [cuenta.clave],
  );

  const cargar = useCallback(async () => {
    try {
      setSaldo(await provider.getBalance(cuenta.dir));
      setClaim(await hub.saldos!(cuenta.dir));
    } catch {
      // Si no hay cadena, el contenido de la pagina ya avisa del problema.
    }
  }, [hub, cuenta.dir]);

  // `v` esta en las dependencias a proposito: cuando el contenido termina una
  // transaccion, sube la version y esto vuelve a leer los saldos.
  useEffect(() => {
    cargar();
  }, [cargar, v]);

  const retirar = async () => {
    setOcupado(true);
    try {
      const tx = await hub.retirar!();
      await tx.wait();
    } catch {
      // Igual que arriba: el error se ve en el contenido.
    }
    setOcupado(false);
    refresh();
  };

  return {
    cuenta,
    indice,
    setIndice: (i: number) => accountIndex.set(i),
    saldo,
    claim,
    ocupado,
    retirar,
  };
}
