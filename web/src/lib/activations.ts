import { BACKEND_URL } from '@/lib/backend';

export type Estado = 'finished' | 'live' | 'progress' | 'upcoming';
export type Grupo = 'coming' | 'live' | 'finished';

export interface Activation {
    id: string;
    title: string;
    text: string;
    status: Estado;
    category: string;
    date: string;
    image: string | null;
    fit: 'cover' | 'contain';
    href: string;
}

export interface ActivationAdmin extends Activation {
    enabled: boolean;
}

export const ETIQUETA: Record<Estado, string> = {
    finished: 'Finished',
    live: 'Live',
    progress: 'In progress',
    upcoming: 'Upcoming',
};

export const INSIGNIA: Record<Estado, string> = {
    finished: 'bg-yellow text-darkblue',
    live: 'bg-lightblue text-darkblue',
    progress: 'bg-red text-lightblue',
    upcoming: 'bg-red text-lightblue',
};

export const grupo = (estado: Estado): Grupo =>
    estado === 'progress' || estado === 'upcoming' ? 'coming' : estado;

export const imagenActivation = (image: string | null, base = BACKEND_URL) =>
    !image ? null : image.startsWith('/') ? image : `${base}/activations/images/${image}`;

export const esExterno = (href: string) => href.startsWith('https://');
