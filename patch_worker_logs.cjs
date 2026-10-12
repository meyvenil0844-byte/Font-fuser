const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const target1 = `if (processed % 500 === 0) process.send({ type: 'progress', message: \`Fused \${processed} / \${mappedCodepoints.size}\` });`;
const replace1 = `if (processed % 500 === 0) {
    const mem = process.memoryUsage();
    process.send({ type: 'progress', message: \`Fused \${processed} / \${mappedCodepoints.size} (Mem: \${Math.round(mem.heapUsed/1024/1024)}MB)\` });
}`;

code = code.replace(target1, replace1);

const target2 = `const targetFont = getTargetFont(targetFontId);`;
const replace2 = `
    const memBefore = process.memoryUsage();
    process.send({ type: 'progress', message: \`Loading target font \${targetFontId} (Mem: \${Math.round(memBefore.heapUsed/1024/1024)}MB)\` });
    const targetFont = getTargetFont(targetFontId);
`;

code = code.replace(target2, replace2);

fs.writeFileSync('fuseWorker.cjs', code);
console.log("Patched worker logs!");
