import React, { useState } from 'react';
import { X, Palette, Sparkles, Check, Layers, Code, Sliders, Wand2 } from 'lucide-react';
import type { UploadedFont } from '../types';
import { safeStringFromCodePoint } from '../lib/fontUtils';
import { wrapGlyphSvg, buildCpalTable, buildCaplTable, buildColrTable, buildSvgTable, extractColorFontInfo } from '../lib/colorFontUtils';
import { generateUUID } from '../lib/workspace';
import * as opentype from 'opentype.js';

interface ColorGlyphModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCharacters: Set<number>;
  fonts: UploadedFont[];
  setFonts: React.Dispatch<React.SetStateAction<UploadedFont[]>>;
  onApplyColorFont: (newFont: UploadedFont) => void;
}

const PALETTE_PRESETS = [
  { name: 'Rainbow', colors: ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6'] },
  { name: 'Neon Cyber', colors: ['#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#F43F5E'] },
  { name: 'Sunset Glow', colors: ['#F43F5E', '#FB923C', '#FBBF24', '#C084FC'] },
  { name: 'Forest Emerald', colors: ['#10B981', '#059669', '#34D399', '#6EE7B7'] },
  { name: 'Royal Violet', colors: ['#6366F1', '#8B5CF6', '#D946EF', '#EC4899'] },
  { name: 'Gold Luxury', colors: ['#F59E0B', '#D97706', '#FCD34D', '#B45309'] },
  { name: 'Electric Ocean', colors: ['#0284C7', '#0EA5E9', '#38BDF8', '#7DD3FC'] },
];

export function ColorGlyphModal({
  isOpen,
  onClose,
  selectedCharacters,
  fonts,
  setFonts,
  onApplyColorFont
}: ColorGlyphModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<'all' | 'svg' | 'colr'>('all');
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [secondaryColor, setSecondaryColor] = useState('#EC4899');
  const [strokeColor, setStrokeColor] = useState('#1E293B');
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [fontName, setFontName] = useState('ColorFont');
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const charArray = Array.from(selectedCharacters);
  const previewChar = charArray.length > 0 ? charArray[0] : 65; // 'A' default
  const previewCharStr = safeStringFromCodePoint(previewChar) || 'A';

  const handleApplyPreset = (colors: string[]) => {
    if (colors.length >= 1) setPrimaryColor(colors[0]);
    if (colors.length >= 2) setSecondaryColor(colors[1]);
  };

  const handleGenerateColorFont = async () => {
    setIsGenerating(true);
    try {
      const baseFont = fonts[0];
      const em = baseFont?.parsed?.unitsPerEm || 1000;
      const asc = baseFont?.parsed?.ascender || Math.round(em * 0.8);
      const desc = baseFont?.parsed?.descender || -Math.round(em * 0.2);
      
      const newGlyphs: opentype.Glyph[] = [];
      
      // Glyph 0: .notdef
      newGlyphs.push(new opentype.Glyph({
        name: '.notdef',
        unicode: 0,
        advanceWidth: Math.round(em * 0.5),
        path: new opentype.Path()
      }));

      // Palette definition
      const activePalette = [
        primaryColor,
        secondaryColor,
        strokeColor,
        '#FFFFFF',
        '#000000',
        '#10B981',
        '#F59E0B'
      ];

      const svgMap = new Map<number, Uint8Array>();
      const colrBases: { glyphID: number; layers: { glyphID: number; paletteIndex: number }[] }[] = [];
      const encoder = new TextEncoder();

      // For each character
      for (let i = 0; i < charArray.length; i++) {
        const cp = charArray[i];
        const gid = i + 1; // 1-indexed

        // Try getting existing outline from base font if available
        let glyphPath: opentype.Path | null = null;
        let advW = Math.round(em * 0.6);

        if (baseFont?.parsed) {
          const srcGid = baseFont.parsed.charToGlyphIndex(String.fromCodePoint(cp));
          if (srcGid && srcGid > 0) {
            const srcG = baseFont.parsed.glyphs.get(srcGid);
            if (srcG && srcG.path) {
              glyphPath = srcG.path;
              advW = srcG.advanceWidth || advW;
            }
          }
        }

        // If no outline found, generate clean vector geometry
        if (!glyphPath || !glyphPath.commands || glyphPath.commands.length === 0) {
          const p = new opentype.Path();
          const halfAdv = Math.round(advW / 2);
          const top = Math.round(em * 0.7);
          const bot = 0;
          // Clean rounded star or geometric marker
          p.moveTo(halfAdv, top);
          p.lineTo(halfAdv + Math.round(em * 0.2), Math.round(top * 0.5));
          p.lineTo(halfAdv + Math.round(em * 0.25), bot);
          p.lineTo(halfAdv, Math.round(top * 0.25));
          p.lineTo(halfAdv - Math.round(em * 0.25), bot);
          p.lineTo(halfAdv - Math.round(em * 0.2), Math.round(top * 0.5));
          p.close();
          glyphPath = p;
        }

        const glyph = new opentype.Glyph({
          name: `uni${cp.toString(16).toUpperCase()}`,
          unicode: cp,
          advanceWidth: advW,
          path: glyphPath
        });
        newGlyphs.push(glyph);

        const pathData = glyphPath.toPathData(2);

        // 1. SVG in OpenType
        if (selectedFormat === 'all' || selectedFormat === 'svg') {
          const svgDoc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${advW} ${em}" id="glyph${gid}">
  <defs>
    <linearGradient id="grad${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primaryColor}" />
      <stop offset="100%" stop-color="${secondaryColor}" />
    </linearGradient>
  </defs>
  <path d="${pathData}" fill="url(#grad${gid})"${strokeWidth > 0 ? ` stroke="${strokeColor}" stroke-width="${strokeWidth}"` : ''} />
</svg>`;
          svgMap.set(gid, encoder.encode(svgDoc));
        }

        // 2. COLR Table (Layers)
        if (selectedFormat === 'all' || selectedFormat === 'colr') {
          colrBases.push({
            glyphID: gid,
            layers: [
              { glyphID: gid, paletteIndex: 0 } // Primary Color from palette
            ]
          });
        }
      }

      const font = new opentype.Font({
        familyName: fontName.trim() || 'ColorFont',
        styleName: 'Regular',
        unitsPerEm: em,
        ascender: asc,
        descender: desc,
        glyphs: newGlyphs
      });

      if (!(font as any).tables) (font as any).tables = {};
      if (!(font as any).tables.hhea) (font as any).tables.hhea = {};
      if (!(font as any).tables.os2) (font as any).tables.os2 = {};

      (font as any).tables.hhea.version = 65536;
      (font as any).tables.hhea.ascender = asc;
      (font as any).tables.hhea.descender = desc;
      (font as any).tables.os2.version = 3;
      (font as any).tables.os2.sTypoAscender = asc;
      (font as any).tables.os2.sTypoDescender = desc;
      (font as any).tables.os2.usWinAscent = asc;
      (font as any).tables.os2.usWinDescent = Math.abs(desc);
      (font as any).tables.os2.fsSelection = 128; // USE_TYPO_METRICS

      // Attach CPAL & CAPL (Color Palette)
      const cpal = buildCpalTable([activePalette]);
      const capl = buildCaplTable([activePalette]);
      (font as any).tables.cpal = cpal;
      (font as any).tables.capl = capl;
      (font as any).tables.CPAL = cpal;
      (font as any).tables.CAPL = capl;

      // Attach COLR if enabled
      if (colrBases.length > 0) {
        const colr = buildColrTable(colrBases);
        (font as any).tables.colr = colr;
        (font as any).tables.COLR = colr;
      }

      // Attach SVG in OpenType if enabled
      if (svgMap.size > 0) {
        (font as any).tables.svg = svgMap;
        (font as any).tables.SVG = svgMap;
      }

      const buffer = font.toArrayBuffer();
      const id = generateUUID();
      const fileName = `${fontName.replace(/\s+/g, '_')}_Color.otf`;
      const fontFile = new File([buffer], fileName, { type: 'font/otf' });
      const fontFamilyName = `FontFuser_${id}`;

      // Inject into DOM @font-face
      const fontFace = new FontFace(fontFamilyName, buffer);
      try {
        await fontFace.load();
        document.fonts.add(fontFace);
      } catch (e) {
        console.warn('FontFace load error for color font:', e);
      }

      const colorData = extractColorFontInfo(font);
      const uploadedColorFont: UploadedFont = {
        id,
        name: `${fontName} (Color)`,
        fileName,
        file: fontFile,
        parsed: font,
        fontFamilyName,
        color: primaryColor,
        hasColor: true,
        colorData
      };

      setFonts(prev => [uploadedColorFont, ...prev]);
      onApplyColorFont(uploadedColorFont);
      onClose();
    } catch (err: any) {
      console.warn('Failed to create color font:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-gray-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#181818]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-pink-500 p-0.5 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <div className="w-full h-full bg-[#141414] rounded-[6px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">Colorize Glyphs</h3>
                <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-purple-500/30 to-blue-500/30 text-purple-300 border border-purple-500/40">
                  COLOR UPDATE
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Embed SVG in OpenType, COLR, and CPAL/CAPL color tables for {selectedCharacters.size} selected glyph(s)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#121212]">

          {/* Live Preview Box */}
          <div className="bg-[#181818] p-4 rounded-xl border border-white/5 flex items-center justify-between gap-6">
            <div className="flex-1 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block">Preview Character</span>
              <h4 className="text-xs font-bold text-white">
                {previewCharStr} (U+{previewChar.toString(16).toUpperCase().padStart(4, '0')})
              </h4>
              <p className="text-[11px] text-gray-400">
                Selected: {selectedCharacters.size} character{selectedCharacters.size > 1 ? 's' : ''}
              </p>
            </div>

            {/* Visual Swatch Preview */}
            <div 
              className="w-24 h-24 rounded-lg bg-[#0e0e0e] border border-white/10 flex items-center justify-center shadow-inner relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}22 0%, ${secondaryColor}22 100%)`
              }}
            >
              <span 
                className="text-5xl font-bold select-none drop-shadow-md"
                style={{
                  color: primaryColor,
                  textShadow: `0 0 12px ${primaryColor}66`
                }}
              >
                {previewCharStr}
              </span>
            </div>
          </div>

          {/* Palette Presets */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-purple-400" />
              Quick Palettes
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PALETTE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleApplyPreset(preset.colors)}
                  className="bg-[#1c1c1c] hover:bg-[#252525] p-2 rounded-lg border border-white/5 hover:border-white/20 transition-all flex flex-col gap-1.5 text-left group"
                >
                  <span className="text-[11px] font-semibold text-gray-300 group-hover:text-white truncate">
                    {preset.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {preset.colors.slice(0, 4).map((c, i) => (
                      <div key={i} className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Color Customizer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#181818] p-3.5 rounded-lg border border-white/5 space-y-2">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Primary / Fill Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded border border-white/20 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 bg-[#121212] border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-white uppercase"
                />
              </div>
            </div>

            <div className="bg-[#181818] p-3.5 rounded-lg border border-white/5 space-y-2">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Secondary / Gradient Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-10 h-10 rounded border border-white/20 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 bg-[#121212] border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-white uppercase"
                />
              </div>
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              OpenType Color Format Target
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSelectedFormat('all')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedFormat === 'all'
                    ? 'bg-purple-600/20 border-purple-500/60 shadow-md shadow-purple-500/10'
                    : 'bg-[#181818] border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">All Formats</span>
                  {selectedFormat === 'all' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  SVG + COLR + CPAL/CAPL. Maximum 100% cross-platform compatibility.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFormat('svg')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedFormat === 'svg'
                    ? 'bg-purple-600/20 border-purple-500/60 shadow-md shadow-purple-500/10'
                    : 'bg-[#181818] border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">SVG in OpenType</span>
                  {selectedFormat === 'svg' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  Vector gradients and XML documents inside the 'SVG ' table.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFormat('colr')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedFormat === 'colr'
                    ? 'bg-purple-600/20 border-purple-500/60 shadow-md shadow-purple-500/10'
                    : 'bg-[#181818] border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">COLR & CPAL</span>
                  {selectedFormat === 'colr' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">
                  Layered outlines and 32-bit palette entries (CPAL and CAPL).
                </p>
              </button>
            </div>
          </div>

          {/* Font Name */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
              Color Font Family Name
            </label>
            <input
              type="text"
              value={fontName}
              onChange={(e) => setFontName(e.target.value)}
              placeholder="e.g. PrismColor"
              className="w-full bg-[#181818] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#181818] border-t border-white/5">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg text-xs font-bold transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleGenerateColorFont}
            disabled={isGenerating || selectedCharacters.size === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all"
          >
            {isGenerating ? (
              <span className="animate-pulse">Building OpenType Tables...</span>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Apply Color Glyphs ({selectedCharacters.size})
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
