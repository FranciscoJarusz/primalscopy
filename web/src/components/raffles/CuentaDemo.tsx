import SelectorCuenta from '@/components/raffles/SelectorCuenta';
import { useDemoAccount } from '@/hooks/raffles/useDemoAccount';
import { ACCOUNTS } from '@/lib/raffles/accounts';

/// El widget que raffles pone a la derecha del header, en lugar de la wallet.
///
/// Raffles todavia firma con claves locales: este selector maneja el
/// `accountIndex` que despues lee `useRaffles`. Cuando llegue la wallet de
/// verdad, esto se borra y el header usa su slot por defecto.
export default function CuentaDemo() {
    const { indice, setIndice, saldo, claim, ocupado, retirar } =
        useDemoAccount();

    return (
        <SelectorCuenta
            cuentas={ACCOUNTS}
            indice={indice}
            setIndice={setIndice}
            saldo={saldo}
            claim={claim}
            ocupado={ocupado}
            onRetirar={retirar}
        />
    );
}
