import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, FolderOpen, Download, Upload, Plus, FileType, FileDown, Loader2 } from 'lucide-react';
import { generateFusedFont, downloadArrayBuffer } from '../lib/fontUtils';
import { getFusionsList, saveNamedFusion, loadNamedFusion, deleteNamedFusion, registerFontBuffer, type FusionSaveInfo } from '../lib/workspace';
import { exportFusionWorkspace, importFusionWorkspace } from '../lib/exportUtils';
import type { UploadedFont, GlyphMapping } from '../types';
import { cn } from '../lib/utils';
import { ErrorBoundary } from './ErrorBoundary';

interface SavesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFonts: UploadedFont[];
  currentGlyphMap: GlyphMapping;
  currentProjectName: string;
  onLoad: (fonts: UploadedFont[], glyphMap: GlyphMapping, name: string) => void;
  onNewProject: (name: string) => void;
  onSaveCurrent: (name: string) => void;
  onRenameCurrent: (name: string) => void;
}


function RenameInput({ initialValue, onSave, isLoading, onRename }: { initialValue: string, onSave: (name: string) => void, isLoading: boolean, onRename: (name: string) => void }) {
  const [val, setVal] = useState(initialValue);
  useEffect(() => { setVal(initialValue); }, [initialValue]);
  
  return (
    <input 
      type="text" 
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onRename(val)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSave(val); }}
      className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-blue-500 transition-colors w-full"
      placeholder="Name your project..."
    />
  );
}

function formatProjectDate(timestamp: any): string {
  try {
    const d = new Date(Number(timestamp) || Date.now());
    if (isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}

export function SavesModal({ isOpen, onClose, currentFonts, currentGlyphMap, currentProjectName, onLoad, onNewProject, onSaveCurrent, onRenameCurrent }: SavesModalProps) {
  const [fusions, setFusions] = useState<FusionSaveInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'error' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loadingFusionId, setLoadingFusionId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNotification(null);
      loadList();
    } else {
      setLoadingFusionId(null);
    }
  }, [isOpen]);

  const loadList = async () => {
    try {
      const list = await getFusionsList();
      const valid = Array.isArray(list) ? list.filter(f => f && f.id) : [];
      valid.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
      setFusions(valid);
    } catch (err) {
      console.error('Failed to load projects list', err);
      setFusions([]);
    }
  };

  const handleCreateNew = () => {
    onNewProject("New Spinoff Project");
    // We do not close the modal, so the user can immediately rename it in the text box below.
  };

  const handleSaveCurrent = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (currentFonts.length === 0) {
      setNotification({ text: "Add fonts to your workspace before saving.", type: 'info' });
      return;
    }
    setIsLoading(true);
    setNotification(null);
    try {
      await onSaveCurrent(currentProjectName);
      await loadList();
    } catch (err: any) {
      setNotification({ text: "Failed to save: " + (err.message || "Storage limit exceeded. Try deleting old saves."), type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportWorkspace = async (fusion: FusionSaveInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    setNotification(null);
    try {
      const data = await loadNamedFusion(fusion.id);
      if (data) {
        await exportFusionWorkspace(fusion.name, data.fonts, data.glyphMap);
      }
    } catch (err: any) {
      setNotification({ text: "Failed to export: " + err.message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadTTF = async (fusion: FusionSaveInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    setNotification(null);
    const progressEl = document.getElementById('modal-progress-' + fusion.id);
    if (progressEl) progressEl.innerText = "Initializing generator...";
    try {
      const data = await loadNamedFusion(fusion.id);
      if (data && data.fonts && data.fonts.length > 0) {
        const baseFont = data.fonts[0];
        const arrayBuffer = await generateFusedFont(baseFont, data.fonts, data.glyphMap, (msg) => {
           if (progressEl) progressEl.innerText = msg;
        });
        const baseName = (fusion.name || 'FusedFont').replace(/\.(otf|ttf|woff|woff2)$/i, '').trim() || 'FusedFont';
        const downloadName = `${baseName}.otf`;
        const directUrl = (arrayBuffer as any).downloadUrl;
        downloadArrayBuffer(arrayBuffer, downloadName, directUrl);
        if (progressEl) progressEl.innerText = "Downloaded to your files!";
      } else {
        setNotification({ text: "No fonts saved in this project to generate.", type: 'info' });
        if (progressEl) progressEl.innerText = "";
      }
    } catch (err: any) {
      fetch('/api/log-error', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: "Modal Generator Crash: " + (err.message || String(err)), stack: err.stack }) }).catch(()=>console.log(err));
      let msg = err.message || String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = 'Connection interrupted during upload or fusion. Please try again.';
      }
      setNotification({ text: "Failed to generate font: " + msg, type: 'error' });
      if (progressEl) progressEl.innerText = "Error: " + msg;
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        const p = document.getElementById('modal-progress-' + fusion.id);
        if (p) p.innerText = "";
      }, 3000);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    setNotification(null);
    try {
      const data = await importFusionWorkspace(file);
      onLoad(data.fonts, data.glyphMap, data.name);
      onClose();
    } catch (err: any) {
      setNotification({ text: "Failed to import project file: " + err.message, type: 'error' });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLoad = async (fusion: FusionSaveInfo) => {
    if (loadingFusionId) return;
    setLoadingFusionId(fusion.id);
    setIsLoading(true);
    setNotification(null);
    try {
      if (currentFonts && Array.isArray(currentFonts)) {
        currentFonts.forEach(f => {
          if (f.buffer) registerFontBuffer(f.id, f.name, f.fileName, f.buffer);
        });
      }
      const data = await loadNamedFusion(fusion.id);
      if (data) {
        onLoad(data.fonts, data.glyphMap, fusion.name);
        onClose();
      } else {
        setNotification({ text: "Project loaded with empty fonts.", type: 'info' });
      }
    } catch (err: any) {
      console.error('Failed to load project:', err);
      setNotification({ text: 'Failed to load project: ' + (err.message || String(err)), type: 'error' });
    } finally {
      setIsLoading(false);
      setLoadingFusionId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to delete this fusion project?')) return;
    setIsLoading(true);
    await deleteNamedFusion(id);
    await loadList();
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111111] border border-white/10 rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
          <h2 className="text-white font-bold text-lg uppercase tracking-widest flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-500" /> Fusion Projects
          </h2>
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              accept=".fuser,.json" 
              onChange={handleImportFile} 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-[10px] font-bold uppercase tracking-wider rounded transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" /> Import File
            </button>
            <button onClick={onClose} className="p-1 text-gray-500 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {notification && (
          <div className={`px-4 py-2.5 text-xs font-mono flex items-center justify-between border-b ${
            notification.type === 'error' ? 'bg-red-950/40 border-red-500/30 text-red-300' : 'bg-blue-950/40 border-blue-500/30 text-blue-300'
          }`}>
            <span>{notification.text}</span>
            <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-white ml-2">×</button>
          </div>
        )}

        <div className="overflow-y-auto p-6 flex-1 bg-[#0d0d0d]">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Create New Project Card */}
            <div 
              onClick={handleCreateNew}
              className="aspect-video bg-white/5 border border-dashed border-white/20 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/10 hover:border-white/40 transition-all text-gray-400 hover:text-white group"
            >
              <div className="w-10 h-10 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">New Project</span>
            </div>

            {/* Saved Projects */}
            {fusions.filter(f => f && f.id).map(fusion => {
              const isOpening = loadingFusionId === fusion.id;
              const formattedDate = formatProjectDate(fusion.timestamp);
              return (
                <div 
                  key={fusion.id} 
                  onClick={() => !isLoading && handleLoad(fusion)}
                  className={cn(
                    "aspect-video bg-[#1a1a1a] border rounded-lg p-4 flex flex-col justify-between cursor-pointer transition-all group relative overflow-hidden",
                    isOpening 
                      ? "border-blue-400 bg-blue-950/30 shadow-[0_0_20px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/50" 
                      : "border-white/5 hover:border-blue-500/50 hover:bg-[#222]"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200 line-clamp-2 leading-tight">{fusion.name || 'Untitled Fusion'}</span>
                    <span className="text-[10px] text-gray-500 mt-1">{formattedDate}</span>
                    <span id={`modal-progress-${fusion.id}`} className="text-[10px] text-blue-400 font-mono mt-2 min-h-[14px]"></span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4">
                    {isOpening ? (
                      <span className="text-[10px] font-mono text-amber-400 uppercase flex items-center gap-1.5 font-bold animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> Opening...
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-blue-400 uppercase font-semibold group-hover:text-blue-300 group-hover:underline">
                        Click to Edit
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-100" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={(e) => handleExportWorkspace(fusion, e)}
                        disabled={isLoading}
                        className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-900/30 rounded transition-colors"
                        title="Export Project Save File (.fuser)"
                      >
                        <FileDown className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDownloadTTF(fusion, e)}
                        disabled={isLoading}
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                        title="Compile & Download Fused Font (.otf/.ttf)"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(fusion.id, e)}
                        disabled={isLoading}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Active indicator if names match roughly or just visual flair */}
                  {currentProjectName === fusion.name && (
                    <div className="absolute top-0 right-0 w-12 h-12 bg-blue-600/20 transform rotate-45 translate-x-6 -translate-y-6 flex items-end justify-center pb-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Footer actions */}
        <div className="p-4 border-t border-white/5 bg-[#111111] shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-col flex-1 w-full sm:max-w-md">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Current Project Name</span>
              <RenameInput 
                initialValue={currentProjectName} 
                onRename={onRenameCurrent}
                onSave={async (val) => {
                  if (val !== currentProjectName) onRenameCurrent(val);
                  if (currentFonts.length === 0) {
                    setNotification({ text: "Add fonts to your workspace before saving.", type: 'info' });
                    return;
                  }
                  setIsLoading(true);
                  setNotification(null);
                  try {
                    await onSaveCurrent(val);
                    await loadList();
                  } catch (err: any) {
                    setNotification({ text: "Failed to save: " + (err.message || "Error"), type: 'error' });
                  } finally {
                    setIsLoading(false);
                  }
                }}
                isLoading={isLoading} 
              />
            </div>
            <button 
              onClick={() => handleSaveCurrent()}
              disabled={isLoading || currentFonts.length === 0}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center shadow-lg"
            >
              <Save className="w-4 h-4" /> Save Snapshot
            </button>
        </div>
      </div>
    </div>
  );
}
