import React, { useState } from 'react';
import { X, Type, RotateCcw } from 'lucide-react';
import type { UploadedFont } from '../types';

interface TypeTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  fonts: UploadedFont[];
}

export function TypeTesterModal({ isOpen, onClose, fonts }: TypeTesterModalProps) {
  const [sampleText, setSampleText] = useState('Hello World! Test the caret: ^_^ and 2^3 = 8 (a ^ b). Correct size & position.');
  const [fontSize, setFontSize] = useState(32);
  const [selectedFontId, setSelectedFontId] = useState<string>(fonts[0]?.id || '');

  const [isRTL, setIsRTL] = useState(false);

  if (!isOpen) return null;

  const currentFont = fonts.find(f => f.id === selectedFontId) || fonts[0];
  const fontFamily = currentFont?.fontFamilyName || 'inherit';

  const presets = [
    { label: '🎨 Color Glyphs', text: 'COLOR UPDATE: OpenType SVG, COLR Layers & CPAL/CAPL Palettes!', rtl: false },
    { label: 'Caret & Math', text: 'x^2 + y^2 = z^2 | a^b | base^exponent | ^_^', rtl: false },
    { label: 'Duployan Shorthand', text: '𛰆𛱁 𛰄𛱁 𛰚𛱄 𛰆𛱄𛰚 𛱁𛲝 𛰆𛲞 𛰆𛲠𛰄 (Duployan Shorthand)', rtl: false },
    { label: 'Tibetan + Not Subset', text: 'ཀ ⊄ ཀ ⊈ ཀ ≠ ཀ ∉ ཀ ⊅ (Tibetan + Not Symbols)', rtl: false },
    { label: 'Myanmar + Not Subset', text: 'က ⊄ က ⊈ က ≠ က ∉ က ⊅ (Myanmar + Not Symbols)', rtl: false },
    { label: 'Math Negations', text: 'x ⊄ y | A ⊈ B | a ≠ b | x ∉ S | ⊄ ⊈ ≠', rtl: false },
    { label: 'Arabic Cursive & Ligatures', text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — لا لأ لإ لآ', rtl: true },
    { label: 'Arabic Tatweel (Kashida)', text: 'كـَـتـَـبَ | صَـــدَقَ | الـــسَّــلامُ عَلَــيْــكُــمْ', rtl: true },
    { label: 'Arabic Mixed Shapes', text: 'العربية: بداية ونهاية ووسط (بـ ـبـ ـب ب)', rtl: true },
    { label: 'Caret In Words', text: 'word^test high^hat hello^world ^_^ ^-^', rtl: false },
    { label: 'Pangram', text: 'The quick brown fox jumps over the lazy dog ^ 1234567890', rtl: false },
    { label: 'Symbols & Accents', text: '! @ # $ % ^ & * ( ) _ + - = [ ] { } | : ; " \' < > ? / ` ~', rtl: false },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#141414] border border-white/10 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">Font & Caret Type Tester</h3>
              <p className="text-[11px] text-gray-400">Test text cursor position, line metrics, and caret (^) rendering</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls Toolbar */}
        <div className="p-4 border-b border-white/5 bg-[#171717] flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 font-medium">Font:</span>
            {fonts.length > 0 ? (
              <select
                value={selectedFontId}
                onChange={(e) => setSelectedFontId(e.target.value)}
                className="bg-[#222] border border-white/10 rounded px-2.5 py-1.5 text-gray-200 outline-none focus:border-blue-500"
              >
                {fonts.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.hasColor ? '🎨 [Color Font]' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-gray-500 italic">No fonts loaded (using system font)</span>
            )}
            {currentFont?.hasColor && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30">
                OpenType Color Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-400 font-medium">Size ({fontSize}px):</span>
            <input
              type="range"
              min="16"
              max="72"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="accent-blue-500 w-28 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRTL(!isRTL)}
              className={`px-2.5 py-1 rounded border text-[11px] font-bold uppercase transition-colors ${
                isRTL 
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' 
                  : 'bg-[#222] border-white/10 text-gray-400 hover:text-white'
              }`}
              title="Toggle Right-to-Left (RTL) text direction for Arabic"
            >
              {isRTL ? 'RTL (Arabic)' : 'LTR'}
            </button>

            <button
              onClick={() => {
                setSampleText('Hello World! Test the caret: ^_^ and 2^3 = 8 (a ^ b). Correct size & position.');
                setIsRTL(false);
              }}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
              title="Reset sample text"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="px-4 py-2 bg-[#121212] border-b border-white/5 flex items-center gap-2 overflow-x-auto text-[11px]">
          <span className="text-gray-500 shrink-0 font-medium uppercase tracking-wider text-[10px]">Presets:</span>
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                setSampleText(preset.text);
                if (preset.rtl !== undefined) setIsRTL(preset.rtl);
              }}
              className="px-2.5 py-1 bg-[#1e1e1e] hover:bg-[#282828] border border-white/10 rounded text-gray-300 transition-colors shrink-0"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Editable Typing Canvas */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#0d0d0d] flex flex-col justify-center min-h-[220px]">
          <textarea
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            dir={isRTL ? 'rtl' : 'ltr'}
            style={{
              fontFamily: `${fontFamily}, 'Noto Sans Duployan', sans-serif`,
              fontSize: `${fontSize}px`,
              lineHeight: 1.45,
            }}
            placeholder="Type anything here to test the font, Arabic cursive connection, Tatweel, and cursor caret..."
            rows={4}
            className="w-full bg-transparent text-gray-100 outline-none resize-none border-b border-white/10 focus:border-blue-500/50 transition-colors p-2 caret-blue-400"
            autoFocus
          />
        </div>

        {/* Caret & Arabic Connection Status / Metrics Info Footer */}
        <div className="p-3 bg-[#171717] border-t border-white/10 flex flex-wrap items-center justify-between text-[11px] text-gray-400 font-mono">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              Caret Height: <strong className="text-emerald-300">~38% EM</strong>
            </span>
            <span className="hidden sm:inline text-gray-600">|</span>
            <span className="hidden sm:inline">
              Tatweel (Kashida): <strong className="text-amber-300">U+0640 (Baseline Continuous)</strong>
            </span>
            <span className="hidden md:inline text-gray-600">|</span>
            <span className="hidden md:inline">
              Ligatures: <strong className="text-blue-300">Forms-A / Forms-B Supported</strong>
            </span>
          </div>
          <span className="text-gray-500 text-[10px]">
            {currentFont ? currentFont.name : 'System Font'}
          </span>
        </div>
      </div>
    </div>
  );
}
