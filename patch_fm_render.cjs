const fs = require('fs');
let content = fs.readFileSync('src/components/FontManager.tsx', 'utf8');

const replacement = `
  return (
    <div className="flex flex-col w-full md:w-64 bg-[#111111] border-b md:border-b-0 md:border-r border-white/5 shrink-0 max-h-[40vh] md:max-h-none overflow-y-auto">
      <div className="p-4 border-b border-white/5">
        <h2 className="text-[10px] uppercase text-gray-500 font-bold tracking-widest mb-3">
          Loaded Font Files
        </h2>
        
        <div className="flex flex-col gap-2">
          {fonts.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No fonts added yet.</p>
          ) : (
            <>
              {movingFontId && (
                <div 
                  className="h-4 -my-2 flex items-center justify-center cursor-pointer group z-20"
                  onClick={() => handleMove(0)}
                >
                  <div className="h-0.5 w-full bg-blue-500/0 group-hover:bg-blue-500 transition-colors rounded" />
                </div>
              )}
              {fonts.filter(f => !f.isHidden).map((font, idx) => (
                <React.Fragment key={font.id}>
                  <div 
                    onClick={() => {
                      if (movingFontId) {
                        setMovingFontId(null);
                      } else {
                        onApplyFont(font.id);
                      }
                    }}
                    className={cn("relative flex flex-col p-2 rounded border cursor-pointer transition-all bg-[#1a1a1a] hover:bg-[#222]", movingFontId === font.id ? "border-blue-500 ring-1 ring-blue-500" : "border-white/5 hover:border-white/20")}
                    title="Click to apply to selected characters"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex flex-col overflow-hidden w-full pr-12">
                        <span className="text-xs font-medium truncate text-gray-200" title={font.name}>
                          {font.name}
                        </span>
                        <span className="text-[9px] text-gray-500 uppercase truncate" title={font.fileName}>{font.fileName}</span>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 z-10">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setMovingFontId(movingFontId === font.id ? null : font.id); }}
                          className={cn("p-1 rounded transition-colors", movingFontId === font.id ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-white hover:bg-white/5")}
                          title="Move font"
                        >
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeFont(font.id); }}
                          className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-white/5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-2">
                      <div 
                        className="w-2.5 h-2.5 rounded-full shadow-sm"
                        style={{ backgroundColor: font.color }}
                      />
                      <span className="text-[9px] uppercase font-bold text-gray-400 flex items-center gap-1">
                        Click to apply to category
                      </span>
                    </div>
                  </div>
                  {movingFontId && (
                    <div 
                      className="h-4 -my-2 flex items-center justify-center cursor-pointer group z-20 relative"
                      onClick={() => handleMove(idx + 1)}
                    >
                      <div className="h-0.5 w-full bg-blue-500/0 group-hover:bg-blue-500 transition-colors rounded" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <input
            type="file"
            multiple
            
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1a1a1a] border border-white/5 hover:bg-white/5 hover:border-white/20 text-gray-300 text-xs font-bold uppercase rounded transition-colors"
          >
            <Upload className="w-4 h-4" />
            Select Multiple Fonts
          </button>
        </div>
      </div>
    </div>
  );
`;

const startIndex = content.indexOf('  return (');
content = content.substring(0, startIndex) + replacement + '\n}\n';

fs.writeFileSync('src/components/FontManager.tsx', content);
