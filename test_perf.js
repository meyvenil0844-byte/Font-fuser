console.time('loop');
const chars = [];
for (let i = 0; i <= 0x10FFFF; i++) {
  if (i % 2 === 0) chars.push(i);
}
console.timeEnd('loop');
console.log(chars.length);
