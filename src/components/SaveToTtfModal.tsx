import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, FileCheck, Zap, Download, Loader2, AlertCircle, CheckCircle2, ChevronRight, FolderArchive, ArrowRight } from 'lucide-react';
import { getFusionsList, type FusionSaveInfo } from '../lib/workspace';
import { parseSaveFile, loadRawProjectSave, convertSaveToTtf, type ParsedSaveData, type SaveFileStats } from '../lib/saveConverter';

interface SaveToTtfModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProjectId?: string;
  initialProjectName?: string;
}

export const SaveToTtfModal: React.FC<SaveToTtfModalProps> = ({
  isOpen,
  onClose,
  initialProjectId,
  initialProjectName
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'saved'>('upload');
  const [savedProjects, setSavedProjects] = useState<FusionSaveInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  
  const [parsedData, setParsedData] = useState<ParsedSaveData | null>(null);
  const [customFilename, setCustomFilename] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedResult, setCompletedResult] = useState<{ filename: string; downloadUrl: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Load saved projects list when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSavedProjects();
      if (initialProjectId) {
        setActiveTab('saved');
        setSelectedProjectId(initialProjectId);
        handleSelectSavedProject(initialProjectId);
      }
    } else {
      // Reset state on close
      setParsedData(null);
      setErrorMessage(null);
      setCompletedResult(null);
      setProgressPercent(0);
      setProgressMessage('');
      setIsConverting(false);
    }
  }, [isOpen, initialProjectId]);

  const loadSavedProjects = async () => {
    try {
      const list = await getFusionsList();
      setSavedProjects(list);
    } catch (e) {
      console.warn('Failed to load saved projects for converter:', e);
    }
  };

  const handleFileChange = async (file: File) => {
    if (!file) return;
    setIsParsing(true);
    setErrorMessage(null);
    setCompletedResult(null);

    try {
      const parsed = await parseSaveFile(file);
      setParsedData(parsed);
      setCustomFilename(parsed.name || 'FusedFont');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to read save file.');
      setParsedData(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSelectSavedProject = async (projectId: string) => {
    if (!projectId) return;
    setSelectedProjectId(projectId);
    setIsParsing(true);
    setErrorMessage(null);
    setCompletedResult(null);

    try {
      const target = savedProjects.find(p => p.id === projectId);
      const parsed = await loadRawProjectSave(projectId, target?.storageKey);
      setParsedData(parsed);
      setCustomFilename(parsed.name || target?.name || 'FusedFont');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load project save data.');
      setParsedData(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleStartConversion = async () => {
    if (!parsedData) return;
    setIsConverting(true);
    setErrorMessage(null);
    setCompletedResult(null);
    setProgressPercent(5);
    setProgressMessage('Initializing fast save converter...');

    try {
      const targetName = (customFilename.trim() || parsedData.name || 'FusedFont')
        .replace(/\.(fuser|json|ttf|otf)$/i, '');

      const result = await convertSaveToTtf(
        parsedData,
        (pct, msg) => {
          setProgressPercent(pct);
          setProgressMessage(msg);
        },
        targetName
      );

      setCompletedResult(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to convert save file to TTF font.');
    } finally {
      setIsConverting(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileChange(files[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-md shadow-emerald-500/20 text-white font-bold">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base tracking-tight flex items-center gap-2">
                Save File to TTF Converter
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold">
                  Fast Fusion
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Directly extracts fused glyphs and needed fonts from your save file into a .ttf font
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isConverting}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-white/5 bg-[#0e0e0e] px-5 pt-3">
          <button
            onClick={() => { setActiveTab('upload'); setErrorMessage(null); }}
            disabled={isConverting}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${
              activeTab === 'upload' 
                ? 'text-emerald-400 border-b-2 border-emerald-500' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Save File (.fuser / .json)
          </button>
          <button
            onClick={() => { setActiveTab('saved'); setErrorMessage(null); }}
            disabled={isConverting}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${
              activeTab === 'saved' 
                ? 'text-emerald-400 border-b-2 border-emerald-500' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <FolderArchive className="w-4 h-4" />
            Select Saved Project ({savedProjects.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-[#121212]">
          
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-red-950/60 border border-red-500/40 rounded-lg text-red-200 text-xs flex items-start gap-3 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-mono">{errorMessage}</div>
              <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">×</button>
            </div>
          )}

          {/* Tab 1: Upload File */}
          {activeTab === 'upload' && !parsedData && (
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept=".fuser,.json"
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                className="hidden"
              />
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragging 
                    ? 'border-emerald-400 bg-emerald-950/20 shadow-lg scale-[1.01]' 
                    : 'border-white/10 hover:border-emerald-500/40 hover:bg-white/[0.02]'
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-semibold text-gray-200">
                  Drop your .fuser or .json save file here
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  Or click to browse from your device. The converter reads the fused glyphs directly from the save.
                </p>
                <div className="mt-4 px-3 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-gray-400">
                  Accepts .fuser and .json project saves
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Saved Projects Picker */}
          {activeTab === 'saved' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Select an existing project:
              </label>
              {savedProjects.length === 0 ? (
                <div className="p-6 bg-white/5 border border-white/10 rounded-xl text-center text-gray-400 text-xs">
                  No saved projects found in this browser. Try uploading a .fuser file!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {savedProjects.map((p) => {
                    const isSelected = selectedProjectId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectSavedProject(p.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected 
                            ? 'bg-emerald-950/30 border-emerald-500/80 text-white shadow-sm' 
                            : 'bg-[#181818] border-white/5 hover:border-white/20 text-gray-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold truncate">{p.name || 'Untitled Fusion'}</p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                            {new Date(p.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="p-6 bg-[#161616] border border-white/10 rounded-xl flex items-center justify-center gap-3 text-xs text-gray-300 font-mono">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Analyzing save file structure & mapped glyphs...</span>
            </div>
          )}

          {/* Parsed Save Details & Converter Confirmation */}
          {parsedData && !isParsing && (
            <div className="bg-[#181818] border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                    Save File Ready to Convert
                  </span>
                </div>
                <button
                  onClick={() => { setParsedData(null); setSelectedProjectId(''); setCompletedResult(null); }}
                  className="text-[11px] text-gray-400 hover:text-white underline font-mono"
                >
                  Change File
                </button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[#111111] rounded-lg border border-white/5">
                  <div className="text-[10px] uppercase font-mono text-gray-500">Base Font</div>
                  <div className="text-xs font-bold text-gray-200 truncate mt-1" title={parsedData.stats.baseFontName}>
                    {parsedData.stats.baseFontName}
                  </div>
                </div>

                <div className="p-3 bg-[#111111] rounded-lg border border-white/5">
                  <div className="text-[10px] uppercase font-mono text-gray-500">Fused Glyphs</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1 font-mono">
                    {parsedData.stats.mappedGlyphsCount} swaps
                  </div>
                </div>

                <div className="p-3 bg-[#111111] rounded-lg border border-white/5">
                  <div className="text-[10px] uppercase font-mono text-gray-500">Needed Fonts</div>
                  <div className="text-xs font-bold text-blue-400 mt-1 font-mono">
                    {parsedData.stats.neededFontsCount} / {parsedData.stats.totalFonts}
                  </div>
                </div>

                <div className="p-3 bg-[#111111] rounded-lg border border-white/5">
                  <div className="text-[10px] uppercase font-mono text-gray-500">Output Format</div>
                  <div className="text-xs font-bold text-white mt-1 font-mono">
                    .TTF Font
                  </div>
                </div>
              </div>

              {/* Fast Fusion optimization note */}
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Fast Direct Fusion:</strong> Omits {Math.max(0, parsedData.stats.totalFonts - parsedData.stats.neededFontsCount)} unused fonts and bypasses manual workspace rendering to output your TTF in seconds.
                </span>
              </div>

              {/* Output Name input */}
              <div>
                <label className="block text-[11px] font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                  Output Font Filename:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    disabled={isConverting}
                    className="flex-1 bg-[#101010] border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                    placeholder="FusedFont"
                  />
                  <span className="text-xs font-mono text-gray-500">.ttf</span>
                </div>
              </div>
            </div>
          )}

          {/* Active Conversion Progress Bar */}
          {isConverting && (
            <div className="p-5 bg-[#181818] border border-emerald-500/30 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-emerald-300 font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>{progressMessage || 'Converting save to TTF...'}</span>
                </div>
                <span className="font-mono font-bold text-emerald-400">{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full bg-[#101010] rounded-full h-2.5 overflow-hidden p-0.5 border border-white/5">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, Math.min(100, progressPercent))}%` }}
                />
              </div>
            </div>
          )}

          {/* Completed Result Card */}
          {completedResult && (
            <div className="p-5 bg-emerald-950/40 border border-emerald-500/50 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-200">
                    Conversion Complete!
                  </h4>
                  <p className="text-xs text-emerald-400/80 font-mono mt-0.5">
                    Saved as {completedResult.filename}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <a
                  href={completedResult.downloadUrl}
                  download={completedResult.filename}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Again
                </a>
                <button
                  onClick={() => { setCompletedResult(null); setParsedData(null); }}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-semibold transition-colors"
                >
                  Convert Another Save
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-[#161616] flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isConverting}
            className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            Close
          </button>

          {parsedData && !completedResult && (
            <button
              onClick={handleStartConversion}
              disabled={isConverting || !parsedData}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  Convert to TTF ({parsedData.stats.mappedGlyphsCount} Fused Glyphs)
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
