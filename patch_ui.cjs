const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const labelsTarget = `<label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none mt-2">
            <input 
              type="checkbox" 
              checked={showEmpty} 
              onChange={e => setShowEmpty(e.target.checked)}
              className="accent-blue-500 bg-[#1a1a1a] border-white/10 rounded"
            />
            Show Empty Glyphs
          </label>`;

const labelsReplacement = `<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2">
            <label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={showEmpty} 
                onChange={e => setShowEmpty(e.target.checked)}
                className="accent-blue-500 bg-[#1a1a1a] border-white/10 rounded"
              />
              Show Empty Glyphs
            </label>
            <label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={showForgottenCharacters} 
                onChange={e => setShowForgottenCharacters(e.target.checked)}
                className="accent-blue-500 bg-[#1a1a1a] border-white/10 rounded"
              />
              Show Forgotten Characters
            </label>
          </div>`;

code = code.replace(labelsTarget, labelsReplacement);

const settingsTarget = `<div className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="px-2 py-1.5 bg-[#1a1a1a] border border-white/10 rounded hover:bg-white/5 text-gray-300 transition-colors flex items-center"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            {showSettings && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-[#1a1a1a] border border-white/10 rounded shadow-xl z-50 p-3">
                <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={showForgottenCharacters} 
                    onChange={e => setShowForgottenCharacters(e.target.checked)}
                    className="accent-blue-500 bg-[#0d0d0d] border-white/10 rounded mt-0.5"
                  />
                  <span>
                    <strong className="block text-gray-200 mb-0.5">Turn On Forgotten Characters</strong>
                    <span className="text-[10px] text-gray-500 leading-tight block">
                      Show bugged, missing, or unrenderable codepoints (.notdef, surrogates, etc.)
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>`;

code = code.replace(settingsTarget, "");
fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log('Patched');
