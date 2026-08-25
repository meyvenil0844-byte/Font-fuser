const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// We need to import Undo2, Redo2, History
content = content.replace(
  /import \{ Download, Layers, Loader2, SaveAll \} from 'lucide-react';/,
  `import { Download, Layers, Loader2, SaveAll, Undo2, Redo2, History } from 'lucide-react';`
);

// We add refs and state for history
const historyStateCode = `
  const [historyLength, setHistoryLength] = useState(0);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const historyRef = useRef<{fonts: UploadedFont[], glyphMap: GlyphMapping}[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);
`;

content = content.replace(
  /const \[selectedCharacters, setSelectedCharacters\] = useState<Set<number>>\(new Set\(\)\);/,
  `const [selectedCharacters, setSelectedCharacters] = useState<Set<number>>(new Set());\n${historyStateCode}`
);

// In load workspace
content = content.replace(
  /if \(saved && saved\.fonts\.length > 0\) \{\n\s*setFonts\(saved\.fonts\);\n\s*setGlyphMap\(saved\.glyphMap\);\n\s*\}/,
  `if (saved && saved.fonts.length > 0) {
          setFonts(saved.fonts);
          setGlyphMap(saved.glyphMap);
          historyRef.current = [{ fonts: saved.fonts, glyphMap: saved.glyphMap }];
          historyIndexRef.current = 0;
        } else {
          historyRef.current = [{ fonts: [], glyphMap: {} }];
          historyIndexRef.current = 0;
        }
        skipHistoryRef.current = true;
        setHistoryLength(historyRef.current.length);
        setCurrentHistoryIndex(historyIndexRef.current);`
);

// After load workspace useEffect, add history tracking useEffect and handlers
const historyEffectCode = `
  useEffect(() => {
    if (isWorkspaceLoading) return;
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    
    const curr = historyRef.current[historyIndexRef.current];
    if (curr && curr.fonts === fonts && curr.glyphMap === glyphMap) {
      return;
    }

    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push({ fonts, glyphMap });
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setHistoryLength(newHistory.length);
    setCurrentHistoryIndex(historyIndexRef.current);
  }, [fonts, glyphMap, isWorkspaceLoading]);

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      skipHistoryRef.current = true;
      setFonts(prev.fonts);
      setGlyphMap(prev.glyphMap);
      setCurrentHistoryIndex(historyIndexRef.current);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      skipHistoryRef.current = true;
      setFonts(next.fonts);
      setGlyphMap(next.glyphMap);
      setCurrentHistoryIndex(historyIndexRef.current);
    }
  };
`;

content = content.replace(
  /\/\/ Save workspace when fonts or glyphMap change/,
  `${historyEffectCode}\n  // Save workspace when fonts or glyphMap change`
);

// Let's add Undo and Redo buttons in the header
const headerButtons = `
          <div className="flex items-center gap-1 bg-[#1a1a1a] rounded border border-white/5 p-1 hidden sm:flex">
            <button
              onClick={handleUndo}
              disabled={currentHistoryIndex <= 0}
              className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 hover:bg-white/10 rounded transition-colors"
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-gray-500 font-mono w-8 text-center">{currentHistoryIndex + 1}/{historyLength}</span>
            <button
              onClick={handleRedo}
              disabled={currentHistoryIndex >= historyLength - 1}
              className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 hover:bg-white/10 rounded transition-colors"
              title="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
`;

content = content.replace(
  /<span className="text-xs font-medium text-gray-400 uppercase tracking-widest hidden sm:inline-block">/,
  `${headerButtons}\n          <span className="text-xs font-medium text-gray-400 uppercase tracking-widest hidden sm:inline-block">`
);

fs.writeFileSync('src/App.tsx', content);
