import React, { useState } from 'react';
import { X, Palette, Code, Layers, Sparkles, Check, Download, Info } from 'lucide-react';
import type { UploadedFont } from '../types';
import { extractColorFontInfo, type ColorGlyphRecord } from '../lib/colorFontUtils';

interface ColorTablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  fonts: UploadedFont[];
  selectedFontId?: string;
}

export function ColorTablesModal({ isOpen, onClose, fonts, selectedFontId }: ColorTablesModalProps) {
  const [activeFontId, setActiveFontId] = useState<string>(() => {
    if (selectedFontId) return selectedFontId;
    const colorFont = fonts.find(f => f.hasColor || (f.colorData && f.colorData.hasColor));
    return colorFont ? colorFont.id : (fonts[0]?.id || '');
  });
  const [activeTab, setActiveTab] = useState<'cpal' | 'colr' | 'svg' | 'info'>('cpal');
  const [selectedGlyphGid, setSelectedGlyphGid] = useState<number | null>(null);

  if (!isOpen) return null;

  const activeFont = fonts.find(f => f.id === activeFontId);
  const colorData = activeFont?.colorData || (activeFont?.parsed ? extractColorFontInfo(activeFont.parsed) : null);

  const hasColor = !!(colorData && colorData.hasColor);
  const palettes = colorData?.palettes || [];
  const colorGlyphs: ColorGlyphRecord[] = colorData 
    ? (colorData.colorGlyphs instanceof Map ? Array.from(colorData.colorGlyphs.values()) : Array.isArray(colorData.colorGlyphs) ? colorData.colorGlyphs : Object.values(colorData.colorGlyphs || {})) as ColorGlyphRecord[]
    : [];
  const svgGlyphs = colorGlyphs.filter(g => g && g.hasSVG && g.svgDocument);
  const colrGlyphs = colorGlyphs.filter(g => g && g.hasCOLR && g.layers && g.layers.length > 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141414] border border-white/10 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-gray-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#181818]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <div className="w-full h-full bg-[#141414] rounded-[6px] flex items-center justify-center">
                <Palette className="w-4 h-4 text-purple-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">OpenType Color Table Inspector</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 border border-purple-500/30">
                  COLOR UPDATE
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Inspect SVG in OpenType, COLR (Color Layers), and CPAL / CAPL (Color Palettes)
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

        {/* Font Selector Bar */}
        <div className="flex items-center gap-2 px-6 py-3 bg-[#111111] border-b border-white/5 overflow-x-auto">
          <span className="text-xs text-gray-400 font-medium shrink-0 mr-1">Select Font:</span>
          {fonts.map(f => {
            const fontColorData = f.colorData || (f.parsed ? extractColorFontInfo(f.parsed) : null);
            const isSelected = f.id === activeFontId;
            return (
              <button
                key={f.id}
                onClick={() => {
                  setActiveFontId(f.id);
                  setSelectedGlyphGid(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
                  isSelected 
                    ? 'bg-purple-600/30 text-white border border-purple-500/50 shadow-sm shadow-purple-500/20' 
                    : 'bg-[#1c1c1c] text-gray-400 border border-white/5 hover:text-gray-200 hover:bg-[#252525]'
                }`}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                <span className="truncate max-w-[140px]">{f.name}</span>
                {fontColorData?.hasColor && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/30 text-purple-300 font-mono">
                    COLOR
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 bg-[#141414] border-b border-white/5">
          <button
            onClick={() => setActiveTab('cpal')}
            className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
              activeTab === 'cpal'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            CPAL & CAPL Table
            {palettes.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-mono">
                {palettes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('colr')}
            className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
              activeTab === 'colr'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            COLR Table (COLRv0)
            {colrGlyphs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-mono">
                {colrGlyphs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('svg')}
            className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
              activeTab === 'svg'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            SVG in OpenType
            {svgGlyphs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-mono">
                {svgGlyphs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
              activeTab === 'info'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            Specs & Guide
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#121212]">
          
          {/* CPAL & CAPL Tab */}
          {activeTab === 'cpal' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-[#1a1a1a] p-4 rounded-lg border border-white/5">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    CPAL & CAPL (Color Palette Tables)
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Defines 32-bit BGRA color palettes used by the COLR table. Fully compatible with both standard OpenType CPAL and CAPL table alias.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-emerald-400">{palettes.length} Palettes</span>
                  <span className="text-[10px] text-gray-500 block font-mono">
                    {palettes[0]?.length || 0} colors/palette
                  </span>
                </div>
              </div>

              {palettes.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-xs">
                  No CPAL or CAPL palette table found in this font.
                  <p className="text-[11px] text-gray-600 mt-1">Use the "Colorize Glyphs" tool to generate color tables!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {palettes.map((palette, pIdx) => (
                    <div key={pIdx} className="bg-[#181818] p-4 rounded-lg border border-white/5 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-300 font-mono">
                          Palette #{pIdx} {pIdx === 0 && <span className="text-emerald-400 text-[10px]">(Default Palette)</span>}
                        </span>
                        <span className="text-[11px] font-mono text-gray-500">{palette.length} color records</span>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                        {palette.map((hex, cIdx) => (
                          <div 
                            key={cIdx} 
                            className="bg-[#202020] border border-white/5 rounded-md p-2 flex flex-col items-center gap-2 hover:border-white/20 transition-colors group"
                            title={`Palette Index ${cIdx}: ${hex}`}
                          >
                            <div 
                              className="w-10 h-10 rounded shadow-md border border-white/10 group-hover:scale-105 transition-transform" 
                              style={{ backgroundColor: hex }} 
                            />
                            <div className="text-center">
                              <span className="text-[9px] text-gray-500 font-mono block">Idx #{cIdx}</span>
                              <span className="text-[10px] font-mono font-bold text-gray-300 select-all">{hex}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COLR Tab */}
          {activeTab === 'colr' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-[#1a1a1a] p-4 rounded-lg border border-white/5">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      COLR Table (Color Layers)
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                      COLRv0 Compatible
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Decomposes complex colored glyphs into ordered layers referencing glyph IDs and CPAL/CAPL palette entries. 100% compliant with OpenType COLRv0, Windows DirectWrite, and web browsers.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-cyan-400">{colrGlyphs.length} Base Glyphs</span>
                  <span className="text-[10px] text-gray-500 block font-mono">
                    {colrGlyphs.reduce((acc, g) => acc + (g.layers?.length || 0), 0)} Total Layers
                  </span>
                </div>
              </div>

              {colrGlyphs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-xs">
                  No COLR layered glyph records found in this font.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {colrGlyphs.map((glyph) => (
                    <div 
                      key={glyph.glyphIndex}
                      className="bg-[#181818] p-3.5 rounded-lg border border-white/5 space-y-2.5 hover:border-cyan-500/30 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-cyan-400">GID #{glyph.glyphIndex}</span>
                          {glyph.codepoint !== undefined && (
                            <span className="text-[10px] font-mono text-gray-400">
                              (U+{glyph.codepoint.toString(16).toUpperCase().padStart(4, '0')})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {glyph.layers?.length || 0} Layers
                        </span>
                      </div>

                      {/* Layer Stack */}
                      <div className="space-y-1.5 bg-[#121212] p-2 rounded border border-white/5">
                        {glyph.layers?.map((layer, lIdx) => (
                          <div key={lIdx} className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded bg-[#1a1a1a]">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-gray-500">L{lIdx}</span>
                              <span className="text-gray-300">Glyph #{layer.glyphIndex}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400">
                                {layer.paletteIndex === 0xFFFF ? 'CurrentColor' : `Palette #${layer.paletteIndex}`}
                              </span>
                              <div 
                                className="w-3.5 h-3.5 rounded border border-white/10" 
                                style={{ backgroundColor: layer.color || '#3b82f6' }} 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SVG in OpenType Tab */}
          {activeTab === 'svg' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-[#1a1a1a] p-4 rounded-lg border border-white/5">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    SVG Table (SVG in OpenType)
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Embeds complete scalable vector XML SVG documents into the OpenType 'SVG ' table for high fidelity gradients, strokes, and multi-color graphics.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-purple-400">{svgGlyphs.length} SVG Glyphs</span>
                </div>
              </div>

              {svgGlyphs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-xs">
                  No SVG in OpenType documents found in this font.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {svgGlyphs.map((glyph) => (
                    <div 
                      key={glyph.glyphIndex}
                      className="bg-[#181818] p-4 rounded-lg border border-white/5 space-y-3 hover:border-purple-500/30 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-purple-400">GID #{glyph.glyphIndex}</span>
                          {glyph.codepoint !== undefined && (
                            <span className="text-[10px] font-mono text-gray-400">
                              (U+{glyph.codepoint.toString(16).toUpperCase().padStart(4, '0')})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-gray-500">
                          {glyph.svgDocument?.length || 0} bytes
                        </span>
                      </div>

                      {/* SVG Visual Preview */}
                      <div className="h-32 bg-[#0c0c0c] rounded border border-white/5 flex items-center justify-center p-2 overflow-hidden">
                        {glyph.svgDocument && (
                          <div 
                            className="max-h-full max-w-full flex items-center justify-center [&>svg]:max-h-28 [&>svg]:max-w-28 [&>svg]:w-auto [&>svg]:h-auto"
                            dangerouslySetInnerHTML={{ __html: glyph.svgDocument }}
                          />
                        )}
                      </div>

                      {/* Source snippet */}
                      <div className="bg-[#121212] p-2 rounded border border-white/5 max-h-24 overflow-y-auto">
                        <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap break-all">
                          {glyph.svgDocument}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Guide / Specs Tab */}
          {activeTab === 'info' && (
            <div className="space-y-6 text-xs text-gray-300 leading-relaxed">
              <div className="bg-[#1a1a1a] p-4 rounded-lg border border-white/5">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  About the COLOR UPDATE
                </h4>
                <p className="text-gray-400">
                  GlyphFuse Pro Editor now natively builds, fuses, inspects, and exports color fonts across all three core OpenType color formats:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#181818] p-4 rounded-lg border border-white/5 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-purple-300">
                    <Code className="w-4 h-4" />
                    <span>SVG in OpenType</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Standardized OpenType <code className="text-purple-300 font-mono">'SVG '</code> table. Contains complete SVG XML documents for glyphs, enabling gradients, patterns, and complex vector art. Supported natively in Firefox, Safari, Chrome, and desktop Adobe apps.
                  </p>
                </div>

                <div className="bg-[#181818] p-4 rounded-lg border border-white/5 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-cyan-300">
                    <Layers className="w-4 h-4" />
                    <span>COLR Table (COLRv0 Specification)</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    OpenType <code className="text-cyan-300 font-mono">'COLR'</code> version 0 table. Defines layered vector outlines for glyphs, with each layer mapped to a palette color index. Supported natively in Windows DirectWrite, Chrome, Edge, Safari, and Android. Base glyph records are automatically sorted ascending by glyph ID for strict OpenType validator compliance.
                  </p>
                </div>

                <div className="bg-[#181818] p-4 rounded-lg border border-white/5 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-300">
                    <Palette className="w-4 h-4" />
                    <span>CPAL & CAPL Tables</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Color Palette table <code className="text-emerald-300 font-mono">'CPAL'</code> and specification alias <code className="text-emerald-300 font-mono">'CAPL'</code>. Houses 32-bit BGRA color palettes used by COLR layers, including multiple alternative color theme palettes.
                  </p>
                </div>
              </div>

              <div className="bg-[#181818] p-4 rounded-lg border border-white/5 space-y-2">
                <h5 className="font-bold text-white text-xs uppercase tracking-wider">Zero-Loss Color Fusion</h5>
                <p className="text-[11px] text-gray-400">
                  When you fuse fonts or swap glyphs, all SVG documents, COLR layer outlines, and CPAL/CAPL palette entries are automatically re-indexed, merged, and preserved in the final compiled OpenType font.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#181818] border-t border-white/5 text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-gray-500">
              Font: <strong className="text-gray-300">{activeFont?.name || 'None'}</strong>
            </span>
            {hasColor ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Color Tables Active
              </span>
            ) : (
              <span className="text-[11px] text-gray-500">Monochrome Font</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
