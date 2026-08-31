import React, { useState, useEffect, useRef } from 'react';
import { Download, Layers, Loader2, SaveAll, Undo2, Redo2, History } from 'lucide-react';
import { FontManager } from './components/FontManager';
import { UnicodeExplorer } from './components/UnicodeExplorer';
import { SavesModal } from './components/SavesModal';
import { generateFusedFont, downloadArrayBuffer, safeStringFromCodePoint } from './lib/fontUtils';
import { saveWorkspace, loadWorkspace, cleanupOrphanedFonts } from './lib/workspace';
import { UNICODE_BLOCKS } from './lib/unicodeBlocks';
import type { UploadedFont, GlyphMapping } from './types';

export default function App() {
  const [fonts, setFonts] = useState<UploadedFont[]>([]);
  const [glyphMap, setGlyphMap] = useState<GlyphMapping>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle');
  const [isSavesModalOpen, setIsSavesModalOpen] = useState(false);
  
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(() => Math.max(0, UNICODE_BLOCKS.findIndex(b => b.name === "Basic Latin")));
  const [selectedCharacters, setSelectedCharacters] = useState<Set<number>>(new Set());

  const [historyLength, setHistoryLength] = useState(0);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const historyRef = useRef<{fonts: UploadedFont[], glyphMap: GlyphMapping}[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);


  // Load workspace on mount
  useEffect(() => {
    async function load() {
      try {
        const saved = await loadWorkspace();
        setTimeout(cleanupOrphanedFonts, 5000); // Cleanup in background after 5s
        if (saved && saved.fonts.length > 0) {
          setFonts(saved.fonts);
          setGlyphMap(saved.glyphMap);
          historyRef.current = [{ fonts: saved.fonts, glyphMap: saved.glyphMap }];
          historyIndexRef.current = 0;
        } else {
          historyRef.current = [{ fonts: [], glyphMap: {} }];
          historyIndexRef.current = 0;
        }
        skipHistoryRef.current = true;
        setHistoryLength(historyRef.current.length);
        setCurrentHistoryIndex(historyIndexRef.current);
      } catch (err) {
        console.error('Failed to load workspace on mount', err);
      } finally {
        setIsWorkspaceLoading(false);
      }
    }
    load();
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

    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push({ fonts, glyphMap });
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
      setProgressMsg('Complete! Downloading...');
      
      const ext = baseFont.fileName.toLowerCase().endsWith('.otf') ? '.otf' : '.ttf';
      
      downloadArrayBuffer(arrayBuffer, 'FusedFont' + ext);
      
      setTimeout(() => {
        alert("Fusion Complete! The font was downloaded in your browser.");
      }, 500);

    } catch (err) {
      console.error(err);
      let msg = err.message || String(err);
      if (msg.includes('<html')) msg = 'Server returned an HTML error page. The request might be too large.';
      alert(`Failed to generate font: ${msg}\n${err.stack}`);
    } finally {
      setIsGenerating(false);
      setProgressMsg('');
    }
  };

  
  const handleApplyFont = (fontId: string) => {
    if (selectedCharacters.size === 0) return;
    setGlyphMap(prev => {
      const next = { ...prev };
      for (const cp of selectedCharacters) {
        next[cp] = fontId;
      }
      return next;
    });
    setSelectedCharacters(new Set());
  };

  const mappedCount = Object.keys(glyphMap).length;

  if (isWorkspaceLoading) {
    return (
      <div className="flex flex-col h-screen bg-[#0a0a0a] text-gray-200 font-sans items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
        <p className="text-sm font-medium text-gray-400 uppercase tracking-widest">Restoring Workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-gray-200 font-sans">
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

          <span className="text-xs font-medium text-gray-400 uppercase tracking-widest hidden sm:inline-block">
            <strong className="text-blue-400">{mappedCount}</strong> swaps
          </span>
          <button
            onClick={() => setIsSavesModalOpen(true)}
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-white/5 border border-white/10 text-gray-300 text-xs font-bold rounded-sm uppercase tracking-tighter transition-colors flex items-center gap-2"
          >
            <SaveAll className="w-4 h-4" />
            <span className="hidden sm:inline">Saves</span>
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
                Compile TTF File
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        <FontManager 
          fonts={fonts} 
          setFonts={setFonts}
          onApplyFont={handleApplyFont}
          hasSelection={selectedCharacters.size > 0}
          setGlyphMap={setGlyphMap}
        />
        
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
      </main>

      <footer className="h-8 bg-[#1a1a1a] border-t border-white/5 flex items-center justify-between px-6 text-[10px] font-mono text-gray-500 shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> 
            Engine Ready
          </span>
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
        onLoad={(loadedFonts, loadedGlyphMap) => {
          setFonts(loadedFonts);
          setGlyphMap(loadedGlyphMap);
          setSelectedCharacters(new Set());
        }}
      />
    </div>
  );
}
