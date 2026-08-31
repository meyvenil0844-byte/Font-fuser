const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

code = code.replace(/const \[showSettings, setShowSettings\] = useState\(false\);/, "");
code = code.replace(/import \{ MousePointer2, PaintBucket, Trash2, Search, Settings \} from 'lucide-react';/, "import { MousePointer2, PaintBucket, Trash2, Search } from 'lucide-react';");

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
