const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const target = `{(block.name === 'Forgotten Characters' && cp !== 0xFFFD && cp !== 0x0020) ? (
                       <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500 opacity-50">
                         {safeStringFromCodePoint(cp)}
                       </span>
                    ) : safeStringFromCodePoint(cp) || <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span>}`;

const replacement = `{(block.name === 'Forgotten Characters' && cp !== 0xFFFD && cp !== 0x0020) ? (
                       <div className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500 opacity-50 min-w-[12px] min-h-[12px] flex items-center justify-center">
                         {safeStringFromCodePoint(cp)}
                       </div>
                    ) : safeStringFromCodePoint(cp) || <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span>}`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
