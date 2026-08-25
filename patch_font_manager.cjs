const fs = require('fs');
let content = fs.readFileSync('src/components/FontManager.tsx', 'utf8');

const dragCode = `
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;

    setFonts(prev => {
      const draggedIdx = prev.findIndex(f => f.id === draggedId);
      const targetIdx = prev.findIndex(f => f.id === targetId);
      if (draggedIdx === -1 || targetIdx === -1) return prev;
      
      const newFonts = [...prev];
      const [dragged] = newFonts.splice(draggedIdx, 1);
      newFonts.splice(targetIdx, 0, dragged);
      return newFonts;
    });
  };
`;

content = content.replace(
  /const removeFont = \(id: string\) => \{\n\s*setFonts\(prev => prev\.filter\(f => f\.id !== id\)\);\n\s*\};/,
  `const removeFont = (id: string) => {
    setFonts(prev => prev.filter(f => f.id !== id));
  };\n${dragCode}`
);

content = content.replace(
  /<div \n\s*key=\{font\.id\}\n\s*onClick=\{\(\) => onApplyFont\(font\.id\)\}\n\s*className="relative flex flex-col p-2 rounded border cursor-pointer transition-all bg-\[#1a1a1a\] border-white\/5 hover:border-white\/20 hover:bg-\[#222\]"\n\s*>/,
  `<div 
                key={font.id}
                draggable
                onDragStart={(e) => handleDragStart(e, font.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, font.id)}
                onClick={() => onApplyFont(font.id)}
                className="relative flex flex-col p-2 rounded border cursor-pointer transition-all bg-[#1a1a1a] border-white/5 hover:border-white/20 hover:bg-[#222]"
                title="Drag to reorder, click to apply to selected characters"
              >`
);

fs.writeFileSync('src/components/FontManager.tsx', content);
