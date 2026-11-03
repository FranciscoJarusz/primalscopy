import type { APIRoute } from 'astro';
import { json } from '@/lib/cultomizer/client';
import { readEnvValue } from '@/lib/env';

export const prerender = false;

const BURN_ADDRESS = '0x000000000000000000000000000000000000dead';
const INITIAL_VALUE = 1013.95;

// Transaccion de prueba (1 APE) que no es una quema real y no debe contarse.
const EXCLUDED_TX_HASHES = new Set([
    '0x2cba9b5bd0f6b9288593efb12b59340a002fbdb38922506edc84a894585623b9',
]);

const PRIMAL_SENDERS = new Set(
    (
        readEnvValue('TROUTXYZ_BURN_SENDER') ||
        readEnvValue('PRIMAL_BURN_SENDERS') ||
        ''
    )
        .split(',')
        .map((address: string) => address.trim().toLowerCase())
        .filter(Boolean)
);

const EXPLORADOR = 'https://apechain.calderaexplorer.xyz/api/v2';
const MAX_PAGES = 100;

export const GET: APIRoute = async () => {
    if (PRIMAL_SENDERS.size === 0)
        return json({ value: INITIAL_VALUE, live: false });

    try {
        let totalWei = 0n;

        for (const sender of PRIMAL_SENDERS) {
            const base = `${EXPLORADOR}/addresses/${sender}/transactions?filter=from`;
            let url: string | null = base;
            for (let page = 0; url && page < MAX_PAGES; page += 1) {
                const response: Response = await fetch(url);
                if (!response.ok)
                    throw new Error(`El explorador respondio ${response.status}`);
                const payload: {
                    items?: { to?: { hash?: string }; hash?: string; status?: string; value?: string }[];
                    next_page_params?: Record<string, string> | null;
                } = await response.json();
                if (!Array.isArray(payload.items))
                    throw new Error('El explorador no devolvio transacciones');

                for (const transaction of payload.items) {
                    const to = String(transaction.to?.hash || '').toLowerCase();
                    const hash = String(transaction.hash || '').toLowerCase();
                    if (
                        transaction.status !== 'ok' ||
                        to !== BURN_ADDRESS ||
                        EXCLUDED_TX_HASHES.has(hash)
                    )
                        continue;
                    totalWei += BigInt(transaction.value || '0');
                }

                url = payload.next_page_params
                    ? `${base}&${new URLSearchParams(payload.next_page_params)}`
                    : null;
            }
        }

        const totalValue = Number(totalWei) / 1e18;
        if (!totalValue) {
            return json({ value: INITIAL_VALUE, live: false });
        }

        // El CDN la guarda 10 minutos: sin esto cada visita a /stats le pega a
        // ApeScan, que limita las llamadas por segundo.
        const respuesta = json({ value: totalValue, live: true });
        respuesta.headers.set(
            'Cache-Control',
            'public, s-maxage=600, stale-while-revalidate=3600'
        );
        return respuesta;
    } catch {
        return json({ value: INITIAL_VALUE, live: false });
    }
};
