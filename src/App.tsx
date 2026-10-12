import React, { useState, useEffect, useRef } from 'react';
import { Download, Layers, Loader2, SaveAll, Undo2, Redo2, History, CheckCircle2, X, ShieldCheck, Type, Palette, Upload, RotateCcw, Trash2, AlertCircle, Check } from 'lucide-react';
import { FontManager } from './components/FontManager';
import { UnicodeExplorer } from './components/UnicodeExplorer';
import { SavesModal } from './components/SavesModal';
import { TypeTesterModal } from './components/TypeTesterModal';
import { ColorTablesModal } from './components/ColorTablesModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { generateFusedFont, downloadArrayBuffer, safeStringFromCodePoint } from './lib/fontUtils';
import { saveWorkspace, loadWorkspace, clearWorkspace, registerFontBuffer } from './lib/workspace';
import { UNICODE_BLOCKS } from './lib/unicodeBlocks';
import { loadFontFiles, type FontLoadingProgress } from './lib/fontLoader';
import type { UploadedFont, GlyphMapping } from './types';

export default function App() {
  const [fonts, setFonts] = useState<UploadedFont[]>([]);
  const [glyphMap, setGlyphMap] = useState<GlyphMapping>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isRestoringWorkspace, setIsRestoringWorkspace] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle');
  const [isSavesModalOpen, setIsSavesModalOpen] = useState(false);
  const [isTypeTesterOpen, setIsTypeTesterOpen] = useState(false);
  const [isColorInspectorOpen, setIsColorInspectorOpen] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState("New Project");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [downloadNotification, setDownloadNotification] = useState<{
    filename: string;
    url?: string;
    buffer: ArrayBuffer;
  } | null>(null);
  
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(() => Math.max(0, UNICODE_BLOCKS.findIndex(b => b.name === "Basic Latin")));
  const [selectedCharacters, setSelectedCharacters] = useState<Set<number>>(new Set());

  const [historyLength, setHistoryLength] = useState(0);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const historyRef = useRef<{fonts: UploadedFont[], glyphMap: GlyphMapping}[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);

  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const globalDragCounter = useRef(0);

  const [fontLoadingProgress, setFontLoadingProgress] = useState<FontLoadingProgress | null>(null);
  const [isProcessingFonts, setIsProcessingFonts] = useState(false);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const [fontLoadSuccess, setFontLoadSuccess] = useState<string | null>(null);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const handleProcessFontFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessingFonts(true);
    setFontLoadError(null);
    setFontLoadSuccess(null);
    setFontLoadingProgress({
      current: 0,
      total: files.length,
      percent: 0,
      fileName: files[0]?.name || 'font file',
      status: `Initializing ${files.length} file${files.length > 1 ? 's' : ''}...`
    });

    try {
      const result = await loadFontFiles(files, fonts.length, (progress: FontLoadingProgress) => {
        setFontLoadingProgress(progress);
      });

      if (result.newFonts.length > 0) {
        if (result.embeddedGlyphMap) {
          setGlyphMap(prev => ({ ...prev, ...result.embeddedGlyphMap }));
        }
        setFonts(prev => {
          const remaining = prev.filter(p => !result.newFonts.some(nf => nf.id === p.id));
          return [...result.newFonts, ...remaining];
        });
        setFontLoadSuccess(`Loaded ${result.newFonts.length} font${result.newFonts.length > 1 ? 's' : ''} successfully!`);
        setTimeout(() => setFontLoadSuccess(null), 3500);

        if (result.newFonts[0]) {
          handleJumpToBlockForFont(result.newFonts[0]);
        }
      }

      if (result.errors.length > 0) {
        setFontLoadError(result.errors.join('\n'));
      } else if (result.newFonts.length === 0) {
        setFontLoadError("Font file could not be loaded. Please ensure the file is a valid .ttf, .otf, .woff, .woff2, or .ttc font.");
      }
    } catch (err: any) {
      setFontLoadError(`Failed to load font file: ${err?.message || String(err)}`);
    } finally {
      setIsProcessingFonts(false);
      setFontLoadingProgress(null);
    }
  };

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      globalDragCounter.current++;
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        setIsGlobalDragging(true);
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      globalDragCounter.current--;
      if (globalDragCounter.current <= 0) {
        globalDragCounter.current = 0;
        setIsGlobalDragging(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      globalDragCounter.current = 0;
      setIsGlobalDragging(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleProcessFontFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [fonts.length]);


  // Non-blocking workspace restoration on mount
  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsRestoringWorkspace(true);
      try {
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200));
        const saved = await Promise.race([loadWorkspace(), timeoutPromise]);
        if (isCancelled) return;
        if (saved && saved.fonts && saved.fonts.length > 0) {
          saved.fonts.forEach(f => {
            if (f.buffer) registerFontBuffer(f.id, f.name, f.fileName, f.buffer);
          });
          setFonts(saved.fonts);
          setGlyphMap(saved.glyphMap || {});
          historyRef.current = [{ fonts: saved.fonts, glyphMap: saved.glyphMap || {} }];
          historyIndexRef.current = 0;
        } else {
          historyRef.current = [{ fonts: [], glyphMap: {} }];
          historyIndexRef.current = 0;
        }
        skipHistoryRef.current = true;
        setHistoryLength(historyRef.current.length);
        setCurrentHistoryIndex(historyIndexRef.current);
      } catch (err) {
        console.warn('Workspace restore skipped:', err);
      } finally {
        if (!isCancelled) {
          setIsRestoringWorkspace(false);
          setIsWorkspaceLoading(false);
        }
      }
    }
    load();

    return () => {
      isCancelled = true;
    };
  }, []);

  
  useEffect(() => {
    if (isWorkspaceLoading) return;
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    
    const curr = historyRef.current[historyIndexRef.current];
    if (curr && curr.fonts === fonts && curr.glyphMap === glyphMap) {
      return;
    }

    let newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push({ fonts, glyphMap });
    // Keep max 5 states to prevent memory exhaustion and browser tab crashes
    if (newHistory.length > 5) {
      newHistory = newHistory.slice(newHistory.length - 5);
    }
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setHistoryLength(newHistory.length);
    setCurrentHistoryIndex(historyIndexRef.current);
  }, [fonts, glyphMap, isWorkspaceLoading]);

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      skipHistoryRef.current = true;
      setFonts(prev.fonts);
      setGlyphMap(prev.glyphMap);
      setCurrentHistoryIndex(historyIndexRef.current);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      skipHistoryRef.current = true;
      setFonts(next.fonts);
      setGlyphMap(next.glyphMap);
      setCurrentHistoryIndex(historyIndexRef.current);
    }
  };

  // Save workspace when fonts or glyphMap change
  const saveTimeoutRef = useRef<number | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isWorkspaceLoading) return;
    
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Guard: never auto-save an empty state over an existing workspace
    if (fonts.length === 0 && Object.keys(glyphMap).length === 0) {
      return;
    }

    setSaveStatus('saving');
    
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        await saveWorkspace(fonts, glyphMap);
        setSaveStatus('saved');
        // Reset saved status after 2 seconds
        window.setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to auto-save workspace', err);
        setSaveStatus('error');
      }
    }, 1000); // Debounce saves by 1s

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [fonts, glyphMap, isWorkspaceLoading]);

  const baseFont = fonts.length > 0 ? fonts[0] : undefined;

  const handleGenerate = async () => {
    if (!baseFont) return;
    setIsGenerating(true);
    setProgressMsg('Initializing generator...');
    try {
      const arrayBuffer = await generateFusedFont(baseFont, fonts, glyphMap, (msg) => {
        setProgressMsg(msg);
      });
      setProgressMsg('Complete! Downloading to your files...');
      
      const baseProjectName = (currentProjectName || 'FusedFont').replace(/\.(otf|ttf|woff|woff2)$/i, '').trim() || 'FusedFont';
      const downloadFilename = `${baseProjectName}.otf`;
      const directUrl = (arrayBuffer as any).downloadUrl;
      
      downloadArrayBuffer(arrayBuffer, downloadFilename, directUrl);
      
      setDownloadNotification({
        filename: downloadFilename,
        url: directUrl,
        buffer: arrayBuffer
      });
    } catch (err: any) {
      console.error(err);
      let msg = err.message || String(err);
      if (msg.includes('<html')) msg = 'Server returned an HTML error page. The request might be too large.';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = 'Connection interrupted during upload or fusion. Please try again.';
      }
      setGlobalError(`Failed to generate font: ${msg}`);
    } finally {
      setIsGenerating(false);
      setProgressMsg('');
    }
  };

  
  const handleJumpToBlockForFont = (font: UploadedFont) => {
    if (!font) return;
    const supported = font.supportedCodePoints;
    if (!supported || (supported instanceof Set && supported.size === 0)) return;

    const blockCounts = new Array(UNICODE_BLOCKS.length).fill(0);
    const cpList = supported instanceof Set ? Array.from(supported) : Array.isArray(supported) ? supported : [];
    if (cpList.length === 0) return;

    for (const cp of cpList) {
      if (typeof cp !== 'number' || cp < 0) continue;
      for (let i = 0; i < UNICODE_BLOCKS.length; i++) {
        const b = UNICODE_BLOCKS[i];
        if (b.start >= 0 && cp >= b.start && cp <= b.end) {
          blockCounts[i]++;
          break;
        }
      }
    }

    let bestIdx = -1;
    let maxCount = 0;
    for (let i = 0; i < blockCounts.length; i++) {
      if (blockCounts[i] > maxCount) {
        maxCount = blockCounts[i];
        bestIdx = i;
      }
    }

    if (bestIdx !== -1 && maxCount > 0) {
      setSelectedBlockIndex(bestIdx);
    }
  };

  const handleSetBaseFont = (fontId: string) => {
    setFonts(prev => {
      const idx = prev.findIndex(f => f.id === fontId);
      if (idx <= 0) return prev;
      const copy = [...prev];
      const [target] = copy.splice(idx, 1);
      return [target, ...copy];
    });
  };

  const handleApplyFont = (fontId: string) => {
    if (selectedCharacters.size > 0) {
      setGlyphMap(prev => {
        const next = { ...prev };
        for (const cp of selectedCharacters) {
          next[cp] = fontId;
        }
        return next;
      });
      setSelectedCharacters(new Set());
    } else {
      // If no characters selected, promote this font to Base Font (index 0) so all glyphs immediately render with it
      handleSetBaseFont(fontId);
    }
  };

  const mappedCount = Object.keys(glyphMap).length;

  const handleResetWorkspaceCache = async () => {
    try {
      await clearWorkspace();
    } catch (e) {
      console.warn('clearWorkspace error', e);
    }
    setFonts([]);
    setGlyphMap({});
    setSelectedCharacters(new Set());
    historyRef.current = [];
    historyIndexRef.current = -1;
    setHistoryLength(0);
    setCurrentHistoryIndex(-1);
    setCurrentProjectName("Untitled Project");
    setIsWorkspaceLoading(false);
    setSaveStatus('idle');
    setResetFeedback("Workspace cache cleared successfully. Fresh workspace ready.");
    setTimeout(() => setResetFeedback(null), 4000);
  };

  const handleNewProject = (name: string) => {
    setCurrentProjectName(name);
    setFonts([]);
    setGlyphMap({});
    setSelectedCharacters(new Set());
    
    // Clear history
    historyRef.current = [];
    historyIndexRef.current = -1;
    setHistoryLength(0);
    setCurrentHistoryIndex(-1);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-gray-200 font-sans relative">
      {isGlobalDragging && (
        <div className="fixed inset-0 bg-blue-950/80 backdrop-blur-xs border-4 border-dashed border-blue-400 z-50 flex flex-col items-center justify-center pointer-events-none p-6 text-center animate-in fade-in duration-200">
          <Upload className="w-16 h-16 text-blue-400 animate-bounce mb-4" />
          <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-2">Drop Font Files Anywhere</h2>
          <p className="text-sm text-blue-200">Automatically adds and parses .ttf, .otf, .woff, .woff2, .ttc</p>
        </div>
      )}

      {/* Floating Processing Bar when font file is adding */}
      {isProcessingFonts && fontLoadingProgress && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-none">
          <div className="bg-[#101726]/95 backdrop-blur-md border border-blue-500/50 rounded-xl p-4 shadow-2xl flex flex-col gap-2.5 pointer-events-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between text-xs font-mono text-blue-300">
              <span className="flex items-center gap-2 font-bold text-white">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                Adding Font {fontLoadingProgress.current}/{fontLoadingProgress.total}
              </span>
              <span className="font-extrabold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
                {fontLoadingProgress.percent}%
              </span>
            </div>

            {/* Progress Bar Track */}
            <div className="w-full bg-[#080d17] rounded-full h-3 overflow-hidden border border-blue-500/30 p-[1.5px]">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(59,130,246,0.7)]"
                style={{ width: `${Math.max(6, fontLoadingProgress.percent)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-gray-300 font-mono">
              <span className="truncate max-w-[220px]" title={fontLoadingProgress.fileName}>
                {fontLoadingProgress.fileName}
              </span>
              <span className="text-blue-400/90 animate-pulse font-medium">
                {fontLoadingProgress.status || "Processing font file..."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* If its not loaded, its error */}
      {fontLoadError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
          <div className="bg-red-950/95 backdrop-blur-md border border-red-500/60 rounded-xl p-4 shadow-2xl flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-red-200 uppercase text-[11px] tracking-wider">Font Loading Error</span>
                  <span className="text-xs text-red-300 whitespace-pre-wrap break-words mt-1">{fontLoadError}</span>
                </div>
              </div>
              <button 
                onClick={() => setFontLoadError(null)} 
                className="text-red-400 hover:text-white p-1 rounded hover:bg-white/10 shrink-0 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cache Reset Notification */}
      {resetFeedback && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-950/95 backdrop-blur-md border border-emerald-500/50 text-emerald-200 px-4 py-2.5 rounded-lg shadow-xl text-xs font-mono flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{resetFeedback}</span>
        </div>
      )}

      {/* Font Load Success Notification */}
      {fontLoadSuccess && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-none">
          <div className="bg-emerald-950/95 backdrop-blur-md border border-emerald-500/50 rounded-xl p-3 shadow-xl flex items-center gap-2.5 text-xs font-mono text-emerald-200 animate-in fade-in pointer-events-auto">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{fontLoadSuccess}</span>
            <button 
              onClick={() => setFontLoadSuccess(null)} 
              className="ml-auto text-emerald-400 hover:text-white p-0.5 rounded hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between px-6 py-4 bg-[#141414] border-b border-white/5 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white italic">F</div>
          <h1 className="text-lg font-semibold tracking-tight uppercase text-white">GlyphFuse <span className="text-blue-500 text-sm ml-1 opacity-80">Pro Editor</span></h1>
        </div>
        
        <div className="flex items-center gap-6">
          
          <div className="flex items-center gap-1 bg-[#1a1a1a] rounded border border-white/5 p-1 hidden sm:flex">
            <button
              onClick={handleUndo}
              disabled={currentHistoryIndex <= 0}
              className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 hover:bg-white/10 rounded transition-colors"
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-gray-500 font-mono w-8 text-center">{currentHistoryIndex + 1}/{historyLength}</span>
            <button
              onClick={handleRedo}
              disabled={currentHistoryIndex >= historyLength - 1}
              className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 hover:bg-white/10 rounded transition-colors"
              title="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-500/20 rounded text-[11px] font-medium text-emerald-400 hidden lg:flex" title="Unicode 18.0 Ready: All user save files remain safe, isolated, and fully compatible across updates.">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Unicode 18.0 (Saves Safe)</span>
          </div>

          <button
            onClick={() => setIsColorInspectorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-950/70 via-pink-950/50 to-blue-950/70 border border-purple-500/40 hover:border-purple-400/80 rounded text-[11px] font-bold text-purple-200 shadow-sm shadow-purple-500/10 transition-all hover:scale-[1.02] active:scale-[0.98] group"
            title="COLOR UPDATE: OpenType SVG, COLR, and CPAL/CAPL color tables enabled. Click to inspect!"
          >
            <span className="text-sm group-hover:rotate-12 transition-transform">🎨</span>
            <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent font-extrabold uppercase tracking-wider">
              COLOR UPDATE
            </span>
            <span className="text-[10px] text-purple-300/70 hidden xl:inline font-mono">
              (SVG • COLR • CPAL/CAPL)
            </span>
          </button>

          <span className="text-xs font-medium text-gray-400 uppercase tracking-widest hidden sm:inline-block">
            <strong className="text-blue-400">{mappedCount}</strong> swaps
          </span>
          <button
            onClick={() => setIsTypeTesterOpen(true)}
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-white/5 border border-white/10 text-gray-300 text-xs font-bold rounded-sm uppercase tracking-tighter transition-colors flex items-center gap-2"
            title="Open Type Tester to preview font, caret symbol, and text cursor"
          >
            <Type className="w-4 h-4 text-blue-400" />
            <span className="hidden sm:inline">Type Tester</span>
          </button>
          <button
            onClick={() => setIsSavesModalOpen(true)}
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-white/5 border border-white/10 text-gray-300 text-xs font-bold rounded-sm uppercase tracking-tighter transition-colors flex items-center gap-2"
          >
            <SaveAll className="w-4 h-4" />
            <span className="hidden sm:inline">Saves</span>
          </button>
          <button
            onClick={handleResetWorkspaceCache}
            className="px-3.5 py-2 bg-[#1a1a1a] hover:bg-red-950/50 border border-white/10 hover:border-red-500/40 text-gray-300 hover:text-red-300 text-xs font-bold rounded-sm uppercase tracking-tighter transition-colors flex items-center gap-2"
            title="Reset workspace cache: removes cached font files and stored mappings"
          >
            <RotateCcw className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Reset Cache</span>
          </button>
          <button
            onClick={handleGenerate}
            disabled={fonts.length === 0 || isGenerating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-sm uppercase tracking-tighter transition-colors flex items-center gap-2"
          >
            {isGenerating ? (
              <span className="animate-pulse">{progressMsg || 'Generating...'}</span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Generate Fused Font
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        <ErrorBoundary fallbackTitle="Font Manager Recovered">
          <FontManager 
            fonts={fonts} 
            setFonts={setFonts}
            onApplyFont={handleApplyFont}
            onSetBaseFont={handleSetBaseFont}
            hasSelection={selectedCharacters.size > 0}
            setGlyphMap={setGlyphMap}
            onJumpToBlockForFont={handleJumpToBlockForFont}
          />
        </ErrorBoundary>
        
        <ErrorBoundary fallbackTitle="Explorer View Recovered">
          <UnicodeExplorer 
            fonts={fonts}
            setFonts={setFonts}
            glyphMap={glyphMap}
            setGlyphMap={setGlyphMap}
            selectedBlockIndex={selectedBlockIndex}
            setSelectedBlockIndex={setSelectedBlockIndex}
            selectedCharacters={selectedCharacters}
            setSelectedCharacters={setSelectedCharacters}
          />
        </ErrorBoundary>
      </main>

      <footer className="h-8 bg-[#1a1a1a] border-t border-white/5 flex items-center justify-between px-6 text-[10px] font-mono text-gray-500 shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> 
            Engine Ready
          </span>
          {isRestoringWorkspace && (
            <span className="flex items-center gap-1.5 text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
              Restoring saved fonts...
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-300 hidden sm:inline-block">
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Autosaved'}
            {saveStatus === 'error' && <span className="text-red-400">Save Error</span>}
            {saveStatus === 'idle' && 'Autosave Enabled'}
          </span>
        </div>
      </footer>
      
      <SavesModal 
        isOpen={isSavesModalOpen}
        onClose={() => setIsSavesModalOpen(false)}
        currentFonts={fonts}
        currentGlyphMap={glyphMap}
        currentProjectName={currentProjectName}
        onNewProject={handleNewProject}
        onRenameCurrent={setCurrentProjectName}
        onSaveCurrent={async (name) => {
          const { saveNamedFusion } = await import('./lib/workspace');
          await saveNamedFusion(name, fonts, glyphMap);
        }}
        onLoad={(loadedFonts, loadedGlyphMap, loadedName) => {
          loadedFonts.forEach(f => {
            if (f.buffer) registerFontBuffer(f.id, f.name, f.fileName, f.buffer);
          });
          setFonts(loadedFonts);
          setGlyphMap(loadedGlyphMap);
          setSelectedCharacters(new Set());
          if (loadedName) setCurrentProjectName(loadedName);
          historyRef.current = [{ fonts: loadedFonts, glyphMap: loadedGlyphMap }];
          historyIndexRef.current = 0;
          skipHistoryRef.current = true;
          setHistoryLength(1);
          setCurrentHistoryIndex(0);
          saveWorkspace(loadedFonts, loadedGlyphMap).catch(() => {});
        }}
      />

      <TypeTesterModal
        isOpen={isTypeTesterOpen}
        onClose={() => setIsTypeTesterOpen(false)}
        fonts={fonts}
      />

      <ColorTablesModal
        isOpen={isColorInspectorOpen}
        onClose={() => setIsColorInspectorOpen(false)}
        fonts={fonts}
      />

      {globalError && (
        <div className="fixed bottom-6 left-6 z-50 bg-[#1a1111] border border-red-500/50 rounded-lg p-4 shadow-2xl flex items-center gap-3 max-w-md backdrop-blur-md text-red-200 text-xs">
          <div className="flex-1 font-mono">{globalError}</div>
          <button onClick={() => setGlobalError(null)} className="p-1 text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {downloadNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161616] border border-blue-500/50 rounded-lg p-4 shadow-2xl flex items-center gap-4 max-w-md backdrop-blur-md">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Font Downloaded</h4>
            <p className="text-[11px] text-gray-300 truncate">Saved <span className="text-blue-300 font-mono font-semibold">{downloadNotification.filename}</span> to your downloads folder.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => downloadArrayBuffer(downloadNotification.buffer, downloadNotification.filename, downloadNotification.url)}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
              title="Download file again"
            >
              <Download className="w-3.5 h-3.5" /> Save Again
            </button>
            <button
              onClick={() => setDownloadNotification(null)}
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
