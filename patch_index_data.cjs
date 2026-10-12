const fs = require('fs');
let code = fs.readFileSync('node_modules/opentype.js/dist/opentype.js', 'utf8');

const target = `      Array.prototype.push.apply(data, v);`;
const replace = `      for (let j = 0; j < v.length; j++) data.push(v[j]);`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync('node_modules/opentype.js/dist/opentype.js', code);
    console.log("Patched Array.prototype.push.apply(data, v)!");
}
