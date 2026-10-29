import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UNICODE_BLOCKS } from '../lib/unicodeBlocks';
import { safeStringFromCodePoint, traceImageToFont, extractSupportedCodePoints, parseSfntBasic, TraceOptions } from '../lib/fontUtils';
import { ImageTraceModal } from './ImageTraceModal';
import { isArabicCodepoint, ARABIC_LIGATURE_INFO, getArabicJoiningType } from '../lib/arabicUtils';
import { isDuployanCodepoint, isDuployanControl, isDuployanAffixOrMark, isDuployanUnassigned, getDuployanControlInfo, DUPLOYAN_NAMES } from '../lib/duployanUtils';
import type { UploadedFont, GlyphMapping, UnicodeBlock } from '../types';
import { cn } from '../lib/utils';
import { MousePointer2, PaintBucket, Trash2, Search, Eraser, ChevronUp, ChevronDown, ArrowLeftRight, Sparkles } from 'lucide-react';
import { VirtuosoGrid, VirtuosoGridHandle } from 'react-virtuoso';
import { ColorGlyphModal } from './ColorGlyphModal';

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

// Pre-filtered and sorted valid Unicode blocks (excluding meta blocks with start < 0) for reliable O(log M) binary search
export const VALID_UNICODE_BLOCKS = UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i }))
  .filter(b => typeof b.start === 'number' && b.start >= 0 && typeof b.end === 'number' && b.end >= b.start)
  .sort((a, b) => a.start - b.start);

// Binary search helper: fast O(log M) lookup to map codepoint to Unicode block original index
export function getBlockIndexForCodepoint(cp: number): number {
  if (typeof cp !== 'number' || cp < 0 || isNaN(cp)) return -1;
  let low = 0;
  let high = VALID_UNICODE_BLOCKS.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const b = VALID_UNICODE_BLOCKS[mid];
    if (cp < b.start) {
      high = mid - 1;
    } else if (cp > b.end) {
      low = mid + 1;
    } else {
      return b.originalIndex;
    }
  }
  return -1;
}

export function isZnamennyCinnabarMark(cp: number): boolean {
  // 46 Znamenny Cinnabar Combining Marks (U+1CF00 - U+1CF2D)
  return cp >= 0x1CF00 && cp <= 0x1CF2D;
}

export function isZnamennyCombiningMark(cp: number): boolean {
  // All Znamenny Musical Notation combining marks (0x1CF00 - 0x1CF2D Cinnabar, and 0x1CF30 - 0x1CF46 normal combining marks)
  // Both are rendered in red
  return (cp >= 0x1CF00 && cp <= 0x1CF2D) || (cp >= 0x1CF30 && cp <= 0x1CF46);
}

export function isCombiningMark(cp: number): boolean {
  // Standard Combining Diacritical Marks (0x0300 - 0x036F)
  if (cp >= 0x0300 && cp <= 0x036F) return true;
  // Combining Diacritical Marks Extended (0x1AB0 - 0x1AFF)
  if (cp >= 0x1AB0 && cp <= 0x1AFF) return true;
  // Combining Diacritical Marks Supplement (0x1DC0 - 0x1DFF)
  if (cp >= 0x1DC0 && cp <= 0x1DFF) return true;
  // Combining Diacritical Marks for Symbols (0x20D0 - 0x20FF)
  if (cp >= 0x20D0 && cp <= 0x20FF) return true;
  // Combining Half Marks (0xFE20 - 0xFE2F)
  if (cp >= 0xFE20 && cp <= 0xFE2F) return true;

  // Cyrillic Supplement (0x0500 - 0x052F) are base letters (Komi, Mordvin, etc.), NOT combining marks!
  if (cp >= 0x0500 && cp <= 0x052F) return false;

  // Upper little character superscripts / subscripts are standalone modifiers, NOT combining marks!
  // Superscripts and Subscripts (0x2070 - 0x209F)
  if (cp >= 0x2070 && cp <= 0x209F) return false;
  // Spacing Modifier Letters (0x02B0 - 0x02FF)
  if (cp >= 0x02B0 && cp <= 0x02FF) return false;
  // Phonetic Extensions (0x1D00 - 0x1DBF)
  if (cp >= 0x1D00 && cp <= 0x1DBF) return false;
  // Cyrillic Extended-A upper little letter superscripts (0x2DE0 - 0x2DFF) are NOT combining!
  if (cp >= 0x2DE0 && cp <= 0x2DFF) return false;
  // Cyrillic Extended-B letter superscripts (0xA674 - 0xA67D, 0xA69E, 0xA69F) are NOT combining!
  if (cp >= 0xA674 && cp <= 0xA67D) return false;
  if (cp === 0xA69E || cp === 0xA69F) return false;

  // True Cyrillic combining diacritics ONLY:
  if (cp >= 0x0483 && cp <= 0x0489) return true; // Titlo, palatalization, dasia, psili, pokrytie, enclosing signs
  if (cp >= 0xA66F && cp <= 0xA673) return true; // Vzmet, enclosing signs, asterisk
  if (cp === 0x1E08F) return true; // Combining Cyrillic small letter byelorussian-ukrainian i

  // Znamenny Musical Notation combining marks (ONLY 0x1CF00 - 0x1CF2D and 0x1CF30 - 0x1CF46)
  // Base musical notes/neumes (0x1CF50 - 0x1CFCF) are normal characters, NOT combining marks!
  if (cp >= 0x1CF00 && cp <= 0x1CF2D) return true;
  if (cp >= 0x1CF30 && cp <= 0x1CF46) return true;

  return false;
}

const bestBlockByFontIdCache = new Map<string, { index: number; name: string; count: number }>();

export function clearBestBlockCache() {
  bestBlockByFontIdCache.clear();
}

export function UnicodeExplorer({ fonts, setFonts, glyphMap, setGlyphMap, selectedBlockIndex, setSelectedBlockIndex, selectedCharacters, setSelectedCharacters }: UnicodeExplorerProps) {
  const [dragSelecting, setDragSelecting] = useState(false);
  const [dragState, setDragState] = useState<'select' | 'deselect'>('select');
  const [showEmpty, setShowEmpty] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [glyphSearchQuery, setGlyphSearchQuery] = useState('');
  const [traceModalFile, setTraceModalFile] = useState<File | null>(null);
  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const virtuosoRef = useRef<VirtuosoGridHandle>(null);
  

  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i }));
    
    const query = searchQuery.toLowerCase().replace(/['’\-_]/g, '').trim();
    
    const chars = Array.from(searchQuery as string);
    if (chars.length === 1) {
      const cp = chars[0].codePointAt(0);
      if (cp !== undefined) {
        return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i })).filter(b => 
          (cp >= b.start && cp <= b.end) || b.name.toLowerCase().replace(/['’\-_]/g, '').includes(query)
        );
      }
    }
    
    return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i })).filter(b => {
      const normalizedName = b.name.toLowerCase().replace(/['’\-_]/g, '');
      if (normalizedName.includes(query)) return true;
      // Enhanced Unicode searching
      // e.g. "0041", "U+0041", "0x0041", "\u0041"
      let hexQuery = searchQuery.toLowerCase().replace(/^(u\+?|0x|\\u)/i, '').trim();
      if (/^[0-9a-f]{2,6}$/i.test(hexQuery)) {
         const cp = parseInt(hexQuery, 16);
         if (!isNaN(cp) && cp >= b.start && cp <= b.end) return true;
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

  const block = UNICODE_BLOCKS[selectedBlockIndex] || UNICODE_BLOCKS[0];
  
  const baseFont = fonts.length > 0 ? fonts[0] : undefined;
  const fontMap = useMemo(() => new Map(fonts.map(f => [f.id, f])), [fonts]);

  // Pre-index supported codepoints per font for instant O(1) lookup across 65k glyphs
  const fontSupportedMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const f of fonts) {
      if (f.supportedCodePoints instanceof Set && f.supportedCodePoints.size > 0) {
        map.set(f.id, f.supportedCodePoints);
      } else if (Array.isArray(f.supportedCodePoints) && (f.supportedCodePoints as any).length > 0) {
        const s = new Set<number>(f.supportedCodePoints);
        f.supportedCodePoints = s;
        map.set(f.id, s);
      } else if (f.parsed) {
        let s = extractSupportedCodePoints(f.parsed);
        if (s.size === 0 && f.buffer && f.buffer.byteLength > 0) {
          try {
            const sfnt = parseSfntBasic(f.buffer, f.name);
            if (sfnt.codePoints.size > 0) s = sfnt.codePoints;
          } catch (e) {}
        }
        if (s.size === 0 && f.parsed.glyphs?.glyphs) {
          try {
            const glyphCollection = f.parsed.glyphs.glyphs;
            if (Array.isArray(glyphCollection)) {
              for (let i = 0; i < glyphCollection.length; i++) {
                const g: any = glyphCollection[i];
                if (g) {
                  if (typeof g.unicode === 'number' && g.unicode > 0) s.add(g.unicode);
                  if (Array.isArray(g.unicodes)) {
                    for (const u of g.unicodes) if (typeof u === 'number' && u > 0) s.add(u);
                  }
                }
                if (s.size >= 65536) break;
              }
            } else if (typeof glyphCollection === 'object') {
              for (const k in glyphCollection) {
                const g: any = glyphCollection[k];
                if (g) {
                  if (typeof g.unicode === 'number' && g.unicode > 0) s.add(g.unicode);
                  if (Array.isArray(g.unicodes)) {
                    for (const u of g.unicodes) if (typeof u === 'number' && u > 0) s.add(u);
                  }
                }
                if (s.size >= 65536) break;
              }
            }
          } catch (e) {}
        }
        f.supportedCodePoints = s;
        map.set(f.id, s);
      } else if (f.buffer && f.buffer.byteLength > 0) {
        const sfnt = parseSfntBasic(f.buffer, f.name);
        f.supportedCodePoints = sfnt.codePoints;
        map.set(f.id, sfnt.codePoints);
      } else {
        map.set(f.id, new Set());
      }
    }
    return map;
  }, [fonts]);

  // Fast O(K log M) cached helper to find the best Unicode block for a set of supported codepoints
  const findBestBlockForSupported = (fontId: string | undefined, supported: Set<number> | undefined): { index: number; name: string; count: number } | null => {
    if (!supported || supported.size === 0) return null;
    const cacheKey = fontId || 'anon';
    if (cacheKey && bestBlockByFontIdCache.has(cacheKey)) {
      return bestBlockByFontIdCache.get(cacheKey)!;
    }

    const blockCounts = new Uint32Array(UNICODE_BLOCKS.length);
    let sampleCount = 0;
    for (const cp of supported) {
      if (typeof cp !== 'number' || cp < 0) continue;
      const bIdx = getBlockIndexForCodepoint(cp);
      if (typeof bIdx === 'number' && bIdx >= 0 && bIdx < blockCounts.length) {
        blockCounts[bIdx]++;
      }
      sampleCount++;
      if (sampleCount >= 10000) break; // Sampling 10k glyphs is more than sufficient and executes in < 2ms
    }

    let bestIdx = -1;
    let maxCount = 0;
    let fallbackPuaIdx = -1;
    let maxPuaCount = 0;

    for (let i = 0; i < blockCounts.length; i++) {
      const bName = UNICODE_BLOCKS[i]?.name || '';
      const isPUA = bName.includes('Private Use') || bName.includes('PUA');
      if (isPUA) {
        if (blockCounts[i] > maxPuaCount) {
          maxPuaCount = blockCounts[i];
          fallbackPuaIdx = i;
        }
      } else {
        if (blockCounts[i] > maxCount) {
          maxCount = blockCounts[i];
          bestIdx = i;
        }
      }
    }

    if (bestIdx === -1 && fallbackPuaIdx !== -1) {
      bestIdx = fallbackPuaIdx;
      maxCount = maxPuaCount;
    }

    if (bestIdx !== -1 && maxCount > 0 && UNICODE_BLOCKS[bestIdx]) {
      const res = { index: bestIdx, name: UNICODE_BLOCKS[bestIdx].name, count: maxCount };
      if (cacheKey) bestBlockByFontIdCache.set(cacheKey, res);
      return res;
    }
    return null;
  };

  // When a new base font is activated, if current block has zero glyphs from it, auto-switch to a block that does!
  const prevBaseFontIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!baseFont) return;
    const supported = fontSupportedMap.get(baseFont.id);
    if (!supported || supported.size === 0) return;

    if (prevBaseFontIdRef.current === baseFont.id) return;
    prevBaseFontIdRef.current = baseFont.id;

    const currentBlock = UNICODE_BLOCKS[selectedBlockIndex];
    let currentBlockHasGlyphs = false;
    if (currentBlock && currentBlock.start >= 0) {
      for (const cp of supported) {
        if (cp >= currentBlock.start && cp <= currentBlock.end) {
          currentBlockHasGlyphs = true;
          break;
        }
      }
    }

    if (!currentBlockHasGlyphs) {
      const best = findBestBlockForSupported(baseFont.id, supported);
      if (best && best.index !== -1) {
        setSelectedBlockIndex(best.index);
      }
    }
  }, [baseFont?.id, fontSupportedMap, selectedBlockIndex, setSelectedBlockIndex]);

  const bestAlternativeBlock = useMemo(() => {
    if (!baseFont) return null;
    const supported = fontSupportedMap.get(baseFont.id);
    if (!supported || supported.size === 0) return null;
    const best = findBestBlockForSupported(baseFont.id, supported);
    if (best && best.index !== selectedBlockIndex && best.count > 0) {
      return best;
    }
    return null;
  }, [baseFont?.id, fontSupportedMap, selectedBlockIndex]);

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
    const isLargeBlock = (end - start) > 2500;

    if (isLargeBlock && !query) {
      // For ultra-large blocks (CJK, PUA), instantly collect supported glyphs via font sets (< 1ms)
      const supportedList: number[] = [];
      const supportedSet = new Set<number>();

      const activeFontIds = new Set<string>();
      if (baseFont?.id) activeFontIds.add(baseFont.id);
      for (const fid of Object.values(glyphMap)) {
        if (fid) activeFontIds.add(fid);
      }

      for (const fid of activeFontIds) {
        const supp = fontSupportedMap.get(fid);
        if (supp && supp.size > 0) {
          for (const cp of supp) {
            if (cp >= start && cp <= end && !supportedSet.has(cp)) {
              if (safeStringFromCodePoint(cp)) {
                supportedSet.add(cp);
                supportedList.push(cp);
                if (supportedList.length >= 2500) break;
              }
            }
          }
        }
        if (supportedList.length >= 2500) break;
      }

      if (!showEmpty) {
        supportedList.sort((a, b) => a - b);
        return supportedList;
      }

      // If showEmpty is true, include all supported glyphs + fill up to 2,500 with unmapped glyphs
      for (let i = 0; i < supportedList.length; i++) {
        chars.push(supportedList[i]);
      }
      for (let cp = start; cp <= end; cp++) {
        if (chars.length >= 2500) break;
        if (!supportedSet.has(cp) && safeStringFromCodePoint(cp)) {
          chars.push(cp);
        }
      }
      chars.sort((a, b) => a - b);
      return chars;
    }

    for (let cp = start; cp <= end; cp++) {
      if (chars.length >= 2500) break;
      const charStr = safeStringFromCodePoint(cp);
      let isMissing = false;
      
      const mappedId = glyphMap[cp];
      const displayFont = mappedId ? fontMap.get(mappedId) : baseFont;

      if (!charStr) {
        isMissing = true; // Surrogate or unrenderable
      } else if (isDuployanCodepoint(cp) && isDuployanUnassigned(cp)) {
        isMissing = true; // Unassigned in Unicode standard
      } else if (displayFont) {
        // Guaranteed instant O(1) set lookup (0ms CPU time)
        const supported = fontSupportedMap.get(displayFont.id);
        if (supported && supported.size > 0) {
          if (!supported.has(cp)) {
            isMissing = true;
          }
        } else if (displayFont.parsed || (displayFont.buffer && displayFont.buffer.byteLength > 0)) {
          // If supported set is empty but font is present, assume character can render rather than wiping the view
          isMissing = false;
        } else {
          isMissing = true;
        }
      } else {
        isMissing = true;
      }

      if (!charStr) continue; // Standard blocks skip unrenderables natively
      if (!showEmpty && isMissing) continue; // Standard blocks hide empty if toggled off

      if (query) {
        let match = false;
        
        // 2. Exact Literal Character Match (e.g., typing "A" or "!")
        if (!match && charStr && charStr.toLowerCase() === query) {
          match = true;
        }
        
        // 3. Duployan Character Name Match (e.g., "th", "sloan", "affix", "hook")
        if (!match && isDuployanCodepoint(cp) && DUPLOYAN_NAMES[cp]) {
          if (DUPLOYAN_NAMES[cp].toLowerCase().includes(query)) {
            match = true;
          }
        }

        // 4. Glyph Name Match (pure dictionary check, NEVER decompiles outlines)
        if (!match && displayFont?.parsed && charStr) {
          try {
            const glyphs = displayFont.parsed.glyphs?.glyphs;
            if (Array.isArray(glyphs)) {
              const gid = (displayFont.parsed.tables?.cmap?.glyphIndexMap as any)?.[cp] 
                || (displayFont.parsed.encoding as any)?.cmap?.glyphIndexMap?.[cp];
              if (gid !== undefined && glyphs[gid]?.name?.toLowerCase().includes(query)) {
                match = true;
              }
            }
          } catch (e) {}
        }
        
        // 5. Substring Hex Match ONLY if they didn't use a prefix, and it's >= 2 chars long.
        if (!match && query.length >= 2 && /^[0-9a-f]+$/i.test(query)) {
          const hex = cp.toString(16).toUpperCase().padStart(4, '0');
          if (hex.toLowerCase().includes(query)) match = true;
        }
        
        if (!match) continue;
      }

      chars.push(cp);
    }
    return chars;
  }, [block, showEmpty, baseFont, glyphMap, fontMap, fontSupportedMap, glyphSearchQuery]);

  // When block changes, clear selection
  useEffect(() => {
    setSelectedCharacters(new Set());
  }, [selectedBlockIndex, setSelectedCharacters]);

  // Autoscroll to exact codepoint
  useEffect(() => {
    const query = glyphSearchQuery.trim().toLowerCase();
    if (!query) return;

    const exactHexMatch = query.match(/^(u\+?|0x|\\u)0*([0-9a-f]+)$/i) || 
                          (query.length >= 4 && query.match(/^0*([0-9a-f]{2,6})$/i));
                          
    if (exactHexMatch) {
        const hexStr = exactHexMatch.length === 3 ? exactHexMatch[2] : exactHexMatch[1];
        const searchCp = parseInt(hexStr, 16);
        
        if (!isNaN(searchCp) && searchCp >= 0 && searchCp <= 0x10FFFF) {
            // First, ensure we are in the right block
            const targetBlockIndex = UNICODE_BLOCKS.findIndex(b => searchCp >= b.start && searchCp <= b.end);
            if (targetBlockIndex !== -1 && targetBlockIndex !== selectedBlockIndex) {
                setSearchQuery(''); // Clear block filter so it doesn't fight the block change!
                setSelectedBlockIndex(targetBlockIndex);
                return; // Wait for next render to get updated characters array
            }
            
            // We are in the right block. Find the character's index in the grid.
            const idx = characters.indexOf(searchCp);
            if (idx !== -1 && virtuosoRef.current) {
                // Highlight it by selecting it
                setSelectedCharacters(new Set([searchCp]));
                
                // Scroll to it! Use timeout to ensure grid has rendered the new layout if we just switched blocks
                setTimeout(() => {
                   virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
                }, 100);
            }
        }
    }
  }, [glyphSearchQuery, characters, selectedBlockIndex, setSelectedBlockIndex]);

  const touchPointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const touchStartTimeRef = useRef<number>(0);

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
    } else {
      // Touch/pen: track touch start position and timestamp for optimized sensitivity
      touchPointerStartRef.current = { x: e.clientX, y: e.clientY };
      touchStartTimeRef.current = Date.now();
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
      if (touchPointerStartRef.current) {
        const dx = Math.abs(e.clientX - touchPointerStartRef.current.x);
        const dy = Math.abs(e.clientY - touchPointerStartRef.current.y);
        const elapsed = Date.now() - touchStartTimeRef.current;
        touchPointerStartRef.current = null;
        // Optimized touch sensitivity: accommodate natural finger contact drift (up to 16px)
        // Only classify as a scroll gesture if dragged beyond 16px or held longer than 600ms while moving
        if ((dx > 16 || dy > 16) && elapsed > 150) return;
      }
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
  const headerRef = useRef<HTMLDivElement>(null);
  const toggleBarRef = useRef<HTMLDivElement>(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(z => Math.max(0.5, Math.min(z * (1 - e.deltaY * 0.01), 5)));
        return;
      }

      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'select' || activeTag === 'textarea') return;

      if (e.deltaY > 20) {
        setIsHeaderVisible(false);
      } else if (e.deltaY < -20) {
        setIsHeaderVisible(true);
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
      } else if (e.touches.length === 1) {
        touchStartYRef.current = e.touches[0].clientY;
        touchStartXRef.current = e.touches[0].clientX;
      }
    };
    
    const handleTouchMoveNative = (e: TouchEvent) => {
      if (e.touches.length === 2 && initDist > 0) {
        if (e.cancelable) e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        setZoom(Math.max(0.5, Math.min(initZoom * (dist / initDist), 5)));
      } else if (e.touches.length === 1 && touchStartYRef.current !== null) {
        const deltaY = e.touches[0].clientY - touchStartYRef.current;
        const deltaX = Math.abs(e.touches[0].clientX - (touchStartXRef.current || 0));

        if (Math.abs(deltaY) > 20 && Math.abs(deltaY) > deltaX) {
          const activeTag = document.activeElement?.tagName?.toLowerCase();
          if (activeTag !== 'input' && activeTag !== 'select' && activeTag !== 'textarea') {
            if (deltaY < -15) {
              setIsHeaderVisible(false);
              touchStartYRef.current = e.touches[0].clientY;
            } else if (deltaY > 15) {
              setIsHeaderVisible(true);
              touchStartYRef.current = e.touches[0].clientY;
            }
          }
        }
      }
    };

    const handleTouchEndNative = () => {
      touchStartYRef.current = null;
      touchStartXRef.current = null;
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    container.addEventListener('touchstart', handleTouchStartNative, { passive: true });
    container.addEventListener('touchmove', handleTouchMoveNative, { passive: false });
    container.addEventListener('touchend', handleTouchEndNative, { passive: true });

    const headerEl = headerRef.current;
    let headerTouchY: number | null = null;
    const onHeaderTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) headerTouchY = e.touches[0].clientY;
    };
    const onHeaderTouchMove = (e: TouchEvent) => {
      if (headerTouchY !== null && e.touches.length === 1) {
        const dy = e.touches[0].clientY - headerTouchY;
        if (dy < -20) {
          setIsHeaderVisible(false);
          headerTouchY = null;
        }
      }
    };
    if (headerEl) {
      headerEl.addEventListener('touchstart', onHeaderTouchStart, { passive: true });
      headerEl.addEventListener('touchmove', onHeaderTouchMove, { passive: true });
    }

    const toggleEl = toggleBarRef.current;
    let toggleTouchY: number | null = null;
    const onToggleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) toggleTouchY = e.touches[0].clientY;
    };
    const onToggleTouchMove = (e: TouchEvent) => {
      if (toggleTouchY !== null && e.touches.length === 1) {
        const dy = e.touches[0].clientY - toggleTouchY;
        if (dy < -15) {
          setIsHeaderVisible(false);
          toggleTouchY = null;
        } else if (dy > 15) {
          setIsHeaderVisible(true);
          toggleTouchY = null;
        }
      }
    };
    if (toggleEl) {
      toggleEl.addEventListener('touchstart', onToggleTouchStart, { passive: true });
      toggleEl.addEventListener('touchmove', onToggleTouchMove, { passive: true });
    }

    return () => {
      container.removeEventListener('wheel', handleWheelNative);
      container.removeEventListener('touchstart', handleTouchStartNative);
      container.removeEventListener('touchmove', handleTouchMoveNative);
      container.removeEventListener('touchend', handleTouchEndNative);
      if (headerEl) {
        headerEl.removeEventListener('touchstart', onHeaderTouchStart);
        headerEl.removeEventListener('touchmove', onHeaderTouchMove);
      }
      if (toggleEl) {
        toggleEl.removeEventListener('touchstart', onToggleTouchStart);
        toggleEl.removeEventListener('touchmove', onToggleTouchMove);
      }
    };
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (selectedCharacters.size === 0) return;

    setTraceModalFile(file);
    setIsTraceModalOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApplyTrace = async (options: TraceOptions) => {
    if (!traceModalFile || selectedCharacters.size === 0) return;

    setIsUploading(true);
    try {
      const newFont = await traceImageToFont(
        traceModalFile,
        traceModalFile.name,
        Array.from(selectedCharacters),
        options
      );
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
    } catch (err: any) {
      console.error(err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const hasMappedSelected = useMemo(() => {
    return Array.from(selectedCharacters).some(cp => !!glyphMap[cp]);
  }, [selectedCharacters, glyphMap]);

  const handleInvertSelectedGlyphs = async () => {
    const cpsToInvert = Array.from(selectedCharacters).filter(cp => !!glyphMap[cp]);
    if (cpsToInvert.length === 0) return;

    setIsUploading(true);
    try {
      for (const cp of cpsToInvert) {
        const fontId = glyphMap[cp];
        const font = fonts.find(f => f.id === fontId);
        if (font && font.file) {
          const invertedFont = await traceImageToFont(
            font.file,
            font.file.name,
            [cp],
            { invert: true }
          );
          invertedFont.isHidden = true;
          setFonts(prev => [...prev, invertedFont]);
          setGlyphMap(prev => ({
            ...prev,
            [cp]: invertedFont.id
          }));
        }
      }
    } catch (e: any) {
      console.warn('Failed to invert glyph:', e);
    } finally {
      setIsUploading(false);
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

  const clearRangeMappings = () => {
    if (selectedCharacters.size === 0) return;
    const arr = Array.from(selectedCharacters);
    let min = arr[0];
    let max = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
      if (arr[i] > max) max = arr[i];
    }
    setGlyphMap(prev => {
      const next = { ...prev };
      characters.forEach(cp => {
        if (cp >= min && cp <= max) {
          delete next[cp];
        }
      });
      selectedCharacters.forEach(cp => {
        delete next[cp];
      });
      return next;
    });
  };

  const clearSelectedMappings = () => {
    if (selectedCharacters.size === 0) return;
    setGlyphMap(prev => {
      const next = { ...prev };
      selectedCharacters.forEach(cp => {
        delete next[cp];
      });
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d0d0d] relative overflow-hidden">
      {/* Collapsible Header with Search, Dropdown, and All Buttons */}
      <div 
        ref={headerRef}
        className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden border-b border-white/5 bg-[#0d0d0d] shrink-0 z-20",
          isHeaderVisible 
            ? "max-h-[600px] opacity-100 translate-y-0" 
            : "max-h-0 opacity-0 -translate-y-2 pointer-events-none border-b-0"
        )}
      >
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

          <div className="flex flex-wrap gap-2 items-center">
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
                onClick={clearSelectedMappings}
                className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/30 text-[10px] uppercase font-bold rounded text-gray-300 hover:text-amber-400 transition-colors flex items-center gap-1.5"
                title="Clear mappings of selected characters only"
              >
                <Eraser className="w-3.5 h-3.5" /> Selected Clear Mappings
              </button>
            )}

            {selectedCharacters.size > 0 && (
              <button 
                onClick={clearRangeMappings}
                className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-[10px] uppercase font-bold rounded text-gray-300 hover:text-red-400 transition-colors flex items-center gap-1.5"
                title="Clear mappings for the selected range only"
              >
                <Trash2 className="w-3.5 h-3.5" /> Range Clear Mappings
              </button>
            )}
            
            {selectedCharacters.size > 0 && hasMappedSelected && (
              <button 
                onClick={handleInvertSelectedGlyphs}
                disabled={isUploading}
                className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-purple-500/10 border border-white/10 hover:border-purple-500/30 text-[10px] uppercase font-bold rounded text-gray-300 hover:text-purple-300 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                title="Invert black/white polarity of selected custom glyph(s)"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-purple-400" /> Invert Glyph
              </button>
            )}

            {selectedCharacters.size > 0 && (
              <button 
                onClick={() => setIsColorModalOpen(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 hover:from-purple-500 hover:to-pink-500 border border-purple-400 text-[10px] uppercase font-bold rounded text-white transition-all flex items-center gap-1.5 shadow-md shadow-purple-600/20"
                title="Colorize selected glyphs with SVG in OpenType, COLR, and CPAL/CAPL tables"
              >
                <Sparkles className="w-3.5 h-3.5" /> 
                Colorize Glyphs (SVG / COLR)
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
      </div>

      {/* Swipe handle / Toolbar Toggle bar */}
      <div 
        ref={toggleBarRef}
        onClick={() => setIsHeaderVisible(prev => !prev)}
        className="px-4 py-1.5 bg-[#141414] hover:bg-[#181818] border-b border-white/5 flex items-center justify-between text-[11px] text-gray-400 select-none z-10 shrink-0 cursor-pointer transition-colors group"
        title={isHeaderVisible ? "Swipe up or click to hide toolbar" : "Swipe down or click to show toolbar"}
      >
        <div className="flex items-center gap-2 overflow-hidden truncate">
          <span className="text-[11px] font-mono text-blue-400 font-semibold truncate">
            {block.name}
          </span>
          {block.start >= 0 && (
            <span className="text-[9px] font-mono text-gray-500 hidden sm:inline">
              (U+{block.start.toString(16).toUpperCase()} – U+{block.end.toString(16).toUpperCase()})
            </span>
          )}
          <span className="text-gray-600 hidden md:inline">•</span>
          <span className="text-[10px] text-gray-400 hidden md:inline">
            {characters.length} glyphs
          </span>
          <span className="text-gray-600 hidden sm:inline">•</span>
          <span className="text-[10px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 flex items-center gap-1" title="Total active glyph swaps across fonts">
            <strong className="text-blue-400 font-bold">{Object.keys(glyphMap).length}</strong> swaps
          </span>
          {selectedCharacters.size > 0 && (
            <span className="text-[10px] text-blue-400 font-semibold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
              {selectedCharacters.size} selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] uppercase tracking-wider font-mono text-gray-500 group-hover:text-gray-300 hidden sm:inline">
            {isHeaderVisible ? 'Swipe Up to Collapse' : 'Swipe Down to Expand'}
          </span>
          <div className="p-1 rounded bg-[#202020] text-gray-400 group-hover:text-white border border-white/10 transition-colors">
            {isHeaderVisible ? (
              <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
            )}
          </div>
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
          <div className="flex flex-col items-center justify-center h-full py-12 text-center text-gray-500 text-sm p-6 max-w-md mx-auto">
            <p className="font-semibold text-gray-300 mb-1">
              No glyphs found in "{block.name}" for {baseFont?.name || 'current base font'}.
            </p>
            <p className="text-xs text-gray-500 mb-5">
              This font doesn't contain characters in this Unicode block.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {bestAlternativeBlock && (
                <button
                  type="button"
                  onClick={() => setSelectedBlockIndex(bestAlternativeBlock.index)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase rounded-lg shadow-md transition-colors"
                >
                  Switch to {bestAlternativeBlock.name} ({bestAlternativeBlock.count} glyphs)
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowEmpty(true)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-200 text-xs font-semibold rounded-lg transition-colors border border-white/10"
              >
                Show All Unmapped Glyphs in {block.name}
              </button>
            </div>
          </div>
        ) : (
          <VirtuosoGrid
            ref={virtuosoRef}
            style={{ height: '100%', width: '100%' }}
            overscan={32}
            data={characters}
            listClassName="grid zoomable-grid gap-3 p-6 touch-pan-y touch-manipulation min-h-full"
            itemContent={(index, cp) => {
              try {
                const mappedFontId = glyphMap[cp];
                const displayFont = mappedFontId 
                  ? fontMap.get(mappedFontId) 
                  : baseFont;
                
                const isMapped = !!mappedFontId;
                const isSelected = selectedCharacters.has(cp);
                const colorMap = displayFont?.colorData?.codepointColorMap;
                const colorRecord = colorMap instanceof Map 
                  ? colorMap.get(cp) 
                  : (colorMap && typeof colorMap === 'object' ? (colorMap as any)[cp] : undefined);
                const hasColorGlyph = !!colorRecord;
                const isArabic = isArabicCodepoint(cp);
                const ligatureInfo = ARABIC_LIGATURE_INFO[cp];
                const joiningType = isArabic ? getArabicJoiningType(cp) : null;
                const isDuployan = isDuployanCodepoint(cp);
                const isDupControl = isDuployanControl(cp);
                const dupControlInfo = isDupControl ? getDuployanControlInfo(cp) : null;
                const isDupAffix = isDuployanAffixOrMark(cp);
                const isDupUnassigned = isDuployan && isDuployanUnassigned(cp);
                const isCombining = isCombiningMark(cp);

                const isCinnabar = isZnamennyCinnabarMark(cp);
                const isZnamennyComb = isZnamennyCombiningMark(cp);
                const isRedZnamenny = isZnamennyComb; // Both cinnabar and normal Znamenny combining marks are red

                let tooltipTitle = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
                if (isMapped && displayFont) tooltipTitle += ` (${displayFont.name})`;
                if (hasColorGlyph) {
                  const colorLabel = colorRecord?.layers?.[0]?.color ? ` [Color: ${colorRecord.layers[0].color}]` : ' [Color Font]';
                  tooltipTitle += colorRecord?.hasSVG ? ' [SVG in OpenType]' : colorLabel;
                }
                if (isCinnabar) tooltipTitle += ` [Znamenny Cinnabar Mark]`;
                else if (isZnamennyComb) tooltipTitle += ` [Znamenny Combining Mark]`;
                else if (isCombining) tooltipTitle += ` [Combining Mark]`;
                if (isDuployan && DUPLOYAN_NAMES[cp]) tooltipTitle += ` [${DUPLOYAN_NAMES[cp]}]`;
                else if (ligatureInfo) tooltipTitle += ` [${ligatureInfo.name}]`;
                else if (joiningType) {
                  const typeNames: Record<string, string> = {
                    'D': 'Dual Joining',
                    'R': 'Right Joining',
                    'L': 'Left Joining',
                    'U': 'Non-Joining',
                    'C': 'Join-Causing (Tatweel/ZWJ)',
                    'T': 'Transparent (Harakat)'
                  };
                  tooltipTitle += ` [${typeNames[joiningType] || joiningType}]`;
                }

                return (
                  <div 
                    key={cp}
                    onPointerDown={(e) => handlePointerDown(e, cp)}
                    onPointerEnter={(e) => handlePointerEnter(e, cp)}
                    onPointerUp={(e) => handlePointerUpItem(e, cp)}
                    className={cn(
                      "group relative flex flex-col items-center justify-center aspect-square rounded-sm border cursor-pointer select-none transition-all touch-manipulation active:scale-95",
                      isSelected 
                        ? "bg-blue-500/20 border-blue-400 shadow-[inset_0_0_15px_rgba(59,130,246,0.2)]" 
                        : isMapped
                          ? "bg-white/5 border-white/20"
                          : "bg-[#1a1a1a] border-white/5 hover:border-white/30"
                    )}
                    style={{
                      borderColor: isSelected ? undefined : (isMapped && displayFont ? displayFont.color : undefined),
                    }}
                    title={tooltipTitle}
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

                    {hasColorGlyph && (
                      <span 
                        className="absolute top-1 left-1 text-[7.5px] font-mono font-bold leading-none px-1 py-0.5 rounded bg-purple-500/30 text-purple-300 border border-purple-500/40 pointer-events-none"
                        title={colorRecord?.hasSVG ? "SVG in OpenType" : "COLR / CPAL Layer"}
                      >
                        {colorRecord?.hasSVG ? 'SVG' : 'COLR'}
                      </span>
                    )}

                    {isArabic && (
                      <span 
                        className="absolute top-1 left-1 text-[8px] font-mono leading-none opacity-40 group-hover:opacity-100 text-amber-400/80 pointer-events-none"
                        title={joiningType === 'C' ? 'Tatweel / Join Causing' : ligatureInfo ? ligatureInfo.type : joiningType === 'D' ? 'Dual' : joiningType === 'R' ? 'Right' : ''}
                      >
                        {cp === 0x0640 ? 'ـ' : ligatureInfo?.type === 'Ligature' ? 'L' : joiningType === 'D' ? 'ـ' : joiningType === 'R' ? 'ر' : ''}
                      </span>
                    )}

                    {isDupControl && (
                      <span 
                        className="absolute top-1 left-1 text-[8px] font-mono leading-none opacity-70 group-hover:opacity-100 text-purple-400 pointer-events-none"
                        title={dupControlInfo?.name}
                      >
                        CTL
                      </span>
                    )}

                    {isDupAffix && (
                      <span 
                        className="absolute top-1 left-1 text-[8px] font-mono leading-none opacity-50 group-hover:opacity-100 text-cyan-400/80 pointer-events-none"
                        title="Duployan Affix / Combining Mark"
                      >
                        AFX
                      </span>
                    )}
                    
                    {colorRecord?.svgDocument && !isCombining && !isDupAffix ? (
                      <div className="flex-1 w-full h-full flex items-center justify-center p-1 pointer-events-none overflow-hidden">
                        <div 
                          className="w-6 h-6 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:object-contain"
                          dangerouslySetInnerHTML={{ __html: colorRecord.svgDocument }}
                        />
                      </div>
                    ) : (
                      <span 
                        className="flex-1 w-full flex items-center justify-center text-2xl leading-none overflow-hidden select-none min-h-0" 
                        style={{ 
                          fontFamily: `${displayFont?.fontFamilyName ? `"${displayFont.fontFamilyName}", ` : ''}'Noto Sans Duployan', 'Noto Znamenny Musical Notation', sans-serif`,
                          color: hasColorGlyph && colorRecord?.layers?.[0]?.color && colorRecord.layers[0].color !== 'currentColor'
                            ? colorRecord.layers[0].color 
                            : (isRedZnamenny ? '#ef4444' : (isMapped ? '#e5e5e5' : '#888'))
                        }}
                      >
                        {isDupControl ? (
                          <div className="flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xl font-mono text-purple-400 font-bold leading-tight">
                              {dupControlInfo?.symbol}
                            </span>
                            <span className="text-[7.5px] font-mono text-purple-300/80 uppercase tracking-tighter leading-none mt-0.5">
                              {dupControlInfo?.label}
                            </span>
                          </div>
                        ) : (isCombining || isDupAffix) ? (
                          <span className="relative inline-flex items-center justify-center pointer-events-none min-w-[1.3em] overflow-visible">
                            <span className="opacity-30 text-gray-400 font-sans text-xl absolute select-none pointer-events-none">◌</span>
                            <span 
                              className="relative z-10" 
                              style={{ 
                                color: (hasColorGlyph && colorRecord?.layers?.[0]?.color && colorRecord.layers[0].color !== 'currentColor')
                                  ? colorRecord.layers[0].color
                                  : (isRedZnamenny ? '#ef4444' : (isMapped ? '#e5e5e5' : '#888'))
                              }}
                            >
                              {safeStringFromCodePoint(cp)}
                            </span>
                          </span>
                        ) : isDupUnassigned ? (
                          <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span>
                        ) : (block?.name === 'Forgotten Characters' && cp !== 0xFFFD && cp !== 0x0020) ? (
                           <div className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500 opacity-50 min-w-[12px] min-h-[12px] flex items-center justify-center">
                             {safeStringFromCodePoint(cp)}
                           </div>
                        ) : safeStringFromCodePoint(cp) || <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span>}
                      </span>
                    )}
                    <span className={cn(
                      "text-[9px] font-mono leading-none pb-0.5 shrink-0",
                      isMapped ? "text-blue-400/70" : "text-gray-600"
                    )}>
                      {cp.toString(16).toUpperCase().padStart(4, '0')}
                    </span>
                  </div>
                );
              } catch (renderCellErr) {
                return (
                  <div key={cp} className="flex flex-col items-center justify-center aspect-square rounded-sm border border-white/5 bg-[#1a1a1a] text-gray-500 text-[10px] select-none p-1">
                    <span>.notdef</span>
                    <span className="text-[9px] font-mono text-gray-600">{typeof cp === 'number' ? cp.toString(16).toUpperCase().padStart(4, '0') : ''}</span>
                  </div>
                );
              }
            }}
          />
        )}
      </div>

      <ImageTraceModal 
        isOpen={isTraceModalOpen}
        file={traceModalFile}
        targetCodePoints={Array.from(selectedCharacters)}
        onClose={() => {
          setIsTraceModalOpen(false);
          setTraceModalFile(null);
        }}
        onApply={handleApplyTrace}
      />

      <ColorGlyphModal
        isOpen={isColorModalOpen}
        onClose={() => setIsColorModalOpen(false)}
        selectedCharacters={selectedCharacters}
        fonts={fonts}
        setFonts={setFonts}
        onApplyColorFont={(newFont) => {
          setGlyphMap(prev => {
            const next = { ...prev };
            for (const cp of selectedCharacters) {
              next[cp] = newFont.id;
            }
            return next;
          });
          setSelectedCharacters(new Set());
        }}
      />
    </div>
  );
}
