

import type { ColorFontData } from './lib/colorFontUtils';

export interface UploadedFont {
  id: string;
  name: string;
  fileName: string;
  file: File;
  buffer?: ArrayBuffer;
  dataUrl?: string;
  parsed?: any;
  fontFamilyName: string; // Used for @font-face
  color: string;
  isHidden?: boolean;
  hasColor?: boolean;
  colorData?: ColorFontData;
  supportedCodePoints?: Set<number>;
}

export interface UnicodeBlock {
  name: string;
  start: number;
  end: number;
}

export type GlyphMapping = Record<number, string>; // Codepoint -> fontId
