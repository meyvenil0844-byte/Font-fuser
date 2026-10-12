const n = 35000000;
console.log("Allocating...");
const data = [];
for (let i = 0; i < n; i++) data.push(i % 256);
console.log("Concatenating...");
const res = Array.prototype.concat([1, 2, 3], [4, 5, 6], data);
console.log("Success! length:", res.length);
