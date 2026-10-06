/**
 * Genera las 5 pistas de música de fondo de Estudio Voz.
 * Música 100% ORIGINAL: compuesta y sintetizada por código en este script
 * (sin samples, sin MIDI externos, sin material con copyright).
 * Técnicas: síntesis aditiva, piano aditivo, Karplus-Strong (guitarra),
 * percusión sintetizada, reverb Schroeder y masterización suave.
 *
 * Uso: npm run generar-musica   (requiere `npm install` previo por lamejs)
 * Salida: public/musica/*.mp3 (128 kbps) + LICENCIA.md
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMp3Encoder } from 'wasm-media-encoders';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'public', 'musica');
mkdirSync(DESTINO, { recursive: true });

const SR = 44100;

/* ── Utilidades ─────────────────────────────────────────────── */

function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function crearPista(segundos) {
  const n = Math.ceil(segundos * SR);
  return { izq: new Float32Array(n), der: new Float32Array(n), n };
}

function sumarOnda(pista, desdeSeg, durSeg, fn, ganancia = 1, panorama = 0) {
  const inicio = Math.floor(desdeSeg * SR);
  const total = Math.min(pista.n - inicio, Math.floor(durSeg * SR));
  const gIzq = ganancia * Math.cos(((panorama + 1) * Math.PI) / 4);
  const gDer = ganancia * Math.sin(((panorama + 1) * Math.PI) / 4);
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    const v = fn(t, i);
    pista.izq[inicio + i] += v * gIzq;
    pista.der[inicio + i] += v * gDer;
  }
}

/** Reverb Schroeder sencilla (4 peines + 2 pasa-todo) en estéreo. */
function aplicarReverb(pista, cantidad = 0.25, semilla = 7) {
  const rnd = mulberry32(semilla);
  const retardosPeine = [1557, 1617, 1491, 1422].map((d) => d + Math.floor(rnd() * 40));
  const retardosTodo = [225, 556].map((d) => d + Math.floor(rnd() * 20));

  const procesarCanal = (entrada) => {
    const n = entrada.length;
    let senal = new Float32Array(n);
    // Peines en paralelo
    for (const d of retardosPeine) {
      const buf = new Float32Array(d);
      let idx = 0;
      const retro = 0.84;
      for (let i = 0; i < n; i++) {
        const v = entrada[i] + buf[idx] * retro;
        senal[i] += v;
        buf[idx] = v;
        idx = (idx + 1) % d;
      }
    }
    // Pasa-todo en serie
    for (const d of retardosTodo) {
      const buf = new Float32Array(d);
      let idx = 0;
      const g = 0.5;
      const salida = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const v = senal[i];
        const b = buf[idx];
        salida[i] = -g * v + b;
        buf[idx] = v + g * b;
        idx = (idx + 1) % d;
      }
      senal = salida;
    }
    return senal;
  };

  // La reverb completa es costosa: se aplica a una versión reducida (mezcla mono diezmada).
  const mono = new Float32Array(pista.n);
  for (let i = 0; i < pista.n; i++) mono[i] = (pista.izq[i] + pista.der[i]) * 0.5;
  const mojado = procesarCanal(mono);
  const escala = 0.28;
  for (let i = 0; i < pista.n; i++) {
    pista.izq[i] += mojado[i] * cantidad * escala;
    pista.der[i] += mojado[i] * cantidad * escala * 0.9;
  }
}

function fundido(pista, seg) {
  const n = Math.floor(seg * SR);
  for (let i = 0; i < n && i < pista.n; i++) {
    const g = i / n;
    pista.izq[i] *= g;
    pista.der[i] *= g;
    const j = pista.n - 1 - i;
    pista.izq[j] *= g;
    pista.der[j] *= g;
  }
}

function masterizar(pista) {
  let pico = 0;
  for (let i = 0; i < pista.n; i++) {
    const a = Math.abs(pista.izq[i]);
    const b = Math.abs(pista.der[i]);
    if (a > pico) pico = a;
    if (b > pico) pico = b;
  }
  const g = pico > 0 ? 0.89 / pico : 1;
  for (let i = 0; i < pista.n; i++) {
    // Recorte suave
    pista.izq[i] = Math.tanh(pista.izq[i] * g * 1.1);
    pista.der[i] = Math.tanh(pista.der[i] * g * 1.1);
  }
}

/** Control de calidad objetivo: picos, RMS, offset DC y silencios largos. */
function analizar(pista, nombre) {
  let pico = 0;
  let suma = 0;
  let sumaDC = 0;
  let muestrasSilencio = 0;
  let rachaSilencio = 0;
  let maxRacha = 0;
  for (let i = 0; i < pista.n; i++) {
    const m = (pista.izq[i] + pista.der[i]) / 2;
    const a = Math.abs(m);
    if (a > pico) pico = a;
    suma += m * m;
    sumaDC += m;
    if (a < 0.004) {
      rachaSilencio++;
      muestrasSilencio++;
    } else {
      if (rachaSilencio > maxRacha) maxRacha = rachaSilencio;
      rachaSilencio = 0;
    }
  }
  const rms = Math.sqrt(suma / pista.n);
  const dc = Math.abs(sumaDC / pista.n);
  const pctSilencio = ((muestrasSilencio / pista.n) * 100).toFixed(1);
  const maxRachaSeg = (maxRacha / SR).toFixed(1);
  const avisos = [];
  if (pico > 0.999) avisos.push('CLIPPING');
  if (rms < 0.02) avisos.push('MUY_BAJO');
  if (rms > 0.5) avisos.push('MUY_ALTO');
  if (dc > 0.01) avisos.push('DC_OFFSET');
  if (Number(maxRachaSeg) > 4) avisos.push('SILENCIO_LARGO');
  console.log(
    `  QA ${nombre}: pico=${pico.toFixed(3)} rms=${rms.toFixed(3)} dc=${dc.toFixed(4)} silencio=${pctSilencio}% racha_max=${maxRachaSeg}s${avisos.length ? ' ⚠ ' + avisos.join(',') : ''}`,
  );
}

async function aMp3(pista, bitrateKbps = 128) {
  const codificador = await createMp3Encoder();
  codificador.configure({ channels: 2, sampleRate: SR, bitrate: bitrateKbps });
  const partes = [];
  const BLOQUE = 115200;
  for (let i = 0; i < pista.n; i += BLOQUE) {
    const salida = codificador.encode([
      pista.izq.slice(i, i + BLOQUE),
      pista.der.slice(i, i + BLOQUE),
    ]);
    // El buffer devuelto pertenece al codificador: hay que copiarlo.
    if (salida.length > 0) partes.push(Buffer.from(salida.slice()));
  }
  const fin = codificador.finalize();
  if (fin.length > 0) partes.push(Buffer.from(fin.slice()));
  return Buffer.concat(partes);
}

/* ── Voces de síntesis ──────────────────────────────────────── */

/** Pad cálido: senos con desafinación leve + 2º armónico. */
function vozPad(frec, t, ataque, dur) {
  const env = Math.min(1, t / ataque) * Math.min(1, (dur - t) / ataque);
  const lfo = 1 + 0.12 * Math.sin(2 * Math.PI * 0.07 * t);
  return (
    env *
    lfo *
    (Math.sin(2 * Math.PI * frec * t) * 0.6 +
      Math.sin(2 * Math.PI * frec * 1.003 * t) * 0.5 +
      Math.sin(2 * Math.PI * frec * 0.997 * t) * 0.5 +
      Math.sin(4 * Math.PI * frec * t) * 0.18)
  );
}

/** Nota de piano aditiva con caída exponencial por armónico. */
function vozPiano(frec, t, velocidad) {
  if (t < 0) return 0;
  const d1 = Math.exp(-t * 2.2);
  return (
    velocidad *
    (Math.sin(2 * Math.PI * frec * t) * d1 +
      Math.sin(4 * Math.PI * frec * t) * 0.45 * Math.exp(-t * 3.4) +
      Math.sin(6 * Math.PI * frec * t) * 0.22 * Math.exp(-t * 5) +
      Math.sin(8 * Math.PI * frec * t) * 0.1 * Math.exp(-t * 7))
  );
}

/** Pulso corto (arpegios): triángulo con caída rápida. */
function vozPulso(frec, t, velocidad) {
  if (t < 0 || t > 1.2) return 0;
  const env = Math.exp(-t * 7);
  const fase = 2 * Math.PI * frec * t;
  const tri = (2 / Math.PI) * Math.asin(Math.sin(fase));
  return velocidad * env * (tri * 0.8 + Math.sin(2 * fase) * 0.2);
}

/** Cuerda pulsada Karplus-Strong: precomputa la nota completa (O(n)). */
function notaCuerda(frec, durSeg, velocidad, semilla) {
  const N = Math.max(2, Math.round(SR / frec));
  const m = Math.floor(Math.min(durSeg, 3.2) * SR);
  const rnd = mulberry32(semilla);
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = (rnd() * 2 - 1) * velocidad;
  const salida = new Float32Array(m);
  let idx = 0;
  const decaimiento = 0.996;
  for (let i = 0; i < m; i++) {
    const actual = buf[idx];
    const sig = buf[(idx + 1) % N];
    buf[idx] = decaimiento * 0.5 * (actual + sig);
    salida[i] = actual;
    idx = (idx + 1) % N;
  }
  return salida;
}

/** Suma muestras precomputadas en una posición (con panorama). */
function sumarMuestras(pista, desdeSeg, muestras, ganancia = 1, panorama = 0) {
  const inicio = Math.floor(desdeSeg * SR);
  const total = Math.min(muestras.length, pista.n - inicio);
  if (total <= 0 || inicio < 0) return;
  const gIzq = ganancia * Math.cos(((panorama + 1) * Math.PI) / 4);
  const gDer = ganancia * Math.sin(((panorama + 1) * Math.PI) / 4);
  for (let i = 0; i < total; i++) {
    pista.izq[inicio + i] += muestras[i] * gIzq;
    pista.der[inicio + i] += muestras[i] * gDer;
  }
}

/** Bombo sintetizado. */
function vozBombo(t) {
  if (t < 0 || t > 0.4) return 0;
  const f = 52 + 110 * Math.exp(-t * 40);
  return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14);
}

/** Caja: ruido + cuerpo. */
function vozCaja(t, rnd) {
  if (t < 0 || t > 0.25) return 0;
  const ruido = (rnd() * 2 - 1) * Math.exp(-t * 30);
  const cuerpo = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 25) * 0.6;
  return (ruido * 0.5 + cuerpo) * 0.8;
}

/** Charles: ruido corto. */
function vozCharles(t, rnd, abierto = false) {
  const dur = abierto ? 0.3 : 0.05;
  if (t < 0 || t > dur) return 0;
  return (rnd() * 2 - 1) * Math.exp(-t * (abierto ? 12 : 90)) * 0.35;
}

/* ── 1. AMBIENTE ────────────────────────────────────────────── */

function pistaAmbiente() {
  const p = crearPista(76);
  const acordes = [
    { bajo: 45, notas: [57, 60, 64, 67, 71], inicio: 0 }, // Am9
    { bajo: 41, notas: [53, 57, 60, 65, 67], inicio: 18 }, // Fmaj9
    { bajo: 36, notas: [55, 60, 64, 67, 71], inicio: 36 }, // Cmaj9
    { bajo: 43, notas: [55, 59, 62, 64, 66], inicio: 54 }, // G6
  ];
  const durAcorde = 22;
  for (const ac of acordes) {
    const fb = mtof(ac.bajo);
    sumarOnda(p, ac.inicio, durAcorde, (t) => vozPad(fb, t, 6, durAcorde) * 0.5, 0.5, 0);
    ac.notas.forEach((n, i) => {
      const f = mtof(n);
      const pan = (i / (ac.notas.length - 1) - 0.5) * 0.8;
      sumarOnda(p, ac.inicio, durAcorde, (t) => vozPad(f, t, 6, durAcorde), 0.16, pan);
      // Brillo una octava arriba, muy suave
      sumarOnda(p, ac.inicio, durAcorde, (t) => vozPad(f * 2, t, 8, durAcorde), 0.035, pan);
    });
  }
  aplicarReverb(p, 0.5, 11);
  fundido(p, 4);
  masterizar(p);
  return p;
}

/* ── 2. PIANO ───────────────────────────────────────────────── */

function pistaPiano() {
  const p = crearPista(84);
  const rnd = mulberry32(21);
  // 8 segmentos de 10 s: C G Am F | C G F C
  const segmentos = [
    { acorde: [48, 55, 64], bajo: 36, melodia: [64, 67, 69, 67] },
    { acorde: [43, 50, 59], bajo: 43, melodia: [62, 59, 62, 67] },
    { acorde: [45, 52, 60], bajo: 45, melodia: [60, 64, 69, 64] },
    { acorde: [41, 48, 57], bajo: 41, melodia: [65, 69, 72, 69] },
    { acorde: [48, 55, 64], bajo: 36, melodia: [67, 64, 62, 64] },
    { acorde: [43, 50, 59], bajo: 43, melodia: [59, 62, 67, 71] },
    { acorde: [41, 48, 57], bajo: 41, melodia: [69, 67, 65, 64] },
    { acorde: [48, 55, 64], bajo: 36, melodia: [62, 64, 60, 0] },
  ];
  const segDur = 10;
  segmentos.forEach((s, si) => {
    const t0 = si * segDur;
    // Bajo suave
    sumarOnda(p, t0, 6, (t) => vozPiano(mtof(s.bajo), t, 0.5), 0.5, -0.2);
    // Acorde arpegiado suave al inicio
    s.acorde.forEach((n, i) => {
      sumarOnda(p, t0 + i * 0.35, 5, (t) => vozPiano(mtof(n), t, 0.32), 0.4, 0.15);
    });
    // Melodía: 4 notas
    s.melodia.forEach((n, i) => {
      if (n === 0) return;
      const dur = i === 3 ? 3.2 : 1.9;
      const vel = 0.55 + rnd() * 0.15;
      const tt = t0 + 1.2 + i * 2.1;
      sumarOnda(p, tt, dur + 1.5, (t) => vozPiano(mtof(n), t, vel), 0.62, 0.1);
    });
  });
  aplicarReverb(p, 0.35, 22);
  fundido(p, 3);
  masterizar(p);
  return p;
}

/* ── 3. CHILL ───────────────────────────────────────────────── */

function pistaChill() {
  const p = crearPista(78);
  const rnd = mulberry32(33);
  const bpm = 84;
  const beat = 60 / bpm;
  const compas = beat * 4;
  const acordes = [
    { bajo: 45, notas: [57, 60, 64, 67] }, // Am7
    { bajo: 38, notas: [57, 60, 65, 69] }, // Dm7
    { bajo: 43, notas: [59, 62, 65, 67] }, // G7
    { bajo: 36, notas: [55, 60, 64, 67] }, // Cmaj7
  ];
  const compases = 24;
  for (let c = 0; c < compases; c++) {
    const t0 = c * compas;
    const ac = acordes[c % 4];
    const swing = 0.11 * beat;
    // Batería
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * beat;
      if (b === 0 || b === 2) sumarOnda(p, tb, 0.4, (t) => vozBombo(t), 0.85, 0);
      if (b === 1 || b === 3) sumarOnda(p, tb, 0.25, (t) => vozCaja(t, rnd), 0.5, 0.1);
      // Charles a corcheas con swing
      for (let s = 0; s < 2; s++) {
        const th = tb + s * beat * 0.5 + (s === 1 ? swing : 0);
        const vel = s === 0 ? 1 : 0.7;
        sumarOnda(p, th, 0.1, (t) => vozCharles(t, rnd) * vel, 0.5, -0.1);
      }
    }
    // Bajo (tónica, ritmo sincopado suave)
    const fb = mtof(ac.bajo);
    sumarOnda(p, t0, 1.2, (t) => Math.sin(2 * Math.PI * fb * t) * Math.exp(-t * 3) * 0.55, 0.6, -0.25);
    sumarOnda(p, t0 + beat * 2.5, 1.0, (t) => Math.sin(2 * Math.PI * fb * t) * Math.exp(-t * 3) * 0.45, 0.6, -0.25);
    // Rhodes: acordes en contratiempo
    ac.notas.forEach((n) => {
      const f = mtof(n);
      const notaRhodes = (t) => {
        if (t < 0 || t > 2.2) return 0;
        const trem = 1 + 0.25 * Math.sin(2 * Math.PI * 4.2 * t);
        return (
          trem *
          Math.exp(-t * 2.4) *
          (Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(4 * Math.PI * f * t) * 0.22)
        );
      };
      sumarOnda(p, t0 + beat * 0.5, 2.4, notaRhodes, 0.3, 0.2);
      sumarOnda(p, t0 + beat * 2.5 + swing * 0.5, 2.4, notaRhodes, 0.24, 0.2);
    });
    // Vinilo: crujidos esporádicos
    for (let k = 0; k < 6; k++) {
      const tc = t0 + rnd() * compas;
      const amp = (rnd() * 2 - 1) * 0.05;
      sumarOnda(p, tc, 0.02, (t) => amp * Math.exp(-t * 400), 0.5, rnd() * 0.6 - 0.3);
    }
  }
  aplicarReverb(p, 0.22, 34);
  fundido(p, 3);
  masterizar(p);
  return p;
}

/* ── 4. INSPIRACIÓN ─────────────────────────────────────────── */

function pistaInspiracion() {
  const p = crearPista(78);
  const rnd = mulberry32(44);
  const bpm = 100;
  const beat = 60 / bpm;
  const semicorchea = beat / 4;
  // D A Bm G — 2 compases por acorde, 4 vueltas
  const acordes = [
    [50, 54, 57, 62], // D
    [45, 49, 52, 57], // A
    [47, 50, 54, 59], // Bm
    [43, 47, 50, 55], // G
  ];
  const compas = beat * 4;
  const totalCompases = 28;
  for (let c = 0; c < totalCompases; c++) {
    const t0 = c * compas;
    const ac = acordes[c % 4];
    const vuelta = Math.floor(c / 4);
    const energia = Math.min(1, 0.55 + vuelta * 0.18);
    // Pad del compás
    ac.forEach((n) => {
      const f = mtof(n);
      sumarOnda(p, t0, compas, (t) => vozPad(f, t, 1.2, compas) * 0.5, 0.14 * energia, 0);
    });
    // Arpegio en semicorcheas (sube y baja dos octavas)
    const patron = [...ac, ...ac.map((n) => n + 12)].reverse();
    const notasArp = [...ac, ...ac.map((n) => n + 12), ...patron.slice(1)];
    for (let s = 0; s < 16; s++) {
      const n = notasArp[s % notasArp.length];
      const vel = (s % 4 === 0 ? 0.5 : 0.34) * energia * (0.9 + rnd() * 0.2);
      sumarOnda(p, t0 + s * semicorchea, 1.0, (t) => vozPulso(mtof(n), t, vel), 0.5, s % 2 ? 0.25 : -0.25);
    }
    // Bajo en la segunda mitad
    if (vuelta >= 1) {
      const fb = mtof(ac[0] - 12);
      for (let b = 0; b < 4; b++) {
        sumarOnda(
          p,
          t0 + b * beat,
          0.5,
          (t) => Math.sin(2 * Math.PI * fb * t) * Math.exp(-t * 6) * 0.5,
          0.55,
          -0.1,
        );
      }
    }
  }
  // Resolución final: acorde de D sostenido
  const tFin = totalCompases * compas;
  [50, 54, 57, 62, 66].forEach((n) => {
    sumarOnda(p, tFin - 4, 5, (t) => vozPad(mtof(n), t, 1.5, 5) * 0.6, 0.2, 0);
  });
  aplicarReverb(p, 0.3, 45);
  fundido(p, 3);
  masterizar(p);
  return p;
}

/* ── 5. ACÚSTICO (Karplus-Strong) ───────────────────────────── */

function pistaAcustico() {
  const p = crearPista(82);
  const rnd = mulberry32(55);
  const beat = 60 / 92;
  const compas = beat * 4;
  // G Em C D — voicings para fingerpicking (de grave a agudo)
  const acordes = [
    [43, 50, 55, 59, 62], // G
    [40, 47, 52, 55, 59], // Em
    [48, 52, 55, 60, 64], // C
    [45, 50, 54, 57, 62], // D
  ];
  // Patrón de 8 corcheas por compás (índices de cuerda)
  const patron = [0, 2, 1, 3, 2, 4, 3, 2];
  const compases = 26;
  let semilla = 100;
  for (let c = 0; c < compases; c++) {
    const t0 = c * compas;
    const ac = acordes[c % 4];
    for (let s = 0; s < 8; s++) {
      const cuerda = patron[s % patron.length] % ac.length;
      const n = ac[cuerda];
      const vel = (s === 0 ? 0.75 : 0.5) * (0.88 + rnd() * 0.24);
      const tt = t0 + s * (compas / 8) + (rnd() * 2 - 1) * 0.008;
      const pan = (cuerda / ac.length - 0.5) * 0.5;
      const muestras = notaCuerda(mtof(n), 3.0, vel, semilla++);
      sumarMuestras(p, tt, muestras, 0.55, pan);
    }
  }
  aplicarReverb(p, 0.28, 56);
  fundido(p, 3);
  masterizar(p);
  return p;
}

/* ── Principal ──────────────────────────────────────────────── */

const PISTAS = [
  ['ambiente', 'Ambiente', pistaAmbiente],
  ['piano', 'Piano', pistaPiano],
  ['chill', 'Chill', pistaChill],
  ['inspiracion', 'Inspiración', pistaInspiracion],
  ['acustico', 'Acústico', pistaAcustico],
];

console.log('Generando 5 pistas originales…');
for (const [id, nombre, fn] of PISTAS) {
  const t0 = Date.now();
  const pista = fn();
  analizar(pista, nombre);
  const mp3 = await aMp3(pista, 128);
  const ruta = join(DESTINO, `${id}.mp3`);
  writeFileSync(ruta, mp3);
  const seg = (pista.n / SR).toFixed(1);
  console.log(`  ✓ ${nombre}: ${seg} s, ${(mp3.length / 1024 / 1024).toFixed(2)} MB (${Date.now() - t0} ms)`);
}

const licencia = `# Música de fondo — Licencia y procedencia

Las 5 pistas de \`public/musica/\` son **100% originales**: fueron compuestas y
sintetizadas por código en \`scripts/generar-musica.mjs\`, sin samples, sin MIDI
externos y sin material protegido por derechos de autor.

- \`ambiente.mp3\` — Ambiente: pads suaves y atmosféricos (síntesis aditiva).
- \`piano.mp3\` — Piano: melodía original con piano de síntesis aditiva.
- \`chill.mp3\` — Chill: base relajada con percusión y bajo sintetizados.
- \`inspiracion.mp3\` — Inspiración: arpegios positivos y pads.
- \`acustico.mp3\` — Acústico: fingerpicking con síntesis Karplus-Strong (guitarra).

Formato: MP3 128 kbps, 44,1 kHz, estéreo.
Licencia: uso libre dentro de la aplicación, sin atribución requerida.
Para regenerarlas: \`npm run generar-musica\`.
`;
writeFileSync(join(DESTINO, 'LICENCIA.md'), licencia);
console.log('Hecho. Licencia escrita en public/musica/LICENCIA.md');
