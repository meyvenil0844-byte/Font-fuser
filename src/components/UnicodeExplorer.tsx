import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UNICODE_BLOCKS } from '../lib/unicodeBlocks';
import { safeStringFromCodePoint, traceImageToFont } from '../lib/fontUtils';
import type { UploadedFont, GlyphMapping, UnicodeBlock } from '../types';
import { cn } from '../lib/utils';
import { MousePointer2, PaintBucket, Trash2, Search } from 'lucide-react';
import { VirtuosoGrid } from 'react-virtuoso';

interface UnicodeExplorerProps {
  fonts: UploadedFont[];
  setFonts: React.Dispatch<React.SetStateAction<UploadedFont[]>>;
  glyphMap: GlyphMapping;
  setGlyphMap: React.Dispatch<React.SetStateAction<GlyphMapping>>;
  selectedBlockIndex: number;
  setSelectedBlockIndex: (index: number) => void;
  selectedCharacters: Set<number>;
  setSelectedCharacters: React.Dispatch<React.SetStateAction<Set<number>>>;
}

export function UnicodeExplorer({ fonts, setFonts, glyphMap, setGlyphMap, selectedBlockIndex, setSelectedBlockIndex, selectedCharacters, setSelectedCharacters }: UnicodeExplorerProps) {
  const [dragSelecting, setDragSelecting] = useState(false);
  const [dragState, setDragState] = useState<'select' | 'deselect'>('select');
  const [showEmpty, setShowEmpty] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [glyphSearchQuery, setGlyphSearchQuery] = useState('');
  

  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i }));
    
    const query = searchQuery.toLowerCase();
    
    const chars = Array.from(searchQuery as string);
    if (chars.length === 1) {
      const cp = chars[0].codePointAt(0);
      if (cp !== undefined) {
        return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i })).filter(b => 
          (cp >= b.start && cp <= b.end) || b.name.toLowerCase().includes(query)
        );
      }
    }
    
    return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i })).filter(b => {
      if (b.name.toLowerCase().includes(query)) return true;
      let hexQuery = query.replace(/^(u\+|0x)/i, '').trim();
      if (/^[0-9a-f]+$/i.test(hexQuery)) {
         const cp = parseInt(hexQuery, 16);
         if (cp >= b.start && cp <= b.end) return true;
      }
      return false;
    });
  }, [searchQuery]);

  useEffect(() => {
    if (filteredBlocks.length > 0 && searchQuery.trim() !== '') {
       const hasCurrent = filteredBlocks.some(b => b.originalIndex === selectedBlockIndex);
       if (!hasCurrent) {
          setSelectedBlockIndex(filteredBlocks[0].originalIndex);
       }
    }
  }, [filteredBlocks, selectedBlockIndex, setSelectedBlockIndex, searchQuery]);

  const block = UNICODE_BLOCKS[selectedBlockIndex];
  
  const baseFont = fonts.length > 0 ? fonts[0] : undefined;

  // Generate characters for current block
  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    const isForgottenBlock = block.name === 'Forgotten Characters';
    
    // Explicit list of tricky/forgotten/meta codepoints that font devs care about
    const forgottenList = [
      0x0000, // NULL
      0x0009, // Tab
      0x000A, // LF
      0x000D, // CR
      0x0020, // Space
      0x00A0, // NBSP
      0x00AD, // Soft Hyphen
      0x200B, // ZWSP
      0x200C, // ZWNJ
      0x200D, // ZWJ
      0x2028, // Line Separator
      0x2029, // Paragraph Separator
      0x2060, // Word Joiner
      0xFEFF, // ZWNBSP / BOM
      0xFFFD, // Replacement Character (.notdef fallback)
    ];

    if (isForgottenBlock) {
      for (const cp of forgottenList) {
        if (query) {
          const hex = cp.toString(16).toUpperCase().padStart(4, '0');
          if (!hex.toLowerCase().includes(query)) continue;
        }
        chars.push(cp);
      }
      return chars;
    }

    const start = block.start;
    const end = block.end;

    for (let cp = start; cp <= end; cp++) {
      const charStr = safeStringFromCodePoint(cp);
      let isMissing = false;
      
      const mappedId = glyphMap[cp];
      const displayFont = mappedId ? fonts.find(f => f.id === mappedId) : baseFont;

      if (!charStr) {
         isMissing = true; // Surrogate or unrenderable
      } else {
         if (displayFont && displayFont.parsed) {
            const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
            if (glyphIndex === 0) {
               isMissing = true; // .notdef
            }
         } else {
            isMissing = true; // No font or no glyphs
         }
      }

      if (!charStr) continue; // Standard blocks skip unrenderables natively
      if (!showEmpty && isMissing) continue; // Standard blocks hide empty if toggled off

      if (query) {
         let match = false;
         if (displayFont && displayFont.parsed && charStr) {
             const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
             const glyph = displayFont.parsed.glyphs.get(glyphIndex);
             if (glyph && glyph.name && glyph.name.toLowerCase().includes(query)) {
                 match = true;
             }
         }
         const hex = cp.toString(16).toUpperCase().padStart(4, '0');
         if (hex.toLowerCase().includes(query)) match = true;
         if (charStr && charStr.toLowerCase() === query) match = true;
         
         if (!match) continue;
      }

      chars.push(cp);
    }
    return chars;
  }, [block, showEmpty, baseFont, glyphMap, fonts, glyphSearchQuery]);

  // When block changes, clear selection
  useEffect(() => {
    setSelectedCharacters(new Set());
  }, [selectedBlockIndex, setSelectedCharacters]);

  const handlePointerDown = (e: React.PointerEvent, cp: number) => {
    if (e.pointerType === 'mouse') {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      
      setDragSelecting(true);
      const isCurrentlySelected = selectedCharacters.has(cp);
      setDragState(isCurrentlySelected ? 'deselect' : 'select');
      
      setSelectedCharacters(prev => {
        const next = new Set(prev);
        if (isCurrentlySelected) {
          next.delete(cp);
        } else {
          next.add(cp);
        }
        return next;
      });
    }
  };

  const handlePointerEnter = (e: React.PointerEvent, cp: number) => {
    if (e.pointerType === 'mouse' && dragSelecting) {
      setSelectedCharacters(prev => {
        const next = new Set(prev);
        if (dragState === 'select') {
          next.add(cp);
        } else {
          next.delete(cp);
        }
        return next;
      });
    }
  };

  const handlePointerUpItem = (e: React.PointerEvent, cp: number) => {
    if (e.pointerType !== 'mouse') {
      const isCurrentlySelected = selectedCharacters.has(cp);
      setSelectedCharacters(prev => {
        const next = new Set(prev);
        if (isCurrentlySelected) {
          next.delete(cp);
        } else {
          next.add(cp);
        }
        return next;
      });
    }
  };

  useEffect(() => {
    const handlePointerUp = () => setDragSelecting(false);
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const gridContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(z => Math.max(0.5, Math.min(z * (1 - e.deltaY * 0.01), 5)));
      }
    };
    
    let initDist = 0;
    let initZoom = 1;

    const handleTouchStartNative = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initZoom = zoomRef.current;
      }
    };
    
    const handleTouchMoveNative = (e: TouchEvent) => {
      if (e.touches.length === 2 && initDist > 0) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        setZoom(Math.max(0.5, Math.min(initZoom * (dist / initDist), 5)));
      }
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    container.addEventListener('touchstart', handleTouchStartNative, { passive: false });
    container.addEventListener('touchmove', handleTouchMoveNative, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheelNative);
      container.removeEventListener('touchstart', handleTouchStartNative);
      container.removeEventListener('touchmove', handleTouchMoveNative);
    };
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (selectedCharacters.size === 0) return;

    setIsUploading(true);
    try {
      const newFont = await traceImageToFont(file, file.name, Array.from(selectedCharacters));
      newFont.isHidden = true; // don't show in sidebar
      setFonts(prev => [...prev, newFont]);
      
      setGlyphMap(prev => {
        const next = { ...prev };
        selectedCharacters.forEach(cp => {
          next[cp] = newFont.id;
        });
        return next;
      });
      setSelectedCharacters(new Set());
    } catch (err) {
      console.error(err);
      alert('Failed to trace image: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearBlock = () => {
    setGlyphMap(prev => {
      const next = { ...prev };
      characters.forEach(cp => {
        delete next[cp];
      });
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d0d0d]">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 bg-[#0d0d0d] gap-4 shrink-0">
        <div className="flex flex-col gap-2 w-full max-w-[350px]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search blocks (e.g. 'emoji') or characters (e.g. 'A', 'U+0041')"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-[#1a1a1a] border border-white/10 text-xs py-1.5 pl-8 pr-2 rounded outline-none focus:border-blue-500 text-gray-200 w-full"
            />
          </div>
          <select 
            value={selectedBlockIndex}
            onChange={(e) => setSelectedBlockIndex(Number(e.target.value))}
            className="bg-[#1a1a1a] border border-white/10 text-xs p-1.5 rounded outline-none focus:border-blue-500 text-gray-200 w-full"
          >
            {filteredBlocks.map((b) => (
              <option key={b.name} value={b.originalIndex}>{b.name} {b.start >= 0 ? `(U+${b.start.toString(16).toUpperCase()} - U+${b.end.toString(16).toUpperCase()})` : ''}</option>
            ))}
            {filteredBlocks.length === 0 && (
              <option disabled value={-1}>No results found</option>
            )}
          </select>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Filter by glyph name (e.g. 'arrow', 'face')"
              value={glyphSearchQuery}
              onChange={e => setGlyphSearchQuery(e.target.value)}
              className="bg-[#1a1a1a] border border-white/10 text-xs py-1.5 pl-8 pr-2 rounded outline-none focus:border-blue-500 text-gray-200 w-full"
            />
          </div>
          <label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none mt-2">
            <input 
              type="checkbox" 
              checked={showEmpty} 
              onChange={e => setShowEmpty(e.target.checked)}
              className="accent-blue-500 bg-[#1a1a1a] border-white/10 rounded"
            />
            Show Empty Glyphs
          </label>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setSelectedCharacters(new Set(characters))}
            className="px-3 py-1.5 bg-[#1a1a1a] border border-white/10 text-[10px] uppercase font-bold rounded hover:bg-white/5 text-gray-300 transition-colors flex items-center gap-1.5"
          >
            Select All
          </button>
          {selectedCharacters.size > 0 && (
            <button 
              onClick={() => setSelectedCharacters(new Set())}
              className="px-3 py-1.5 bg-[#1a1a1a] border border-white/10 text-[10px] uppercase font-bold rounded hover:bg-white/5 text-gray-300 transition-colors flex items-center gap-1.5"
            >
              Clear Selection ({selectedCharacters.size})
            </button>
          )}
          
          {selectedCharacters.size >= 2 && (
            <button 
              onClick={() => {
                const arr = Array.from(selectedCharacters);
                let min = arr[0];
                let max = arr[0];
                for (let i = 1; i < arr.length; i++) {
                  if (arr[i] < min) min = arr[i];
                  if (arr[i] > max) max = arr[i];
                }
                setSelectedCharacters(prev => {
                  const next = new Set(prev);
                  characters.forEach(cp => {
                    if (cp >= min && cp <= max) {
                      next.add(cp);
                    }
                  });
                  return next;
                });
              }}
              className="px-3 py-1.5 bg-[#1a1a1a] border border-white/10 text-[10px] uppercase font-bold rounded hover:bg-white/5 text-gray-300 transition-colors flex items-center gap-1.5"
              title="Select all characters between the first and last selected characters"
            >
              Select Range
            </button>
          )}
          
          {selectedCharacters.size > 0 && (
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3 py-1.5 bg-blue-600 border border-blue-500 text-[10px] uppercase font-bold rounded hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <PaintBucket className="w-3.5 h-3.5" /> 
              {isUploading ? 'Tracing...' : 'Upload Image to Glyph'}
            </button>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".png,.jpg,.jpeg,.svg" 
            onChange={handleImageUpload} 
          />

          <button onClick={clearBlock}
            className="px-3 py-1.5 bg-[#1a1a1a] border border-white/10 text-[10px] uppercase font-bold rounded hover:bg-white/5 text-gray-300 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Mappings
          </button>
          
          
        </div>
      </div>

      <style>{`
        .zoomable-grid {
          grid-template-columns: repeat(auto-fill, minmax(calc(4rem * var(--zoom, 1)), 1fr));
        }
      `}</style>
      <div className="flex-1 bg-[#0d0d0d]" ref={gridContainerRef} style={{ '--zoom': zoom } as React.CSSProperties}>
        {fonts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <MousePointer2 className="w-8 h-8 mb-4 text-gray-700" />
            <p className="text-sm font-medium">Upload fonts to begin exploring.</p>
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center text-gray-500 text-sm p-6">
            No supported characters found in this block for the current base font. 
            <br/><br/>
            Toggle "Show Empty Glyphs" to see all unmapped characters.
          </div>
        ) : (
          <VirtuosoGrid
            style={{ height: '100%' }}
            data={characters}
            listClassName="grid zoomable-grid gap-3 p-6 touch-pan-y"
            itemContent={(index, cp) => {
              const mappedFontId = glyphMap[cp];
              const displayFont = mappedFontId 
                ? fonts.find(f => f.id === mappedFontId) 
                : baseFont;
              
              const isMapped = !!mappedFontId;
              const isSelected = selectedCharacters.has(cp);

              return (
                <div 
                  key={cp}
                  onPointerDown={(e) => handlePointerDown(e, cp)}
                  onPointerEnter={(e) => handlePointerEnter(e, cp)}
                  onPointerUp={(e) => handlePointerUpItem(e, cp)}
                  className={cn(
                    "group relative flex flex-col items-center justify-center aspect-square rounded-sm border cursor-pointer select-none transition-all",
                    isSelected 
                      ? "bg-blue-500/20 border-blue-400 shadow-[inset_0_0_15px_rgba(59,130,246,0.2)]" 
                      : isMapped
                        ? "bg-white/5 border-white/20"
                        : "bg-[#1a1a1a] border-white/5 hover:border-white/30"
                  )}
                  style={{
                    borderColor: isSelected ? undefined : (isMapped && displayFont ? displayFont.color : undefined),
                  }}
                  title={`U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${isMapped && displayFont ? `(${displayFont.name})` : ''}`}
                >
                  {isMapped && displayFont && (
                    <div 
                      className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" 
                      style={{ 
                        backgroundColor: displayFont.color,
                        boxShadow: `0 0 6px ${displayFont.color}`
                      }} 
                    />
                  )}
                  
                  <span 
                    className="text-2xl flex items-center justify-center" 
                    style={{ 
                      fontFamily: displayFont?.fontFamilyName || 'inherit',
                      color: isMapped ? '#e5e5e5' : '#888'
                    }}
                  >
                    {(block.name === 'Forgotten Characters' && cp !== 0xFFFD && cp !== 0x0020) ? (
                       <div className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500 opacity-50 min-w-[12px] min-h-[12px] flex items-center justify-center">
                         {safeStringFromCodePoint(cp)}
                       </div>
                    ) : safeStringFromCodePoint(cp) || <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span>}
                  </span>
                  <span className={cn(
                    "text-[9px] font-mono mt-1",
                    isMapped ? "text-blue-400/70" : "text-gray-600"
                  )}>
                    {cp.toString(16).toUpperCase().padStart(4, '0')}
                  </span>
                </div>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
