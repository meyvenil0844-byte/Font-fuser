const fs = require('fs');
let code = fs.readFileSync('src/components/SavesModal.tsx', 'utf8');

const targetButtons = `                    <button 
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

const replacementButtons = `                    <button 
                      onClick={(e) => handleDownloadTTF(fusion, e)}
                      disabled={isLoading}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                      title="Download Compiled Font (.ttf/.otf)"
                    >
                      <Download className="w-4 h-4" />
                    </button>`;

if (code.includes(targetButtons)) {
    code = code.replace(targetButtons, replacementButtons);
    fs.writeFileSync('src/components/SavesModal.tsx', code);
    console.log("Patched buttons!");
} else {
    console.log("Could not find buttons to replace!");
}
