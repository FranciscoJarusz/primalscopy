import Header from "../shared/Header";
import SelectorCuenta from "./SelectorCuenta";
import { useDemoAccount } from "../../hooks/raffles/useDemoAccount";
import { ACCOUNTS } from "../../lib/raffles/accounts";

/// Lo que el layout monta arriba de todas las pantallas: el header con lo de la
/// cuenta ya enchufado.
///
/// El `Header` de abajo sigue sin saber nada de wallets ni de raffles, asi que
/// se puede copiar al Cultomizer; lo que cambia entre los dos sitios es este
/// envoltorio.
export default function RafflesHeader({ activo = "raffles" }: { activo?: string }) {
  const { indice, setIndice, saldo, claim, ocupado, retirar } = useDemoAccount();

  return (
    <Header activo={activo}>
      <SelectorCuenta
        cuentas={ACCOUNTS}
        indice={indice}
        setIndice={setIndice}
        saldo={saldo}
        claim={claim}
        ocupado={ocupado}
        onRetirar={retirar}
      />
    </Header>
  );
}
