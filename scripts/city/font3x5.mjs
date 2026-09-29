// A 3 x 5 pixel font for street names painted on the road (one pixel = one
// block). Rows top to bottom, '#' = paint.
const G = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'], '.': ['...', '...', '...', '...', '.#.'], '-': ['...', '...', '###', '...', '...'],
  "'": ['.#.', '.#.', '...', '...', '...'], ' ': ['...', '...', '...', '...', '...'],
};

// Upper case, without accents; unknown characters become spaces.
export function plainText(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split('').map((c) => (G[c] ? c : ' ')).join('').replace(/\s+/g, ' ').trim();
}

// Spanish street-sign abbreviations keep names short enough for the road.
export function shortStreetName(name) {
  return name
    .replace(/^Calle /i, 'C/ ')
    .replace(/^Avenida (de la |de los |de las |del |de )?/i, 'AV. ')
    .replace(/^Plaza (de la |de los |de las |del |de )?/i, 'PZA. ')
    .replace(/^Paseo (de la |de los |de las |del |de )?/i, 'PASEO ')
    .replace(/^Pasaje /i, 'PJE. ')
    .replace(/^Camino (de la |de los |de las |del |de )?/i, 'CAMINO ')
    .replace(/^Carretera (de la |de los |de las |del |de )?/i, 'CTRA. ');
}

export const GLYPH_W = 3, GLYPH_H = 5, GAP = 1;

// Is pixel (col, row) of the text painted? col counts across the whole text.
export function textPixel(text, col, row) {
  const i = Math.floor(col / (GLYPH_W + GAP)), x = col % (GLYPH_W + GAP);
  if (i < 0 || i >= text.length || x >= GLYPH_W || row < 0 || row >= GLYPH_H) return false;
  return G[text[i]][row][x] === '#';
}

export const textWidth = (text) => text.length * (GLYPH_W + GAP) - GAP;
