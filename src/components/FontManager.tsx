import React, { useRef } from 'react';
import { Upload, X, Check, Star, ArrowUpDown } from 'lucide-react';
import { useState } from 'react';
import type { UploadedFont, GlyphMapping } from '../types';
import { parseFont, traceImageToFont } from '../lib/fontUtils';
import { cn } from '../lib/utils';

interface FontManagerProps {
  fonts: UploadedFont[];
  setFonts: React.Dispatch<React.SetStateAction<UploadedFont[]>>;
  onApplyFont: (fontId: string) => void;
  hasSelection: boolean;
  setGlyphMap?: React.Dispatch<React.SetStateAction<GlyphMapping>>;
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444'
];

export function FontManager({ fonts, setFonts, onApplyFont, hasSelection, setGlyphMap }: FontManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [movingFontId, setMovingFontId] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFonts: UploadedFont[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        let ttfFile = file;
        
        if (file.name.match(/\.ttc$/i)) {
          const formData = new FormData();
          formData.append('font', file);
          const response = await fetch('/api/unpack-ttc', { method: 'POST', body: formData });
          if (!response.ok) throw new Error('Failed to unpack TTC');
          const blob = await response.blob();
          ttfFile = new File([blob], file.name.replace(/\.ttc$/i, '.ttf'), { type: 'font/ttf' });
        } else if (file.name.match(/\.(png|jpe?g|svg)$/i)) {
          const newFont = await traceImageToFont(file, file.name, [65]);
          newFonts.push(newFont);
          continue;
        }
        
        const parsed = await parseFont(ttfFile);
        const id = crypto.randomUUID();
        const fontFamilyName = `FontFuser_${id}`;
        
        // Inject @font-face
        const buffer = await ttfFile.arrayBuffer();
        const fontFace = new FontFace(fontFamilyName, buffer);
        try { await fontFace.load(); } catch (e) { console.warn(e); }
        document.fonts.add(fontFace);
        
        // Check for metadata
        let parsedGlyphMap = null;
        try {
           let metaStr = null;
           if ((parsed.names as any)?.unicode?.description?.en) metaStr = (parsed.names as any).unicode.description.en;
           else if ((parsed.names as any)?.macintosh?.description?.en) metaStr = (parsed.names as any).macintosh.description.en;
           else if ((parsed.names as any)?.windows?.description?.en) metaStr = (parsed.names as any).windows.description.en;
           
           if (metaStr) {
             const meta = JSON.parse(metaStr);
             if (meta.glyphMap) parsedGlyphMap = meta.glyphMap;
           }
        } catch(e) {}
        
        if (parsedGlyphMap && setGlyphMap) {
           setGlyphMap(prev => {
              const next = { ...prev };
              for (const cp of Object.keys(parsedGlyphMap)) {
                 next[Number(cp)] = id;
              }
              return next;
           });
        }
        
        newFonts.push({
          id,
          name: parsed.names.fontFamily?.en || ttfFile.name.split('.')[0],
          fileName: ttfFile.name,
          file: ttfFile,
          
          fontFamilyName,
          color: COLORS[(fonts.length + i) % COLORS.length]
        });
      } catch (err) {
        console.error("Failed to parse font:", file.name, err);
        alert(`Failed to parse ${file.name}. Ensure it's a valid font file.`);
      }
    }
    
    setFonts(prev => [...newFonts, ...prev]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFont = (id: string) => {
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
    <div className="flex flex-col w-full md:w-64 bg-[#111111] border-b md:border-b-0 md:border-r border-white/5 shrink-0 max-h-[40vh] md:max-h-none overflow-y-auto">
      <div className="p-4 border-b border-white/5">
        <h2 className="text-[10px] uppercase text-gray-500 font-bold tracking-widest mb-3">
          Loaded Font Files
        </h2>
        
        <div className="flex flex-col gap-2">
          {fonts.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No fonts added yet.</p>
          ) : (
            <>
              {fonts.filter(f => !f.isHidden).map((font, idx) => (
                <React.Fragment key={font.id}>
                  <div 
                    onClick={() => {
                      if (movingFontId) {
                        if (movingFontId === font.id) {
                          setMovingFontId(null);
                        } else {
                          handleMove(font.id);
                        }
                      } else {
                        onApplyFont(font.id);
                      }
                    }}
                    className={cn("relative flex flex-col p-2 rounded border cursor-pointer transition-all bg-[#1a1a1a] hover:bg-[#222]", movingFontId === font.id ? "border-blue-500 ring-1 ring-blue-500" : "border-white/5 hover:border-white/20")}
                    title="Click to apply to selected characters"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex flex-col overflow-hidden w-full pr-12">
                        <span className="text-xs font-medium truncate text-gray-200" title={font.name}>
                          {font.name}
                        </span>
                        <span className="text-[9px] text-gray-500 uppercase truncate" title={font.fileName}>{font.fileName}</span>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 z-10">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setMovingFontId(movingFontId === font.id ? null : font.id); }}
                          className={cn("p-1 rounded transition-colors", movingFontId === font.id ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-white hover:bg-white/5")}
                          title="Move font"
                        >
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeFont(font.id); }}
                          className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-white/5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-2">
                      <div 
                        className="w-2.5 h-2.5 rounded-full shadow-sm"
                        style={{ backgroundColor: font.color }}
                      />
                      <span className="text-[9px] uppercase font-bold text-gray-400 flex items-center gap-1">
                        Click to apply to category
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <input
            type="file"
            multiple
            
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1a1a1a] border border-white/5 hover:bg-white/5 hover:border-white/20 text-gray-300 text-xs font-bold uppercase rounded transition-colors"
          >
            <Upload className="w-4 h-4" />
            Select Multiple Fonts
          </button>
        </div>
      </div>
    </div>
  );

}
