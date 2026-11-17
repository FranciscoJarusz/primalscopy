// Un "tic" corto, como el de una rueda que pasa por cada clavo. Sin archivos:
// un pulso de Web Audio que baja de tono.
export function crearTic() {
    return (fuerte = false) => {
        try {
            const ctx = contexto();
            const osc = ctx.createOscillator();
            const vol = ctx.createGain();
            const t = ctx.currentTime;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(fuerte ? 880 : 1400, t);
            osc.frequency.exponentialRampToValueAtTime(fuerte ? 440 : 700, t + 0.05);
            vol.gain.setValueAtTime(fuerte ? 0.25 : 0.08, t);
            vol.gain.exponentialRampToValueAtTime(0.001, t + (fuerte ? 0.3 : 0.06));
            osc.connect(vol).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + (fuerte ? 0.3 : 0.07));
        } catch {
            // Sin audio en este navegador: la animacion sigue igual.
        }
    };
}

let compartido: AudioContext | null = null;

function contexto() {
    compartido ??= new AudioContext();
    if (compartido.state === 'suspended') compartido.resume().catch(() => {});
    return compartido;
}

export function prepararAudio() {
    try {
        contexto();
    } catch {
        // Sin audio: no pasa nada.
    }
}

export function sonarPremio(chance: number) {
    try {
        const ctx = contexto();
        const notas = chance >= 0.25 ? 1 : chance >= 0.08 ? 2 : chance >= 0.02 ? 3 : 4;
        const escala = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        for (let n = 0; n <= notas; n++) {
            if (n === notas && notas < 4) break;
            const t = ctx.currentTime + 0.01 + n * 0.11;
            const osc = ctx.createOscillator();
            const vol = ctx.createGain();
            osc.type = n === 4 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(escala[n], t);
            vol.gain.setValueAtTime(0.0001, t);
            vol.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
            vol.gain.exponentialRampToValueAtTime(0.0001, t + (n === notas - 1 || n === 4 ? 0.7 : 0.25));
            osc.connect(vol).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.8);
        }
    } catch {
        // Sin audio: no pasa nada.
    }
}
