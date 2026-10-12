const fs = require('fs');
let code = fs.readFileSync('src/components/SavesModal.tsx', 'utf8');

code = code.replace(
  "import { X, Save, Trash2, FolderOpen, Download, Upload, Plus } from 'lucide-react';",
  "import { X, Save, Trash2, FolderOpen, Download, Upload, Plus, FileType } from 'lucide-react';\nimport { generateFusedFont, downloadArrayBuffer } from '../lib/fontUtils';"
);

const handleDownloadOld = `  const handleDownload = async (fusion: FusionSaveInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      const data = await loadNamedFusion(fusion.id);
      if (data) {
        await exportFusionWorkspace(fusion.name, data.fonts, data.glyphMap);
      }
    } catch (err: any) {
      alert("Failed to export: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };`;

const handleDownloadNew = `  const handleExportWorkspace = async (fusion: FusionSaveInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      const data = await loadNamedFusion(fusion.id);
      if (data) {
        await exportFusionWorkspace(fusion.name, data.fonts, data.glyphMap);
      }
    } catch (err: any) {
      alert("Failed to export: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadTTF = async (fusion: FusionSaveInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    const progressEl = document.getElementById('modal-progress-' + fusion.id);
    if (progressEl) progressEl.innerText = "Initializing generator...";
    try {
      const data = await loadNamedFusion(fusion.id);
      if (data && data.fonts && data.fonts.length > 0) {
        const baseFont = data.fonts[0];
        const arrayBuffer = await generateFusedFont(baseFont, data.fonts, data.glyphMap, (msg) => {
           if (progressEl) progressEl.innerText = msg;
        });
        const ext = baseFont.fileName.toLowerCase().endsWith('.otf') ? '.otf' : '.ttf';
        downloadArrayBuffer(arrayBuffer, (fusion.name || 'FusedFont') + ext);
        if (progressEl) progressEl.innerText = "Complete!";
      } else {
        alert("No fonts saved in this project to generate.");
        if (progressEl) progressEl.innerText = "";
      }
    } catch (err: any) {
      alert("Failed to generate font: " + err.message);
      if (progressEl) progressEl.innerText = "";
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        const p = document.getElementById('modal-progress-' + fusion.id);
        if (p) p.innerText = "";
      }, 3000);
    }
  };`;

code = code.replace(handleDownloadOld, handleDownloadNew);

const renderOld = `<button 
                      onClick={(e) => handleDownload(fusion, e)}
                      disabled={isLoading}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                      title="Download .fuser file"
                    >
                      <Download className="w-4 h-4" />
                    </button>`;

const renderNew = `                    <button 
                      onClick={(e) => handleDownloadTTF(fusion, e)}
                      disabled={isLoading}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                      title="Download Compiled Font (.ttf/.otf)"
                    >
                      <FileType className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => handleExportWorkspace(fusion, e)}
                      disabled={isLoading}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                      title="Export Workspace (.fuser)"
                    >
                      <Download className="w-4 h-4" />
                    </button>`;

code = code.replace(renderOld, renderNew);

const progressRenderOld = `<span className="text-[10px] text-gray-500 mt-1">{new Date(fusion.timestamp).toLocaleDateString()} {new Date(fusion.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
const progressRenderNew = progressRenderOld + `\n                  <span id={\`modal-progress-\${fusion.id}\`} className="text-[10px] text-blue-400 font-mono mt-2 min-h-[14px]"></span>`;

code = code.replace(progressRenderOld, progressRenderNew);

fs.writeFileSync('src/components/SavesModal.tsx', code);
console.log("Patched SavesModal.tsx successfully!");
