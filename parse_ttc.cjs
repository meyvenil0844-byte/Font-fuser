function extractFirstTTFFromTTC(buffer) {
  const dataView = new DataView(buffer);
  const tag = String.fromCharCode(
    dataView.getUint8(0),
    dataView.getUint8(1),
    dataView.getUint8(2),
    dataView.getUint8(3)
  );
  if (tag !== 'ttcf') {
    return buffer; // Not a TTC
  }
  const numFonts = dataView.getUint32(8);
  if (numFonts === 0) return buffer;
  const firstOffset = dataView.getUint32(12);
  // We need to construct a valid TTF. 
  // Wait, the offset points to the TableDirectory of the first font.
  // A TTF file IS just the TableDirectory followed by the tables.
  // So can we just slice from `firstOffset`?
  // Wait, the table offsets inside the TableDirectory are absolute from the beginning of the TTC file!
  // So slicing won't work unless we rewrite all offsets!
  // Actually, we can rewrite the offsets.
}
