const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

if (!code.includes('Settings } from')) {
    code = code.replace(/import \{ MousePointer2, PaintBucket, Trash2, Search \} from 'lucide-react';/, `import { MousePointer2, PaintBucket, Trash2, Search, Settings } from 'lucide-react';`);
}

const stateTarget = `const [glyphSearchQuery, setGlyphSearchQuery] = useState('');`;
const stateReplacement = `const [glyphSearchQuery, setGlyphSearchQuery] = useState('');
  const [showForgottenCharacters, setShowForgottenCharacters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);`;

if (!code.includes('showForgottenCharacters')) {
  code = code.replace(stateTarget, stateReplacement);
}

const charsUseMemoTarget = `      const charStr = safeStringFromCodePoint(cp);
      if (!charStr) continue; // Skip unrenderable (surrogates)

      const mappedId = glyphMap[cp];
      const displayFont = mappedId ? fonts.find(f => f.id === mappedId) : baseFont;

      if (!showEmpty) {
        if (!displayFont || !displayFont.parsed) continue;
        const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
        if (glyphIndex === 0) continue; // .notdef
      }`;

const charsUseMemoReplacement = `      const charStr = safeStringFromCodePoint(cp);
      if (!charStr && !showForgottenCharacters) continue; // Skip unrenderable (surrogates)

      const mappedId = glyphMap[cp];
      const displayFont = mappedId ? fonts.find(f => f.id === mappedId) : baseFont;

      if (!showEmpty) {
        if (!displayFont || !displayFont.parsed) continue;
        const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr || String.fromCharCode(cp));
        if (glyphIndex === 0 && !showForgottenCharacters) continue; // .notdef
      }`;

code = code.replace(charsUseMemoTarget, charsUseMemoReplacement);
code = code.replace(
  `[block, showEmpty, baseFont, glyphMap, fonts, glyphSearchQuery]`,
  `[block, showEmpty, baseFont, glyphMap, fonts, glyphSearchQuery, showForgottenCharacters]`
);

const buttonsTarget = `          <button onClick={clearBlock}
            className="px-3 py-1.5 bg-[#1a1a1a] border border-white/10 text-[10px] uppercase font-bold rounded hover:bg-white/5 text-gray-300 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Mappings
          </button>
        </div>
      </div>`;

const buttonsReplacement = `          <button onClick={clearBlock}
            className="px-3 py-1.5 bg-[#1a1a1a] border border-white/10 text-[10px] uppercase font-bold rounded hover:bg-white/5 text-gray-300 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Mappings
          </button>
          
          <div className="relative">
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
          </div>
        </div>
      </div>`;

code = code.replace(buttonsTarget, buttonsReplacement);

const spanTarget = `<span 
                    className="text-2xl" 
                    style={{ 
                      fontFamily: displayFont?.fontFamilyName || 'inherit',
                      color: isMapped ? '#e5e5e5' : '#888'
                    }}
                  >
                    {safeStringFromCodePoint(cp)}
                  </span>`;
const spanReplacement = `<span 
                    className="text-2xl flex items-center justify-center" 
                    style={{ 
                      fontFamily: displayFont?.fontFamilyName || 'inherit',
                      color: isMapped ? '#e5e5e5' : '#888'
                    }}
                  >
                    {safeStringFromCodePoint(cp) || (showForgottenCharacters ? <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span> : '')}
                  </span>`;

code = code.replace(spanTarget, spanReplacement);

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log('Patched UnicodeExplorer.tsx');
