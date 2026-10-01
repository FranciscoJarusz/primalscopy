import type { APIRoute } from 'astro';
import { json } from '@/lib/cultomizer/client';
import { readEnvValue } from '@/lib/env';

export const prerender = false;

const BURN_ADDRESS = '0x000000000000000000000000000000000000dead';
const INITIAL_VALUE = 987.12;

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

const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

function readApiKey() {
    return readEnvValue('APESCAN_API_KEY');
}

export const GET: APIRoute = async () => {
    const apiKey = readApiKey();
    if (!apiKey || PRIMAL_SENDERS.size === 0)
        return json({ value: INITIAL_VALUE, live: false });

    try {
        let totalWei = 0n;

        for (const sender of PRIMAL_SENDERS) {
            for (let page = 1; page <= MAX_PAGES; page += 1) {
                const query = new URLSearchParams({
                    chainid: '33139',
                    module: 'account',
                    action: 'txlist',
                    address: sender,
                    startblock: '0',
                    endblock: '99999999',
                    page: String(page),
                    offset: String(PAGE_SIZE),
                    sort: 'desc',
                    apikey: apiKey,
                });
                const response = await fetch(
                    `https://api.etherscan.io/v2/api?${query}`
                );
                if (!response.ok)
                    throw new Error(`ApeScan respondio ${response.status}`);

                const payload = await response.json();
                if (!Array.isArray(payload.result)) {
                    if (page === 1)
                        throw new Error('ApeScan no devolvio transacciones');
                    break;
                }

                for (const transaction of payload.result) {
                    const to = String(transaction.to || '').toLowerCase();
                    const isSuccessful =
                        String(transaction.isError || '0') === '0';
                    const hash = String(transaction.hash || '').toLowerCase();

                    if (
                        !isSuccessful ||
                        to !== BURN_ADDRESS ||
                        EXCLUDED_TX_HASHES.has(hash)
                    )
                        continue;

                    totalWei += BigInt(transaction.value || '0');
                }

                if (payload.result.length < PAGE_SIZE) break;
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
