import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, FolderOpen } from 'lucide-react';
import { getFusionsList, saveNamedFusion, loadNamedFusion, deleteNamedFusion, type FusionSaveInfo } from '../lib/workspace';
import type { UploadedFont, GlyphMapping } from '../types';

interface SavesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFonts: UploadedFont[];
  currentGlyphMap: GlyphMapping;
  onLoad: (fonts: UploadedFont[], glyphMap: GlyphMapping) => void;
}

export function SavesModal({ isOpen, onClose, currentFonts, currentGlyphMap, onLoad }: SavesModalProps) {
  const [fusions, setFusions] = useState<FusionSaveInfo[]>([]);
  const [newName, setNewName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadList();
    }
  }, [isOpen]);

  const loadList = async () => {
    const list = await getFusionsList();
    // Sort descending by timestamp
    setFusions(list.sort((a, b) => b.timestamp - a.timestamp));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || currentFonts.length === 0) return;
    
    setIsLoading(true);
    try {
      await saveNamedFusion(newName.trim(), currentFonts, currentGlyphMap);
      setNewName('');
      await loadList();
    } catch (err: any) {
      alert("Failed to save: " + (err.message || "Storage limit exceeded. Try deleting old saves."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = async (id: string) => {
    setIsLoading(true);
    const data = await loadNamedFusion(id);
    if (data) {
      onLoad(data.fonts, data.glyphMap);
      onClose();
    }
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fusion?')) return;
    setIsLoading(true);
    await deleteNamedFusion(id);
    await loadList();
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111111] border border-white/10 rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-500" /> Fusion Saves
          </h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-white/5 shrink-0 bg-[#0d0d0d]">
          <form onSubmit={handleSave} className="flex gap-2">
            <input 
              type="text" 
              placeholder="Name your fusion..." 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              disabled={isLoading || currentFonts.length === 0}
            />
            <button 
              type="submit"
              disabled={!newName.trim() || isLoading || currentFonts.length === 0}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </form>
          {currentFonts.length === 0 && (
            <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-wide">
              Add fonts to your workspace before saving.
            </p>
          )}
        </div>

        <div className="overflow-y-auto p-4 flex-1 flex flex-col gap-2 min-h-[200px]">
          {fusions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
              No saved fusions yet.
            </div>
          ) : (
            fusions.map(fusion => (
              <div key={fusion.id} onClick={() => handleLoad(fusion.id)} className="flex items-center justify-between p-3 bg-[#1a1a1a] border border-white/5 rounded group hover:border-white/20 hover:bg-[#222] cursor-pointer transition-colors">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-200">{fusion.name}</span>
                  <span className="text-[10px] text-gray-500">{new Date(fusion.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
  onClick={(e) => { e.stopPropagation(); handleLoad(fusion.id); }} 
  disabled={isLoading}
  className="px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-[10px] font-bold uppercase rounded transition-colors"
>
  Load
</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(fusion.id); }}
                    disabled={isLoading}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
