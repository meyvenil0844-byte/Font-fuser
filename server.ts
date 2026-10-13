import { fork } from 'child_process';
import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import zlib from 'zlib';
import opentype from 'opentype.js';
import { createServer as createViteServer } from 'vite';
import { injectApplyPolyfill } from './src/lib/applyPolyfill.ts';
import './src/lib/dataViewPolyfill.ts';

process.on('uncaughtException', (err) => {
  console.error('Server process uncaughtException caught:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Server process unhandledRejection caught:', reason);
});

injectApplyPolyfill();

const app = express();
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
const PORT = 3000;

app.get('/api/download-fused', (req, res) => {
  const filePathOTF = path.join(os.tmpdir(), 'fontfuser-uploads', 'FusedFont.otf');
  const filePathTTF = path.join(os.tmpdir(), 'fontfuser-uploads', 'FusedFont.ttf');
  if (fs.existsSync(filePathOTF)) {
    res.download(filePathOTF, 'FusedFont.otf');
  } else if (fs.existsSync(filePathTTF)) {
    res.download(filePathTTF, 'FusedFont.otf');
  } else {
    res.status(404).send('Font not found');
  }
});

app.post('/api/save-fused', express.raw({ type: 'application/octet-stream', limit: '100mb' }), (req, res) => {
  const buffer = req.body;
  const isCFF = req.query.format === 'cff';
  const outputPath = path.join(os.tmpdir(), 'fontfuser-uploads', isCFF ? 'FusedFont.otf' : 'FusedFont.ttf');
  try {
    fs.writeFileSync(outputPath, buffer);
    console.log("Saved fused font to tmp folder:", outputPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


const uploadDir = path.join(os.tmpdir(), 'fontfuser-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ 
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024, fieldSize: 100 * 1024 * 1024, files: 200 }
});

function scalePath(path: any, scale: number, isCFF: boolean) {
  const newPath = new opentype.Path();
  let currentX = 0;
  let currentY = 0;
  
  for (let i = 0; i < path.commands.length; i++) {
    const cmd = path.commands[i] as any;
    if (cmd.type === 'M') {
      currentX = cmd.x; currentY = cmd.y;
      newPath.moveTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
    } else if (cmd.type === 'L') {
      currentX = cmd.x; currentY = cmd.y;
      newPath.lineTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
    } else if (cmd.type === 'Q') {
      if (isCFF) {
        // Convert Quadratic to Cubic (Exact)
        const cp1x = currentX + (2/3) * (cmd.x1 - currentX);
        const cp1y = currentY + (2/3) * (cmd.y1 - currentY);
        const cp2x = cmd.x + (2/3) * (cmd.x1 - cmd.x);
        const cp2y = cmd.y + (2/3) * (cmd.y1 - cmd.y);
        newPath.curveTo(Math.round(cp1x * scale), Math.round(cp1y * scale), Math.round(cp2x * scale), Math.round(cp2y * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
      } else {
        newPath.quadraticCurveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
      }
      currentX = cmd.x; currentY = cmd.y;
    } else if (cmd.type === 'C') {
      if (!isCFF) {
        // Convert Cubic to Quadratic (Approximation: just use intersection of tangents or midpoint)
        // A simple crude approximation for now: use average of cp1 and cp2
        const qx = (cmd.x1 + cmd.x2) / 2;
        const qy = (cmd.y1 + cmd.y2) / 2;
        newPath.quadraticCurveTo(Math.round(qx * scale), Math.round(qy * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
      } else {
        newPath.curveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x2 * scale), Math.round(cmd.y2 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
      }
      currentX = cmd.x; currentY = cmd.y;
    } else if (cmd.type === 'Z') {
      newPath.close();
    }
  }
  return newPath;
}





import potrace from "potrace";
import svgPathParser from "svg-path-parser";
const { parseSVG, makeAbsolute } = svgPathParser;
import Jimp from "jimp";


app.all('/api/trace', (req, res, next) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} not allowed on /api/trace. Please use POST.` });
  }
  next();
});

app.post('/api/trace', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Multer error in trace:', err);
      return res.status(400).json({ error: err.message || String(err) });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  
  try {
    if (req.file.originalname.toLowerCase().endsWith('.svg')) {
      const svgStr = fs.readFileSync(req.file.path, 'utf8');
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      
      let pathData = '';
      const match = svgStr.match(/<path[^>]*d="([^"]+)"/i);
      if (match) {
        pathData = match[1];
      } else {
        const polyMatch = svgStr.match(/<polygon[^>]*points="([^"]+)"/i);
        if (polyMatch) {
          const pts = polyMatch[1].trim().split(/\s+|,/);
          if (pts.length >= 2) {
            pathData = 'M ' + pts[0] + ' ' + pts[1];
            for (let i = 2; i < pts.length; i += 2) {
               pathData += ' L ' + pts[i] + ' ' + pts[i+1];
            }
            pathData += ' Z';
          }
        }
      }
      
      let w = 800; let h = 800;
      const wMatch = svgStr.match(/width="([0-9.]+)"/i);
      const hMatch = svgStr.match(/height="([0-9.]+)"/i);
      const viewBox = svgStr.match(/viewBox="[^"]* ([0-9.]+) ([0-9.]+)"/i);
      if (wMatch) w = parseFloat(wMatch[1]);
      if (hMatch) h = parseFloat(hMatch[1]);
      else if (viewBox) {
        w = parseFloat(viewBox[1]);
        h = parseFloat(viewBox[2]);
      }
      
      try { 
        return res.json({ commands: makeAbsolute(parseSVG(pathData)), width: w, height: h }); 
      } catch(e) { 
        return res.json({ commands: [], width: w, height: h }); 
      }
    }

    Jimp.read(req.file.path, (err, image) => {
      if (err || !image) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        console.error('Jimp read error:', err);
        return res.status(500).json({ error: 'Failed to read image' });
      }
      if (image.bitmap.width > 400 || image.bitmap.height > 400) {
        image.scaleToFit(400, 400);
      }

      const w = image.bitmap.width;
      const h = image.bitmap.height;

      const requestedMode = (req.body.mode || req.query.mode || 'black').toString().toLowerCase();
      const shouldInvert = req.body.invert === 'true' || req.body.invert === true || req.query.invert === 'true';
      const thresholdVal = Math.min(254, Math.max(1, Number(req.body.threshold || req.query.threshold) || 128));

      // 1. Detect transparency
      let transparentCount = 0;
      let opaqueCount = 0;
      let opaqueBrightnessSum = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const rgba = Jimp.intToRGBA(image.getPixelColor(x, y));
          if (rgba.a < 128) {
            transparentCount++;
          } else {
            opaqueCount++;
            opaqueBrightnessSum += (rgba.r + rgba.g + rgba.b) / 3;
          }
        }
      }

      const hasTransparency = transparentCount > (w * h * 0.05);
      const avgOpaqueBrightness = opaqueCount > 0 ? (opaqueBrightnessSum / opaqueCount) : 0;

      // Determine effective mode:
      // If user selected 'white', or if user didn't specify and image has transparent background with white icon:
      let effectiveMode = requestedMode;
      if (requestedMode !== 'white' && requestedMode !== 'black') {
        if (hasTransparency && avgOpaqueBrightness > 190) {
          effectiveMode = 'white';
        } else {
          effectiveMode = 'black';
        }
      }

      if (shouldInvert) {
        effectiveMode = effectiveMode === 'black' ? 'white' : 'black';
      }

      if (hasTransparency) {
        if (effectiveMode === 'white') {
          // White glyph on transparent: composite onto black background, then invert so it becomes black-on-white for potrace
          const blackBg = new Jimp(w, h, 0x000000FF);
          blackBg.composite(image, 0, 0);
          image = blackBg;
          image.invert();
        } else {
          // Black glyph on transparent: composite onto solid white background
          const whiteBg = new Jimp(w, h, 0xFFFFFFFF);
          whiteBg.composite(image, 0, 0);
          image = whiteBg;
        }
      } else {
        // Solid image:
        if (effectiveMode === 'white') {
          // User wants white traced: invert so white becomes black for potrace
          image.invert();
        }
        // If effectiveMode === 'black': DO NOT INVERT! Potrace directly traces the black/dark pixels.
      }

      image.greyscale();
      image.contrast(0.8);

      const width = image.bitmap.width;
      const height = image.bitmap.height;
      
      potrace.trace(image, { threshold: thresholdVal, optCurve: true, turdSize: 20, optTolerance: 1.5 }, (err, svg) => {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        
        if (err || !svg) {
          console.error('Potrace error:', err);
          return res.status(500).json({ error: 'Failed to trace image' });
        }
        
        const match = svg.match(/d="([^"]+)"/);
        const pathData = match ? match[1] : '';
        return res.json({ pathData, width, height });
      });
    });
  } catch (err: any) {
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch (e) {}
    console.error('Unexpected error in /api/trace:', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});


import ttc2ttf from 'ttc2ttf';

app.post('/api/unpack-ttc', (req, res, next) => {
  upload.single('font')(req, res, (err) => {
    if (err) {
      console.error('Multer error in unpack-ttc:', err);
      return res.status(400).json({ error: err.message || String(err) });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    const distPath = req.file.path + '_unpacked';
    if (!fs.existsSync(distPath)) fs.mkdirSync(distPath);
    
    // Unpack TTC to the directory
    const unpackFn = typeof ttc2ttf === 'function' ? ttc2ttf : (ttc2ttf as any)?.default;
    if (typeof unpackFn !== 'function') throw new Error('ttc2ttf unpack function unavailable');
    unpackFn(req.file.path, distPath);
    
    // Find the first TTF file in the directory
    const files = fs.readdirSync(distPath);
    const ttfFiles = files.filter(f => f.endsWith('.ttf'));
    
    if (ttfFiles.length === 0) {
      return res.status(400).json({ error: 'No TTF fonts found in the TTC file' });
    }
    
    const firstTTF = path.join(distPath, ttfFiles[0]);
    
    res.download(firstTTF, ttfFiles[0], (err) => {
      // Cleanup
      try {
        fs.unlinkSync(req.file.path);
        for (const file of files) {
          fs.unlinkSync(path.join(distPath, file));
        }
        fs.rmdirSync(distPath);
      } catch (e) {}
    });
  } catch (err) {
    console.error("TTC unpack error:", err);
    res.status(500).json({ error: 'Failed to unpack TTC' });
  }
});


const serverFontNameCache = new Map<string, string>();
const manifestPath = path.join(uploadDir, 'manifest.json');

function saveManifestEntry(key: string, filePath: string) {
  try {
    if (!key || !filePath) return;
    serverFontNameCache.set(key, filePath);
    serverFontNameCache.set(key.toLowerCase(), filePath);
    let manifest: Record<string, string> = {};
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (e) {}
    }
    manifest[key] = filePath;
    manifest[key.toLowerCase()] = filePath;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  } catch (e) {}
}

// Load manifest on startup
try {
  if (fs.existsSync(manifestPath)) {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && fs.existsSync(v)) {
        serverFontNameCache.set(k, v);
      }
    }
  }
} catch (e) {}

app.get('/api/get-cached-font', (req, res) => {
  try {
    const name = ((req.query.name as string) || '').trim();
    const id = ((req.query.id as string) || '').trim();
    
    if (id && serverFontNameCache.has(id)) {
      const p = serverFontNameCache.get(id)!;
      if (fs.existsSync(p)) return res.sendFile(p);
    }
    if (id && serverFontNameCache.has(id.toLowerCase())) {
      const p = serverFontNameCache.get(id.toLowerCase())!;
      if (fs.existsSync(p)) return res.sendFile(p);
    }
    if (name && serverFontNameCache.has(name)) {
      const p = serverFontNameCache.get(name)!;
      if (fs.existsSync(p)) return res.sendFile(p);
    }
    if (name && serverFontNameCache.has(name.toLowerCase())) {
      const p = serverFontNameCache.get(name.toLowerCase())!;
      if (fs.existsSync(p)) return res.sendFile(p);
    }

    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      const cleanName = name.replace(/\.(ttf|otf|woff|woff2)$/i, '').toLowerCase();
      for (const f of files) {
        if (f === 'manifest.json') continue;
        const full = path.join(uploadDir, f);
        if ((id && f.includes(id)) || (name && f.toLowerCase().includes(name.toLowerCase()))) {
          return res.sendFile(full);
        }
        if (cleanName && cleanName.length > 2 && f.toLowerCase().includes(cleanName)) {
          return res.sendFile(full);
        }
      }
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/check-uploaded-fonts', (req, res) => {
  try {
    const { serverFontIds } = req.body || {};
    const existing: Record<string, string> = {};
    if (serverFontIds && typeof serverFontIds === 'object') {
      for (const [clientId, filename] of Object.entries(serverFontIds)) {
        if (typeof filename === 'string' && fs.existsSync(path.join(uploadDir, filename))) {
          existing[clientId] = filename;
        }
      }
    }
    res.json({ existing });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function decompressWoff1Buffer(buffer: Buffer): Buffer {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const sig = view.getUint32(0, false);
  if (sig !== 0x774F4646) throw new Error('Not WOFF1 signature');
  const flavor = view.getUint32(4, false);
  const numTables = view.getUint16(12, false);
  const totalSfntSize = view.getUint32(16, false);
  
  const out = Buffer.alloc(totalSfntSize);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  
  let searchRange = 1;
  let entrySelector = 0;
  while ((searchRange * 2) <= numTables) { searchRange *= 2; entrySelector++; }
  searchRange *= 16;
  const rangeShift = numTables * 16 - searchRange;
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(rangeShift, 10);
  
  let sfntTableDirOffset = 12;
  let sfntDataOffset = 12 + numTables * 16;
  
  for (let i = 0; i < numTables; i++) {
    const tableHeaderOffset = 44 + i * 20;
    const tag = buffer.subarray(tableHeaderOffset, tableHeaderOffset + 4);
    const offset = view.getUint32(tableHeaderOffset + 4, false);
    const compLength = view.getUint32(tableHeaderOffset + 8, false);
    const origLength = view.getUint32(tableHeaderOffset + 12, false);
    const origChecksum = view.getUint32(tableHeaderOffset + 16, false);
    
    let tableData: Buffer;
    if (compLength < origLength) {
      tableData = zlib.inflateSync(buffer.subarray(offset, offset + compLength));
    } else {
      tableData = buffer.subarray(offset, offset + origLength);
    }
    
    tag.copy(out, sfntTableDirOffset);
    out.writeUInt32BE(origChecksum, sfntTableDirOffset + 4);
    out.writeUInt32BE(sfntDataOffset, sfntTableDirOffset + 8);
    out.writeUInt32BE(origLength, sfntTableDirOffset + 12);
    sfntTableDirOffset += 16;
    
    tableData.copy(out, sfntDataOffset);
    sfntDataOffset += origLength;
    while (sfntDataOffset % 4 !== 0) sfntDataOffset++;
  }
  return out;
}

app.post('/api/decompress-woff2', upload.single('font'), async (req, res) => {
  try {
    let inputBuf: Buffer | null = null;
    let originalName = '';
    let clientId = (req.query.clientId as string) || '';
    if (req.file) {
      inputBuf = fs.readFileSync(req.file.path);
      originalName = req.file.originalname || '';
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    if (!inputBuf || inputBuf.length === 0) {
      return res.status(400).json({ error: 'No font file provided' });
    }
    const wawoff2 = await import('wawoff2');
    const decompressFn = wawoff2.decompress || (wawoff2 as any).default?.decompress;
    if (!decompressFn) throw new Error('wawoff2 decompress function unavailable');
    const decompressed = await decompressFn(inputBuf);
    const outBuf = Buffer.from(decompressed);

    // Cache the decompressed font in uploadDir for instant future access
    try {
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.ttf`;
      const p = path.join(uploadDir, filename);
      fs.writeFileSync(p, outBuf);
      if (clientId) saveManifestEntry(clientId, p);
      if (originalName) {
        saveManifestEntry(originalName, p);
        saveManifestEntry(originalName.replace(/\.woff2$/i, '.ttf'), p);
      }
    } catch (e) {}

    res.setHeader('Content-Type', 'font/ttf');
    res.send(outBuf);
  } catch (err: any) {
    console.error('WOFF2 decompression error:', err);
    res.status(400).json({ error: err.message || 'Failed to decompress WOFF2' });
  }
});

app.post('/api/decompress-woff1', upload.single('font'), (req, res) => {
  try {
    let inputBuf: Buffer | null = null;
    let originalName = '';
    let clientId = (req.query.clientId as string) || '';
    if (req.file) {
      inputBuf = fs.readFileSync(req.file.path);
      originalName = req.file.originalname || '';
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    if (!inputBuf || inputBuf.length === 0) {
      return res.status(400).json({ error: 'No font file provided' });
    }
    const decompressed = decompressWoff1Buffer(inputBuf);

    try {
      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.ttf`;
      const p = path.join(uploadDir, filename);
      fs.writeFileSync(p, decompressed);
      if (clientId) saveManifestEntry(clientId, p);
      if (originalName) {
        saveManifestEntry(originalName, p);
        saveManifestEntry(originalName.replace(/\.woff$/i, '.ttf'), p);
      }
    } catch (e) {}

    res.setHeader('Content-Type', 'font/ttf');
    res.send(decompressed);
  } catch (err: any) {
    console.error('WOFF1 decompression error:', err);
    res.status(400).json({ error: err.message || 'Failed to decompress WOFF1' });
  }
});

app.post('/api/clear-cache', (req, res) => {
  try {
    serverFontNameCache.clear();
    if (fs.existsSync(manifestPath)) {
      try { fs.unlinkSync(manifestPath); } catch {}
    }
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const f of files) {
        if (f.startsWith('FusedFont')) continue; // preserve active downloads if any
        try { fs.unlinkSync(path.join(uploadDir, f)); } catch {}
      }
    }
    if (global.gc) {
      try { global.gc(); } catch {}
    }
    console.log('Server font cache and tmp files cleared');
    res.json({ success: true, message: 'Server font cache cleared' });
  } catch (err: any) {
    console.error('Failed to clear server cache:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/cache-font', upload.single('font'), (req, res) => {
  try {
    const clientId = ((req.query.clientId as string) || (req.body?.clientId as string) || '').trim();
    const name = ((req.query.name as string) || (req.body?.name as string) || (req.file?.originalname) || '').trim();
    if (req.file) {
      saveManifestEntry(req.file.filename, req.file.path);
      if (clientId) saveManifestEntry(clientId, req.file.path);
      if (name) saveManifestEntry(name, req.file.path);
      return res.json({ success: true, fontId: req.file.filename });
    }
    res.status(400).json({ error: 'No font file uploaded' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload-fonts-batch', (req, res, next) => {
  upload.array('fonts', 200)(req, res, (err) => {
    if (err) {
      console.error('Multer error in upload-fonts-batch:', err);
      return res.status(400).json({ error: err.message || String(err) });
    }
    next();
  });
}, (req, res) => {
  if (!req.files || !Array.isArray(req.files)) return res.status(400).json({ error: 'No files uploaded' });
  
  let clientIds: string[] = [];
  if (req.body.clientIdsJson) {
    try {
      clientIds = JSON.parse(req.body.clientIdsJson);
    } catch (e) {}
  } else if (Array.isArray(req.body.clientIds)) {
    clientIds = req.body.clientIds;
  } else if (req.body.clientIds) {
    clientIds = [req.body.clientIds];
  }
  
  const mapping: Record<string, string> = {};
  req.files.forEach((f, idx) => {
    const cid = clientIds[idx];
    if (cid) {
      mapping[cid] = f.filename;
      saveManifestEntry(cid, f.path);
    }
    if (f.originalname) {
      saveManifestEntry(f.originalname, f.path);
    }
  });
  
  const fontIds = req.files.map(f => f.filename);
  res.json({ mapping, fontIds });
});

app.post('/api/upload-font-raw', (req, res) => {
  try {
    const clientId = (req.query.clientId as string) || '';
    const name = (req.query.name as string) || '';
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.ttf`;
    const targetPath = path.join(uploadDir, filename);
    const writeStream = fs.createWriteStream(targetPath);
    req.pipe(writeStream);
    req.on('end', () => {
      if (clientId) saveManifestEntry(clientId, targetPath);
      if (name) saveManifestEntry(name, targetPath);
      res.json({ fontId: filename, clientId });
    });
    req.on('error', (err) => {
      console.error('upload-font-raw stream error:', err);
      res.status(500).json({ error: err.message });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


const chunkStore = new Map();


app.post('/api/upload-chunk-raw', (req, res) => {
  try {
    const uploadId = req.query.uploadId as string;
    const chunkIndex = parseInt(req.query.chunkIndex as string, 10);
    const totalChunks = parseInt(req.query.totalChunks as string, 10);
    const originalName = (req.query.originalName as string) || 'font.ttf';
    
    if (!chunkStore.has(uploadId)) {
        chunkStore.set(uploadId, { chunks: new Array(totalChunks), received: 0, originalName });
    }
    
    const store = chunkStore.get(uploadId);
    const chunkPath = path.join(uploadDir, `${uploadId}-${chunkIndex}.tmp`);
    
    const fileStream = fs.createWriteStream(chunkPath);
    req.pipe(fileStream);
    
    req.on('end', () => {
        if (!store.chunks[chunkIndex]) {
            store.received++;
        }
        store.chunks[chunkIndex] = chunkPath;
        res.json({ success: true, received: store.received, total: totalChunks });
    });
    
    req.on('error', (err) => {
        console.error("Stream error:", err);
        res.status(500).json({ error: err.message });
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload-chunk', upload.single('chunk'), (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks, originalName } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No chunk file uploaded' });
    
    if (!chunkStore.has(uploadId)) {
        chunkStore.set(uploadId, { chunks: new Array(parseInt(totalChunks)), received: 0, originalName });
    }
    
    const store = chunkStore.get(uploadId);
    if (!store.chunks[parseInt(chunkIndex)]) {
        store.received++;
    } else {
        // We are retrying an already received chunk, clean up the old file
        try { fs.unlinkSync(store.chunks[parseInt(chunkIndex)]); } catch(e){}
    }
    store.chunks[parseInt(chunkIndex)] = req.file.path;
    
    res.json({ success: true, received: store.received, total: parseInt(totalChunks) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload-chunk-finish', express.json(), (req, res) => {
  try {
    const { uploadId } = req.body;
    const store = chunkStore.get(uploadId);
    
    if (!store) return res.status(404).json({ error: 'Upload ID not found' });
    if (store.received !== store.chunks.length) return res.status(400).json({ error: 'Not all chunks received' });
    
    const finalPath = path.join(uploadDir, `${Date.now()}-${Math.random().toString(36).substring(2,10)}.ttf`);
    
    // Append all chunks
    for (const chunkPath of store.chunks) {
        if (!chunkPath) continue;
        const data = fs.readFileSync(chunkPath);
        fs.appendFileSync(finalPath, data);
        // Clean up chunk
        try { fs.unlinkSync(chunkPath); } catch(e){}
    }
    
    chunkStore.delete(uploadId);
    
    const filename = path.basename(finalPath);
    res.json({ fontId: filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload-font', (req, res, next) => {
  upload.single('font')(req, res, (err) => {
    if (err) {
      console.error('Multer error in upload-font:', err);
      return res.status(400).json({ error: err.message || String(err) });
    }
    next();
  });
}, (req, res) => {
  console.log('Received upload-font request');
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ fontId: req.file.filename });
});




import crypto from 'crypto';

const activeJobs = new Map();

// Periodic cleanup of old uploaded files (older than 1 hour)
setInterval(() => {
  try {
    const now = Date.now();
    fs.readdirSync(uploadDir).forEach(f => {
      if (f === 'manifest.json') return;
      const filePath = path.join(uploadDir, f);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        console.log('Cleaned up old file:', f);
      }
    });
  } catch(e) {
    console.error('Periodic cleanup error:', e);
  }
}, 15 * 60 * 1000); // Check every 15 minutes


app.post('/api/fuse-by-ids', async (req, res) => {
  try {
    console.log("Received /api/fuse-by-ids request");
    const { glyphMap, baseFontId, serverFontIds } = req.body;
    if (!glyphMap || !serverFontIds || !baseFontId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const baseServerFilename = serverFontIds[baseFontId];
    if (!baseServerFilename) {
      return res.status(400).json({ error: 'Base font was not uploaded or missing from server mapping' });
    }
    const baseFilePath = path.join(uploadDir, baseServerFilename);
    if (!fs.existsSync(baseFilePath)) {
      return res.status(400).json({ error: 'Base font file not found on server storage' });
    }
        
    const jobId = crypto.randomUUID();
    activeJobs.set(jobId, { status: 'progress', message: 'Starting...' });
    
    // Spawn worker
    const workerPath = path.join(process.cwd(), 'fuseWorker.cjs');  
    if (global.gc) global.gc();
    const worker = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=3072', '--expose-gc'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=3072 --expose-gc'
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    let workerStderr = '';
    if (worker.stderr) {
      worker.stderr.on('data', (data) => {
        const text = data.toString();
        workerStderr += text;
        console.error(`[Worker STDERR] ${text}`);
      });
    }
    if (worker.stdout) {
      worker.stdout.on('data', (data) => {
        console.log(`[Worker STDOUT] ${data.toString()}`);
      });
    }

    worker.send({
        glyphMap,
        baseFontId,
        serverFontIds,
        uploadDir
    });
    
    worker.on('message', (msg: any) => {
      if (msg.type === 'progress') {
        console.log("Worker progress:", msg.message);
        activeJobs.set(jobId, { status: 'progress', message: msg.message });
      } else if (msg.type === 'done') {
        console.log("Worker done. Saving job:", jobId);
        activeJobs.set(jobId, { status: 'done', file: msg.file, originalName: msg.originalName, serverFontIds });
      } else if (msg.type === 'error') {
        console.error("Worker error:", msg.message, msg.stack || '');
        activeJobs.set(jobId, { status: 'error', message: msg.message });
        try {
          if (serverFontIds) {
            Object.values(serverFontIds).forEach((f: any) => {
              try { fs.unlinkSync(path.join(uploadDir, f)); } catch(e){}
            });
          }
        } catch(e) {}
      }
    });
    
    worker.on('error', (err) => {
      console.error("Worker thread error:", err);
      activeJobs.set(jobId, { status: 'error', message: String(err) });
    });
    
    worker.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code} and signal ${signal}. Stderr: ${workerStderr}`);
        const currentJob = activeJobs.get(jobId);
        if (currentJob && currentJob.status !== 'done' && currentJob.status !== 'error') {
            const detail = workerStderr.trim() ? `: ${workerStderr.trim().slice(-300)}` : '';
            activeJobs.set(jobId, { status: 'error', message: `Worker exited with code ${code} signal ${signal}${detail}` });
        }
      }
    });
    
    res.json({ jobId });
  } catch (err: any) {
    console.error("Fusion error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/fuse-status/:jobId', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    ...job,
    downloadUrl: job.status === 'done' ? `/api/fuse-download/${req.params.jobId}` : undefined
  });
});

app.get('/api/fuse-download/:jobId', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job || job.status !== 'done') return res.status(400).json({ error: 'Job not ready or not found' });
  
  const customName = typeof req.query.filename === 'string' ? req.query.filename : (job.originalName || 'FusedFont.otf');
  const mimeType = customName.toLowerCase().endsWith('.otf') ? 'font/otf' : (customName.toLowerCase().endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream');
  const safeName = customName.replace(/["\r\n]/g, '_');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(customName)}`);
  const readStream = fs.createReadStream(job.file);
  readStream.pipe(res);
  
  // Clean up completed job artifact after 15 minutes so repeated user downloads succeed
  setTimeout(() => {
    try { if (fs.existsSync(job.file)) fs.unlinkSync(job.file); } catch (e) {}
    activeJobs.delete(req.params.jobId);
  }, 15 * 60 * 1000);
});

app.post('/api/log-error', express.json(), (req, res) => {
  console.error('Client Error:', req.body.message, req.body.stack);
  try {
    fs.appendFileSync('/tmp/client-errors.log', new Date().toISOString() + ' Client Error: ' + req.body.message + '\n' + req.body.stack + '\n\n');
  } catch {}
  res.send('ok');
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, req: any, res: any, next: any) => {
    if (req.path.startsWith('/api/')) {
      console.error("API Error caught:", err);
      res.status(err.status || 500).json({ error: err.message || String(err) });
    } else {
      next(err);
    }
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on('clientError', (err: any, socket: any) => {
    if (err.code === 'ECONNRESET' || !socket.writable) return;
    try {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    } catch (e) {}
  });

  // Keep-alive timeouts aligned to prevent socket reset disconnects
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
  server.requestTimeout = 300000;
}

startServer();
