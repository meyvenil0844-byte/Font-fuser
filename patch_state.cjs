const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

code = code.replace(
  "const [searchQuery, setSearchQuery] = useState('');",
  "const [searchQuery, setSearchQuery] = useState('');\n  const [glyphSearchQuery, setGlyphSearchQuery] = useState('');"
);

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log('Added glyphSearchQuery state');
