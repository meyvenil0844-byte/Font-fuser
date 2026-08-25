

export interface UploadedFont {
  id: string;
  name: string;
  fileName: string;
  file: File;
  parsed?: any;
  fontFamilyName: string; // Used for @font-face
  color: string;
  isHidden?: boolean;
}

export interface UnicodeBlock {
  name: string;
  start: number;
  end: number;
}

export type GlyphMapping = Record<number, string>; // Codepoint -> fontId
