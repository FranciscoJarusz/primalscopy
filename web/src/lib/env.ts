import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Lee una variable del entorno y, si no esta, del .env de web. En dev las
// rutas de API no siempre ven las variables que no empiezan con PUBLIC_.
export function readEnvValue(name: string) {
    const directValue = process.env[name] || import.meta.env[name];
    if (directValue) return String(directValue).trim();

    try {
        const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
        return (
            envFile
                .split(/\r?\n/)
                .find((line) => line.startsWith(`${name}=`))
                ?.slice(`${name}=`.length)
                .trim() || ''
        );
    } catch {
        return '';
    }
}
