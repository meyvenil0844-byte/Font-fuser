const fs = require('fs');
let content = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');
const newBlocks = [
  "  { name: 'Vai', start: 0xA500, end: 0xA63F },",
  "  { name: 'Lisu', start: 0xA4D0, end: 0xA4FF },",
  "  { name: 'Cyrillic Extended-A', start: 0x2DE0, end: 0x2DFF },",
  "  { name: 'Cyrillic Extended-B', start: 0xA640, end: 0xA69F },",
  "  { name: 'Cyrillic Extended-C', start: 0x1C80, end: 0x1C8F },",
  "  { name: 'Bamum', start: 0xA6A0, end: 0xA6FF },",
  "  { name: 'Syloti Nagri', start: 0xA800, end: 0xA82F },",
  "  { name: 'Common Indic Number Forms', start: 0xA830, end: 0xA83F },",
  "  { name: 'Phags-pa', start: 0xA840, end: 0xA87F },",
  "  { name: 'Saurashtra', start: 0xA880, end: 0xA8DF },",
  "  { name: 'Devanagari Extended', start: 0xA8E0, end: 0xA8FF },",
  "  { name: 'Kayah Li', start: 0xA900, end: 0xA92F },",
  "  { name: 'Rejang', start: 0xA930, end: 0xA95F },",
  "  { name: 'Javanese', start: 0xA980, end: 0xA9DF },",
  "  { name: 'Myanmar Extended-B', start: 0xA9E0, end: 0xA9FF },",
  "  { name: 'Cham', start: 0xAA00, end: 0xAA5F },",
  "  { name: 'Myanmar Extended-A', start: 0xAA60, end: 0xAA7F },",
  "  { name: 'Tai Viet', start: 0xAA80, end: 0xAADF },",
  "  { name: 'Meetei Mayek Extensions', start: 0xAAE0, end: 0xAAFF },",
  "  { name: 'Ethiopic Extended-A', start: 0xAB00, end: 0xAB2F },",
  "  { name: 'Latin Extended-E', start: 0xAB30, end: 0xAB6F },",
  "  { name: 'Cherokee Supplement', start: 0xAB70, end: 0xABBF },",
  "  { name: 'Meetei Mayek', start: 0xABC0, end: 0xABFF }"
].join('\n');

content = content.replace('];', newBlocks + '\n];');
fs.writeFileSync('src/lib/unicodeBlocks.ts', content);
