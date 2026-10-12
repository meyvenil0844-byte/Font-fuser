const opentype = require('opentype.js');
// Need to extract glyphToOps and encode.CHARSTRING so worker can use them
// Wait, opentype doesn't export them.
