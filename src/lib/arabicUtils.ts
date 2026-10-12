// Arabic Unicode Block metadata, cursive joining definitions, and Tatweel/Kashida presets
// Covers:
// - Arabic (U+0600 - U+06FF)
// - Arabic Supplement (U+0750 - U+077F)
// - Arabic Extended-B (U+0870 - U+089F)
// - Arabic Extended-A (U+08A0 - U+08FF)
// - Arabic Presentation Forms-A (U+FB50 - U+FDFF)
// - Arabic Presentation Forms-B (U+FE70 - U+FEFF)
// - Arabic Extended-C (U+10EC0 - U+10EFF)
// - Arabic Mathematical Alphabetic Symbols (U+1EE00 - U+1EEFF)

export interface ArabicJoiningGroup {
  name: string;
  description: string;
  sample: string;
  sampleConnected: string;
  codepoints: number[];
}

export const ARABIC_TATWEEL_CODEPOINTS = [
  0x0640, // ARABIC TATWEEL (Kashida)
  0x0640, // standard elongation
];

// Check if a codepoint belongs to any Arabic Unicode block
export function isArabicCodepoint(cp: number): boolean {
  return (
    (cp >= 0x0600 && cp <= 0x06FF) || // Arabic
    (cp >= 0x0750 && cp <= 0x077F) || // Arabic Supplement
    (cp >= 0x0870 && cp <= 0x089F) || // Arabic Extended-B
    (cp >= 0x08A0 && cp <= 0x08FF) || // Arabic Extended-A
    (cp >= 0xFB50 && cp <= 0xFDFF) || // Arabic Presentation Forms-A
    (cp >= 0xFE70 && cp <= 0xFEFF) || // Arabic Presentation Forms-B
    (cp >= 0x10EC0 && cp <= 0x10EFF) || // Arabic Extended-C
    (cp >= 0x1EE00 && cp <= 0x1EEFF) // Arabic Mathematical Alphabetic Symbols
  );
}

// Arabic Joining types according to Unicode ArabicShaping.txt
export type ArabicJoiningType = 'D' | 'R' | 'L' | 'U' | 'C' | 'T';
// D = Dual joining (connects on both right & left)
// R = Right joining (connects only to the right / previous char)
// L = Left joining
// U = Non-joining (transparent or isolated)
// C = Join-causing (Tatweel U+0640, ZWJ U+200D)
// T = Transparent (combining diacritics / Harakat)

export function getArabicJoiningType(cp: number): ArabicJoiningType {
  // Tatweel / Kashida (U+0640) and ZWJ (U+200D)
  if (cp === 0x0640 || cp === 0x200D) return 'C';
  // ZWNJ (U+200C)
  if (cp === 0x200C) return 'U';

  // Combining marks / Harakat (Transparent)
  if (
    (cp >= 0x0610 && cp <= 0x061A) ||
    (cp >= 0x064B && cp <= 0x065F) ||
    (cp >= 0x0670 && cp <= 0x0670) ||
    (cp >= 0x06D6 && cp <= 0x06DC) ||
    (cp >= 0x06DF && cp <= 0x06E4) ||
    (cp >= 0x06E7 && cp <= 0x06E8) ||
    (cp >= 0x06EA && cp <= 0x06ED) ||
    (cp >= 0x08D3 && cp <= 0x08E1) ||
    (cp >= 0x08E3 && cp <= 0x08FF)
  ) {
    return 'T';
  }

  // Right-joining letters (connect to preceding letter, but do NOT connect to following letter)
  // e.g. Alef, Dal, Dhal, Reh, Zain, Waw, Teh Marbuta, and extended variants
  const rightJoiners = new Set([
    0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629, 0x062F, 0x0630, 0x0631, 0x0632,
    0x0648, 0x0649, 0x0671, 0x0672, 0x0673, 0x0675, 0x0676, 0x0677, 0x0688, 0x0689,
    0x068A, 0x068B, 0x068C, 0x068D, 0x068E, 0x068F, 0x0690, 0x0691, 0x0692, 0x0693,
    0x0694, 0x0695, 0x0696, 0x0697, 0x0698, 0x0699, 0x06C4, 0x06C5, 0x06C6, 0x06C7,
    0x06C8, 0x06C9, 0x06CA, 0x06CB, 0x06CD, 0x06CF, 0x06EE, 0x06EF, 0x0759, 0x075A,
    0x075B, 0x076B, 0x076C, 0x0771, 0x0773, 0x0774, 0x0778, 0x0779, 0x0883, 0x0884,
    0x0885, 0x08AA, 0x08AB, 0x08AC
  ]);
  if (rightJoiners.has(cp)) return 'R';

  // Dual-joining letters (Baa, Taa, Thaa, Jeem, Haa, Khaa, Seen, Sheen, Saad, Daad, Taa, Zaa, Ayn, Ghayn, Faa, Qaaf, Kaaf, Laam, Meem, Noon, Haa, Yaa, etc.)
  if (
    (cp >= 0x0626 && cp <= 0x0628) ||
    (cp >= 0x062A && cp <= 0x062E) ||
    (cp >= 0x0633 && cp <= 0x063A) ||
    (cp >= 0x0641 && cp <= 0x0647) ||
    (cp >= 0x064A && cp <= 0x064A) ||
    (cp >= 0x0678 && cp <= 0x0687) ||
    (cp >= 0x069A && cp <= 0x06BF) ||
    (cp >= 0x06C0 && cp <= 0x06C3) ||
    (cp >= 0x06CC && cp <= 0x06CE) ||
    (cp >= 0x06D0 && cp <= 0x06D3) ||
    (cp >= 0x0750 && cp <= 0x0758) ||
    (cp >= 0x075C && cp <= 0x076A) ||
    (cp >= 0x076D && cp <= 0x0770) ||
    (cp >= 0x0772 && cp <= 0x0772) ||
    (cp >= 0x0775 && cp <= 0x0777) ||
    (cp >= 0x077A && cp <= 0x077F) ||
    (cp >= 0x0870 && cp <= 0x0882) ||
    (cp >= 0x0886 && cp <= 0x089F) ||
    (cp >= 0x08A0 && cp <= 0x08A9) ||
    (cp >= 0x08AD && cp <= 0x08C8)
  ) {
    return 'D';
  }

  // Non-joining (Numbers, punctuations, signs, etc.)
  return 'U';
}

// Arabic Presentation Forms descriptions for quick lookup & proper ligature inspection
export const ARABIC_LIGATURE_INFO: Record<number, { name: string; type: string; baseChars: string }> = {
  // Common presentation forms (Isolated, Final, Initial, Medial)
  0xFE8E: { name: 'Alef Final', type: 'Final', baseChars: 'ـا' },
  0xFE8F: { name: 'Baa Isolated', type: 'Isolated', baseChars: 'ب' },
  0xFE90: { name: 'Baa Final', type: 'Final', baseChars: 'ـب' },
  0xFE91: { name: 'Baa Initial', type: 'Initial', baseChars: 'بـ' },
  0xFE92: { name: 'Baa Medial', type: 'Medial', baseChars: 'ـبـ' },
  0xFEFB: { name: 'Lam-Alef Ligature Isolated', type: 'Ligature', baseChars: 'لا' },
  0xFEFC: { name: 'Lam-Alef Ligature Final', type: 'Ligature', baseChars: 'ـلا' },
  0xFEF7: { name: 'Lam-Alef with Hamza Above Isolated', type: 'Ligature', baseChars: 'لأ' },
  0xFEF8: { name: 'Lam-Alef with Hamza Above Final', type: 'Ligature', baseChars: 'ـلأ' },
  0xFEF9: { name: 'Lam-Alef with Hamza Below Isolated', type: 'Ligature', baseChars: 'لإ' },
  0xFEFA: { name: 'Lam-Alef with Hamza Below Final', type: 'Ligature', baseChars: 'ـلإ' },
  0xFEF5: { name: 'Lam-Alef with Madda Above Isolated', type: 'Ligature', baseChars: 'لآ' },
  0xFEF6: { name: 'Lam-Alef with Madda Above Final', type: 'Ligature', baseChars: 'ـلآ' },
  // Common ligatures in Presentation Forms-A
  0xFDF2: { name: 'Allah Ligature', type: 'Ligature', baseChars: 'اللّٰه' },
  0xFDFD: { name: 'Bismillah Ligature', type: 'Ligature', baseChars: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' },
  0xFD3E: { name: 'Ornate Left Parenthesis', type: 'Punctuation', baseChars: '﴾' },
  0xFD3F: { name: 'Ornate Right Parenthesis', type: 'Punctuation', baseChars: '﴿' },
  0x0640: { name: 'Arabic Tatweel (Kashida)', type: 'Elongation', baseChars: 'ـ' }
};

// Generates a fixed Tatweel path centered at standard baseline
export function generateTatweelPath(unitsPerEm: number = 1000): { path: any; advanceWidth: number } {
  // Tatweel connects cursive Arabic letters at the baseline (Y=0)
  // Height: ~120 units (from Y=-30 to Y=+90)
  // Width: standard advance width ~500 units (running completely from X=0 to X=advanceWidth for seamless cursive joining)
  const advanceWidth = Math.round(unitsPerEm * 0.5); // 500
  const yBottom = -Math.round(unitsPerEm * 0.03); // -30
  const yTop = Math.round(unitsPerEm * 0.09); // +90

  // We return path commands format compatible with opentype.js Path
  return {
    advanceWidth,
    path: {
      commands: [
        { type: 'M', x: 0, y: yBottom },
        { type: 'L', x: advanceWidth, y: yBottom },
        { type: 'L', x: advanceWidth, y: yTop },
        { type: 'L', x: 0, y: yTop },
        { type: 'Z' }
      ]
    }
  };
}
