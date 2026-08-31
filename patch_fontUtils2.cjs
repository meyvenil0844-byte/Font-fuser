const fs = require('fs');

let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const regex = /const ([a-zA-Z0-9_ \{\}]+) = await ([a-zA-Z0-9_]+)\.json\(\);/g;

code = code.replace(regex, (match, p1, p2) => {
    // avoid double patching
    if (code.includes(`const __ct_${p2} = ${p2}.headers.get('content-type');`)) {
        return match;
    }
    return `const __ct_${p2} = ${p2}.headers.get('content-type');
    if (__ct_${p2} && __ct_${p2}.includes('text/html')) {
        const text = await ${p2}.text().catch(()=>'');
        throw new Error(\`Server returned HTML instead of JSON for \${${p2}.url} (\${${p2}.status}). Response: \${text.substring(0, 100)}\`);
    }
    const ${p1} = await ${p2}.json();`;
});

fs.writeFileSync('src/lib/fontUtils.ts', code);
console.log('Patched json() calls with braces');
