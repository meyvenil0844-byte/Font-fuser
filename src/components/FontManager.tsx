import React, { useRef, useState, useEffect } from 'react';
import { Upload, X, Check, Star, ArrowUpDown, Palette, Sparkles, Layers, Code, AlertCircle, Eye, Loader2 } from 'lucide-react';
import type { UploadedFont, GlyphMapping } from '../types';
import { loadFontFiles, FONT_PALETTE_COLORS, type FontLoadingProgress } from '../lib/fontLoader';
import { ColorTablesModal } from './ColorTablesModal';
import { cn } from '../lib/utils';

interface FontManagerProps {
  fonts: UploadedFont[];
  setFonts: React.Dispatch<React.SetStateAction<UploadedFont[]>>;
  onApplyFont: (fontId: string) => void;
  onSetBaseFont?: (fontId: string) => void;
  hasSelection: boolean;
  setGlyphMap?: React.Dispatch<React.SetStateAction<GlyphMapping>>;
  onJumpToBlockForFont?: (font: UploadedFont) => void;
}

const COLORS = FONT_PALETTE_COLORS;

export function FontManager({ fonts, setFonts, onApplyFont, onSetBaseFont, hasSelection, setGlyphMap, onJumpToBlockForFont }: FontManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [movingFontId, setMovingFontId] = useState<string | null>(null);
  const [isColorInspectorOpen, setIsColorInspectorOpen] = useState(false);
  const [inspectFontId, setInspectFontId] = useState<string | undefined>(undefined);
  const [uploadProgress, setUploadProgress] = useState<FontLoadingProgress | null>(null);
  const [isProcessingFonts, setIsProcessingFonts] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Keyboard shortcut: Press 'F' (or Ctrl+O / Cmd+O) to open file picker anytime
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isEditable = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openFilePicker();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        openFilePicker();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setIsProcessingFonts(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress({
      current: 0,
      total: files.length,
      percent: 0,
      fileName: files[0]?.name || 'font file',
      status: `Initializing ${files.length} file${files.length > 1 ? 's' : ''}...`
    });

    try {
      const result = await loadFontFiles(files, fonts.length, (progress) => {
        setUploadProgress(progress);
      });

      if (result.newFonts.length > 0) {
        if (result.embeddedGlyphMap && setGlyphMap) {
          setGlyphMap(prev => ({ ...prev, ...result.embeddedGlyphMap }));
        }

        setFonts(prev => {
          const remaining = prev.filter(p => !result.newFonts.some(nf => nf.id === p.id));
          return [...result.newFonts, ...remaining];
        });

        setUploadSuccess(`Loaded ${result.newFonts.length} font${result.newFonts.length > 1 ? 's' : ''} successfully!`);
        setTimeout(() => setUploadSuccess(null), 3500);

        // Auto-jump to the block that has the most glyphs for the newly loaded font
        if (onJumpToBlockForFont && result.newFonts[0]) {
          onJumpToBlockForFont(result.newFonts[0]);
        }
      }

      if (result.errors.length > 0) {
        // "if its not loaded, its error"
        const errDetails = result.errors.join('\n');
        setUploadError(errDetails);
      } else if (result.newFonts.length === 0) {
        setUploadError("Font file could not be loaded. Please ensure the file is a valid .ttf, .otf, .woff, .woff2, or .ttc font.");
      }
    } catch (err: any) {
      setUploadError(`Failed to load font file: ${err?.message || String(err)}`);
    } finally {
      setIsProcessingFonts(false);
      setUploadProgress(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    try {
      if (fileList.length > 0) {
        await processFiles(fileList);
      }
    } finally {
      if (e.target) {
        try { e.target.value = ''; } catch {}
      }
    }
  };

  const removeFont = (id: string) => {
    // Only remove from active workspace view; NEVER delete font storage key to keep saved projects intact
    setFonts(prev => prev.filter(f => f.id !== id));
  };

  const handleMove = (targetId: string) => {
    if (!movingFontId) return;
    setFonts(prev => {
      const draggedIdx = prev.findIndex(f => f.id === movingFontId);
      if (draggedIdx === -1) return prev;
      
      const newFonts = [...prev];
      const [dragged] = newFonts.splice(draggedIdx, 1);
      
      const adjustedTargetIdx = newFonts.findIndex(f => f.id === targetId);
      if (adjustedTargetIdx !== -1) {
        newFonts.splice(adjustedTargetIdx + 1, 0, dragged);
      } else {
        newFonts.push(dragged);
      }
      
      return newFonts;
    });
    setMovingFontId(null);
  };



  return (
    <div 
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounterRef.current++;
        setIsDragging(true);
      }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounterRef.current--;
        if (dragCounterRef.current <= 0) {
          dragCounterRef.current = 0;
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
        }
      }}
      className={cn(
        "flex flex-col w-full md:w-64 bg-[#111111] border-b md:border-b-0 md:border-r border-white/5 shrink-0 max-h-[40vh] md:max-h-none overflow-y-auto transition-colors relative",
        isDragging && "ring-2 ring-blue-500 bg-blue-950/20"
      )}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-blue-950/90 backdrop-blur-xs border-2 border-dashed border-blue-400 z-30 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
          <Upload className="w-8 h-8 text-blue-400 animate-bounce mb-2" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Drop Font Files Here</span>
          <span className="text-[10px] text-blue-200 mt-1">.ttf, .otf, .woff, .woff2, .ttc</span>
        </div>
      )}

      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">
            Loaded Font Files {fonts.length > 0 && `(${fonts.length})`}
          </h2>
          {fonts.length > 0 && (
            <button
              type="button"
              onClick={openFilePicker}
              className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:underline bg-transparent border-0 p-0 select-none"
              title="Add more font files (Shortcut: F)"
            >
              <Upload className="w-3 h-3 shrink-0" /> + Add More
            </button>
          )}
        </div>
        
        <div className="flex flex-col gap-2">
          {fonts.length === 0 ? (
            <button
              type="button"
              onClick={openFilePicker}
              className="w-full py-6 text-center border-2 border-dashed border-white/10 hover:border-blue-500/50 rounded-lg p-4 cursor-pointer hover:bg-white/[0.02] transition-all block group bg-transparent select-none text-left"
              title="Click to select font files or drag & drop here (Shortcut: F)"
            >
              <Upload className="w-6 h-6 text-gray-500 group-hover:text-blue-400 mx-auto mb-2 transition-colors shrink-0" />
              <p className="text-xs text-center text-gray-200 font-bold group-hover:text-white transition-colors">Click to Select Fonts</p>
              <p className="text-[10px] text-center text-gray-500 mt-1">or drag & drop files here (.ttf, .otf, .woff, .woff2, .ttc)</p>
              <p className="text-[9px] text-center font-mono text-gray-600 mt-1">Press <kbd className="text-blue-400 font-bold">F</kbd> anytime</p>
            </button>
          ) : (
            <>
              {fonts.filter(f => !f.isHidden).map((font, idx) => {
                const isBase = idx === 0;
                const glyphCount = font.supportedCodePoints?.size || (font.parsed?.glyphs ? (font.parsed.glyphs.length || Object.keys(font.parsed.glyphs).length) : 0);
                return (
                  <React.Fragment key={font.id}>
                    <div 
                      onClick={() => {
                        if (movingFontId) {
                          if (movingFontId === font.id) {
                            setMovingFontId(null);
                          } else {
                            handleMove(font.id);
                          }
                        } else if (hasSelection) {
                          onApplyFont(font.id);
                        } else {
                          if (onSetBaseFont && !isBase) {
                            onSetBaseFont(font.id);
                          }
                          if (onJumpToBlockForFont) {
                            onJumpToBlockForFont(font);
                          }
                        }
                      }}
                      className={cn(
                        "relative flex flex-col p-2.5 rounded-lg border cursor-pointer transition-all bg-[#1a1a1a] hover:bg-[#222]",
                        isBase ? "border-blue-500/40 ring-1 ring-blue-500/30 bg-[#161d28]/60" : "border-white/5 hover:border-white/20",
                        movingFontId === font.id && "border-amber-500 ring-1 ring-amber-500"
                      )}
                      title={hasSelection ? "Click to apply to selected characters" : (isBase ? "Current primary base font" : "Click to set as base font & view glyphs")}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex flex-col overflow-hidden w-full pr-14">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold truncate text-gray-100" title={font.name}>
                              {font.name}
                            </span>
                            {isBase && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5 fill-blue-400 text-blue-400" /> Base
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-gray-500 uppercase truncate" title={font.fileName}>{font.fileName}</span>
                            {glyphCount > 0 && (
                              <span className="text-[9px] font-mono text-gray-400 bg-white/5 px-1 rounded">
                                {glyphCount} glyphs
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 flex gap-1 z-10">
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setMovingFontId(movingFontId === font.id ? null : font.id); }}
                            className={cn("p-1 rounded transition-colors", movingFontId === font.id ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-white hover:bg-white/5")}
                            title="Reorder font"
                          >
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeFont(font.id); }}
                            className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-white/5 transition-colors"
                            title="Remove from workspace"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      
                      {/* COLOR BADGES */}
                      {font.hasColor && (
                        <div className="flex flex-wrap items-center gap-1 mt-1 pt-1.5 border-t border-white/5">
                          {font.colorData?.hasSVG && (
                            <span 
                              onClick={(e) => { e.stopPropagation(); setInspectFontId(font.id); setIsColorInspectorOpen(true); }}
                              className="px-1.5 py-0.5 rounded text-[8.5px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-0.5 hover:bg-purple-500/30 transition-colors"
                              title="Contains OpenType SVG table"
                            >
                              <Code className="w-2.5 h-2.5" /> SVG
                            </span>
                          )}
                          {font.colorData?.hasCOLR && (
                            <span 
                              onClick={(e) => { e.stopPropagation(); setInspectFontId(font.id); setIsColorInspectorOpen(true); }}
                              className="px-1.5 py-0.5 rounded text-[8.5px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-0.5 hover:bg-cyan-500/30 transition-colors"
                              title="Contains OpenType COLR table"
                            >
                              <Layers className="w-2.5 h-2.5" /> COLR
                            </span>
                          )}
                          {(font.colorData?.hasCPAL || font.colorData?.hasCAPL) && (
                            <span 
                              onClick={(e) => { e.stopPropagation(); setInspectFontId(font.id); setIsColorInspectorOpen(true); }}
                              className="px-1.5 py-0.5 rounded text-[8.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5 hover:bg-emerald-500/30 transition-colors"
                              title="Contains OpenType CPAL / CAPL table"
                            >
                              <Palette className="w-2.5 h-2.5" /> CPAL/CAPL
                            </span>
                          )}
                          {font.colorData?.palettes?.[0] && font.colorData.palettes[0].length > 0 && (
                            <div className="flex items-center gap-0.5 ml-auto">
                              {font.colorData.palettes[0].slice(0, 4).map((c, ci) => (
                                <div key={ci} className="w-2 h-2 rounded-full border border-black/50" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2.5 h-2.5 rounded-full shadow-sm"
                            style={{ backgroundColor: font.color }}
                          />
                          <span className="text-[9px] uppercase font-bold text-gray-400">
                            {hasSelection ? "Apply to Selected" : (isBase ? "Active Base Font" : "Click to Select")}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {onJumpToBlockForFont && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSetBaseFont && !isBase) onSetBaseFont(font.id);
                                onJumpToBlockForFont(font);
                              }}
                              className="text-[9px] font-bold uppercase tracking-wider text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30 transition-colors flex items-center gap-1"
                              title="Jump to the Unicode block with the most glyphs from this font"
                            >
                              <Eye className="w-2.5 h-2.5" /> Glyphs
                            </button>
                          )}

                          {!isBase && onSetBaseFont && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetBaseFont(font.id);
                                if (onJumpToBlockForFont) onJumpToBlockForFont(font);
                              }}
                              className="text-[9px] font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30 transition-colors"
                            >
                              Set Base
                            </button>
                          )}
                        </div>

                        {font.hasColor && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectFontId(font.id);
                              setIsColorInspectorOpen(true);
                            }}
                            className="text-[9px] text-purple-400 hover:text-purple-300 font-semibold uppercase tracking-wider flex items-center gap-1 p-0.5 hover:underline ml-1"
                            title="Inspect SVG, COLR, CPAL tables"
                          >
                            <Palette className="w-3 h-3" /> Tables
                          </button>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          {/* Animated Processing Bar */}
          {isProcessingFonts && uploadProgress && (
            <div className="bg-[#141e30] border border-blue-500/40 rounded-lg p-3 shadow-lg flex flex-col gap-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-mono text-blue-300">
                <span className="flex items-center gap-1.5 font-bold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
                  Adding Font {uploadProgress.current}/{uploadProgress.total}
                </span>
                <span className="font-extrabold text-blue-400">{uploadProgress.percent}%</span>
              </div>

              {/* Progress Bar Track */}
              <div className="w-full bg-[#0a101d] rounded-full h-2.5 overflow-hidden border border-blue-500/30 p-[1px]">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(59,130,246,0.6)]"
                  style={{ width: `${Math.max(6, uploadProgress.percent)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                <span className="truncate max-w-[170px]" title={uploadProgress.fileName}>
                  {uploadProgress.fileName}
                </span>
                <span className="text-blue-400/80 animate-pulse font-medium">Processing...</span>
              </div>
            </div>
          )}

          {/* Success state */}
          {uploadSuccess && (
            <div className="text-[11px] font-mono text-emerald-300 bg-emerald-950/50 border border-emerald-500/40 rounded px-3 py-2 flex items-center gap-2 shadow-sm animate-in fade-in">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate font-semibold">{uploadSuccess}</span>
            </div>
          )}

          {/* Error State: if its not loaded, its error */}
          {uploadError && (
            <div className="text-[11px] font-mono text-red-200 bg-red-950/70 border border-red-500/50 rounded-lg p-3 shadow-md flex flex-col gap-1.5 animate-in fade-in">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 min-w-0">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-red-300 uppercase text-[10px] tracking-wider">Font File Error</span>
                    <span className="text-[10.5px] text-red-200 whitespace-pre-wrap break-words">{uploadError}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setUploadError(null)} 
                  className="text-red-400 hover:text-white p-0.5 rounded hover:bg-white/10 shrink-0 transition-colors"
                  title="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <input
            id="font-files-input"
            type="file"
            multiple
            accept=".ttf,.otf,.woff,.woff2,.ttc,.dfont,.svg,.png,.jpg,.jpeg,font/*,application/font*,application/x-font*,application/octet-stream"
            className="sr-only"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={openFilePicker}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold uppercase rounded-lg shadow-lg shadow-blue-600/25 transition-all cursor-pointer select-none active:scale-[0.99] focus:outline-hidden focus:ring-2 focus:ring-blue-400"
            title="Click to select font files from your device (Shortcut: F or Ctrl+O)"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Select Multiple Fonts</span>
            <kbd className="ml-1 text-[9px] bg-blue-800/80 px-1.5 py-0.5 rounded text-blue-200 font-mono">F</kbd>
          </button>

          <button
            type="button"
            onClick={() => {
              setInspectFontId(fonts[0]?.id);
              setIsColorInspectorOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 bg-gradient-to-r from-purple-950/40 to-blue-950/40 border border-purple-500/20 hover:border-purple-500/40 text-purple-300 text-[11px] font-bold uppercase rounded transition-colors"
            title="Inspect OpenType Color Tables (SVG in OpenType, COLR, CPAL/CAPL)"
          >
            <Palette className="w-3.5 h-3.5 text-purple-400" />
            Color Table Inspector
          </button>
        </div>
      </div>

      <ColorTablesModal
        isOpen={isColorInspectorOpen}
        onClose={() => setIsColorInspectorOpen(false)}
        fonts={fonts}
        selectedFontId={inspectFontId}
      />
    </div>
  );

}
