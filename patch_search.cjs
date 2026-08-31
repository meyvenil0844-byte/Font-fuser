const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const importTarget = `import { Search } from 'lucide-react';`;
if (!code.includes('Search } from')) {
    code = code.replace(/import \{ MousePointer2, PaintBucket, Trash2 \} from 'lucide-react';/, `import { MousePointer2, PaintBucket, Trash2, Search } from 'lucide-react';`);
}

const stateTarget = `const [dragState, setDragState] = useState<'select' | 'deselect'>('select');
  const [showEmpty, setShowEmpty] = useState(true);`;

const stateReplacement = `const [dragState, setDragState] = useState<'select' | 'deselect'>('select');
  const [showEmpty, setShowEmpty] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i }));
    
    const query = searchQuery.toLowerCase();
    
    const chars = Array.from(searchQuery);
    if (chars.length === 1) {
      const cp = chars[0].codePointAt(0);
      if (cp !== undefined) {
        return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i })).filter(b => 
          (cp >= b.start && cp <= b.end) || b.name.toLowerCase().includes(query)
        );
      }
    }
    
    return UNICODE_BLOCKS.map((b, i) => ({ ...b, originalIndex: i })).filter(b => {
      if (b.name.toLowerCase().includes(query)) return true;
      let hexQuery = query.replace(/^(u\\+|0x)/i, '').trim();
      if (/^[0-9a-f]+$/i.test(hexQuery)) {
         const cp = parseInt(hexQuery, 16);
         if (cp >= b.start && cp <= b.end) return true;
      }
      return false;
    });
  }, [searchQuery]);

  useEffect(() => {
    if (filteredBlocks.length > 0 && searchQuery.trim() !== '') {
       const hasCurrent = filteredBlocks.some(b => b.originalIndex === selectedBlockIndex);
       if (!hasCurrent) {
          setSelectedBlockIndex(filteredBlocks[0].originalIndex);
       }
    }
  }, [filteredBlocks, selectedBlockIndex, setSelectedBlockIndex, searchQuery]);`;

if (!code.includes('searchQuery')) {
  code = code.replace(stateTarget, stateReplacement);
}

const renderTarget = `<div className="flex flex-col gap-1">
          <select 
            value={selectedBlockIndex}
            onChange={(e) => setSelectedBlockIndex(Number(e.target.value))}
            className="bg-[#1a1a1a] border border-white/10 text-xs p-1.5 rounded outline-none focus:border-blue-500 text-gray-200"
          >
            {UNICODE_BLOCKS.map((b, i) => (
              <option key={b.name} value={i}>{b.name} (U+{b.start.toString(16).toUpperCase()} - U+{b.end.toString(16).toUpperCase()})</option>
            ))}
          </select>`;

const renderReplacement = `<div className="flex flex-col gap-2 w-full max-w-[350px]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search blocks (e.g. 'emoji') or characters (e.g. 'A', 'U+0041')"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-[#1a1a1a] border border-white/10 text-xs py-1.5 pl-8 pr-2 rounded outline-none focus:border-blue-500 text-gray-200 w-full"
            />
          </div>
          <select 
            value={selectedBlockIndex}
            onChange={(e) => setSelectedBlockIndex(Number(e.target.value))}
            className="bg-[#1a1a1a] border border-white/10 text-xs p-1.5 rounded outline-none focus:border-blue-500 text-gray-200 w-full"
          >
            {filteredBlocks.map((b) => (
              <option key={b.name} value={b.originalIndex}>{b.name} (U+{b.start.toString(16).toUpperCase()} - U+{b.end.toString(16).toUpperCase()})</option>
            ))}
            {filteredBlocks.length === 0 && (
              <option disabled value={-1}>No results found</option>
            )}
          </select>`;

code = code.replace(renderTarget, renderReplacement);

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log('Patched UnicodeExplorer.tsx');
