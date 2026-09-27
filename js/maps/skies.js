// Sky panoramas (assets/skies, CC0 from Poly Haven): sun direction measured from the HDR
// (azimuth / elevation in degrees), sun colour, horizon and zenith colours (sRGB 0..1), and the
// fraction of equirect rows kept (from +90 deg down to about -10.8 deg).
export const SKIES = {
  clear:   { az: 36.1, el: 43.0, sun: [1.0, 0.94, 0.86], horizon: [0.8, 0.85, 0.92], zenith: [0.54, 0.65, 0.82], rows: 0.56 },
  golden:  { az: 26.9, el: 36.4, sun: [1.0, 0.61, 0.39], horizon: [0.54, 0.57, 0.62], zenith: [0.65, 0.7, 0.79], rows: 0.56 },
  cumulus: { az: 34.2, el: 48.0, sun: [0.99, 1.0, 0.91], horizon: [0.7, 0.73, 0.79], zenith: [0.67, 0.72, 0.83], rows: 0.56 },
  hazy:    { az: 36.1, el: 43.1, sun: [1.0, 0.79, 0.44], horizon: [0.76, 0.79, 0.75], zenith: [0.5, 0.58, 0.65], rows: 0.56 },
};

const hex = (rgb, k = 1) => rgb.reduce((a, v) => (a << 8) | Math.max(0, Math.min(255, Math.round(v * k * 255))), 0);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Fill the colour fields other systems read (viewmodel lights, environment map, dust)
// from the map's sky, unless the theme sets them explicitly.
export function resolveTheme(T) {
  const s = SKIES[T.sky] || SKIES.clear;
  T.sun ??= hex(s.sun.map((v) => 0.55 + 0.45 * v));
  T.hemi ??= [hex(mix(s.zenith, [1, 1, 1], 0.35)), T.bounce ?? 0x8a7a66];
  T.sky ??= 'clear';
  T.skyCols ??= ['#' + hex(s.zenith).toString(16).padStart(6, '0'), '#' + hex(mix(s.zenith, s.horizon, 0.5)).toString(16).padStart(6, '0'), '#' + hex(s.horizon).toString(16).padStart(6, '0')];
  return T;
}
