import React, { useState, useEffect, useRef } from 'react';
import { TraceOptions, traceImageClient, safeStringFromCodePoint } from '../lib/fontUtils';
import { X, Check, ArrowLeftRight, Sparkles, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageTraceModalProps {
  isOpen: boolean;
  file: File | null;
  targetCodePoints: number[];
  onClose: () => void;
  onApply: (options: TraceOptions) => Promise<void>;
}

export function ImageTraceModal({
  isOpen,
  file,
  targetCodePoints,
  onClose,
  onApply
}: ImageTraceModalProps) {
  const [mode, setMode] = useState<'black' | 'white'>('black');
  const [invert, setInvert] = useState<boolean>(false);
  const [threshold, setThreshold] = useState<number>(128);
  const [isTracing, setIsTracing] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [previewPath, setPreviewPath] = useState<string>('');
  const [dims, setDims] = useState<{ width: number; height: number }>({ width: 400, height: 400 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  // Load image object URL
  useEffect(() => {
    if (!file) {
      setImgUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    // Reset to sensible defaults for new file
    setMode('black');
    setInvert(false);
    setThreshold(128);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Live trace whenever file, mode, invert, or threshold change
  useEffect(() => {
    if (!file || !isOpen) return;

    let isMounted = true;
    setIsTracing(true);
    setErrorMsg(null);

    const timer = setTimeout(async () => {
      try {
        const result = await traceImageClient(file, { mode, invert, threshold });
        if (isMounted) {
          setPreviewPath(result.pathData);
          setDims({ width: result.width || 400, height: result.height || 400 });
          setIsTracing(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err?.message || 'Failed to trace image');
          setIsTracing(false);
        }
      }
    }, 80);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [file, isOpen, mode, invert, threshold]);

  if (!isOpen || !file) return null;

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply({ mode, invert, threshold });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to apply font');
    } finally {
      setIsApplying(false);
    }
  };

  const toggleInvert = () => {
    setInvert(prev => !prev);
  };

  const effectiveTraceTarget = (mode === 'black' && !invert) || (mode === 'white' && invert)
    ? 'Black / Dark'
    : 'White / Light';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[#18181b] border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-[#141416]">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              Trace Image to Glyph
            </h2>
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-md py-0.5">
              {targetCodePoints.slice(0, 6).map(cp => (
                <span 
                  key={cp}
                  className="px-2 py-0.5 text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-medium"
                  title={`U+${cp.toString(16).toUpperCase()}`}
                >
                  U+{cp.toString(16).toUpperCase()} ({safeStringFromCodePoint(cp)})
                </span>
              ))}
              {targetCodePoints.length > 6 && (
                <span className="text-[11px] text-gray-400 font-mono">
                  +{targetCodePoints.length - 6} more
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 min-h-0">
          
          {/* Side-by-side previews */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Source Image */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1.5 text-xs font-medium text-gray-300">
                <span>Original Image</span>
                <span className="text-[10px] text-gray-500 font-mono truncate max-w-[150px]">{file.name}</span>
              </div>
              <div className="h-56 rounded-lg border border-white/10 bg-[#0d0d0f] flex items-center justify-center p-3 relative overflow-hidden checkerboard-bg">
                {imgUrl && (
                  <img 
                    src={imgUrl} 
                    alt="Source" 
                    className="max-h-full max-w-full object-contain filter drop-shadow-md select-none" 
                  />
                )}
              </div>
            </div>

            {/* Traced Vector Glyph Preview */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1.5 text-xs font-medium text-gray-300">
                <span className="flex items-center gap-1.5">
                  Glyph Vector Preview
                  {isTracing && <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />}
                </span>
                <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded font-mono">
                  Tracing: {effectiveTraceTarget}
                </span>
              </div>
              <div className="h-56 rounded-lg border border-blue-500/20 bg-[#0a0a0c] flex items-center justify-center p-3 relative overflow-hidden">
                {previewPath ? (
                  <svg 
                    viewBox={`0 0 ${dims.width} ${dims.height}`} 
                    className="max-h-full max-w-full select-none"
                    style={{ filter: 'drop-shadow(0 0 10px rgba(59,130,246,0.3))' }}
                  >
                    {/* Baseline guideline */}
                    <line 
                      x1="0" 
                      y1={dims.height * 0.8} 
                      x2={dims.width} 
                      y2={dims.height * 0.8} 
                      stroke="#ef4444" 
                      strokeWidth="1" 
                      strokeDasharray="4 4" 
                      opacity="0.3" 
                    />
                    <path 
                      d={previewPath} 
                      fill="#e2e8f0" 
                      stroke="#60a5fa" 
                      strokeWidth="0.8" 
                      fillRule="evenodd" 
                    />
                  </svg>
                ) : (
                  <div className="text-center text-xs text-gray-500 flex flex-col items-center gap-2">
                    {isTracing ? (
                      <>
                        <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                        <span>Tracing outline...</span>
                      </>
                    ) : (
                      <span>No outline detected with current threshold</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Trace Polarity Controls */}
          <div className="p-4 bg-white/[0.03] border border-white/5 rounded-xl space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-xs font-semibold text-white block">
                  Tracing Mode / Polarity
                </label>
                <p className="text-[11px] text-gray-400">
                  Select which color in your image represents the character glyph.
                </p>
              </div>

              {/* Invert button */}
              <button
                type="button"
                onClick={toggleInvert}
                className="px-3 py-1.5 bg-[#27272a] hover:bg-[#323238] border border-white/10 hover:border-white/20 text-xs font-medium text-white rounded-lg transition-colors flex items-center gap-2 shrink-0 self-start sm:self-auto"
                title="Swap black and white tracing"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
                <span>Invert ({invert ? 'ON' : 'OFF'})</span>
              </button>
            </div>

            {/* Mode selection buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('black')}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  mode === 'black'
                    ? 'bg-blue-600/15 border-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                    : 'bg-[#202024] border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-black border-2 border-white/30 flex items-center justify-center shrink-0">
                  {mode === 'black' && <div className="w-2 h-2 rounded-full bg-blue-400" />}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Trace Black / Dark Shapes</div>
                  <div className="text-[10px] text-gray-400">Standard ink, pencil, dark logos on white/transparent</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('white')}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  mode === 'white'
                    ? 'bg-blue-600/15 border-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                    : 'bg-[#202024] border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-white border-2 border-white/40 flex items-center justify-center shrink-0">
                  {mode === 'white' && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Trace White / Light Shapes</div>
                  <div className="text-[10px] text-gray-400">White text/drawings on dark or black backgrounds</div>
                </div>
              </button>
            </div>

            {/* Threshold Slider */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-300 font-medium">Brightness Threshold Sensitivity</span>
                <span className="font-mono text-blue-400 font-semibold">{threshold} / 255</span>
              </div>
              <input 
                type="range"
                min="20"
                max="240"
                step="1"
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer h-1.5 bg-gray-700 rounded-lg appearance-none"
              />
              <div className="flex items-center justify-between text-[10px] text-gray-500 pt-0.5">
                <span>Stricter (only deep ink)</span>
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => setThreshold(90)} 
                    className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                  >
                    90 (Thin)
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setThreshold(128)} 
                    className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                  >
                    128 (Default)
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setThreshold(170)} 
                    className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                  >
                    170 (Thick)
                  </button>
                </div>
                <span>Broader (includes shades)</span>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-[#141416] flex items-center justify-between">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          
          <button 
            type="button"
            onClick={handleApply}
            disabled={isApplying || !previewPath}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none text-xs font-bold text-white rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            {isApplying ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Generating Font...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Apply to {targetCodePoints.length} Character{targetCodePoints.length > 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
