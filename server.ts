import { fork } from 'child_process';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import zlib from 'zlib';
import opentype from 'opentype.js';
import ttc2ttf from 'ttc2ttf';
import { createServer as createViteServer } from 'vite';
import potrace from 'potrace';
import svgPathParser from 'svg-path-parser';
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
app.use(express.json({ limit: "250mb" }));
app.use(express.urlencoded({ extended: true, limit: "250mb" }));
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

app.post('/api/save-fused', express.raw({ type: 'application/octet-stream', limit: '250mb' }), (req, res) => {
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

const persistentProjectsDir = path.join(process.cwd(), 'user_projects');
const persistentFontsDir = path.join(process.cwd(), 'user_fonts');
const uploadDir = path.join(os.tmpdir(), 'fontfuser-uploads');

if (!fs.existsSync(persistentProjectsDir)) {
  fs.mkdirSync(persistentProjectsDir, { recursive: true });
}
if (!fs.existsSync(persistentFontsDir)) {
  fs.mkdirSync(persistentFontsDir, { recursive: true });
}
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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

// Load manifest and scan persistentFontsDir on startup
try {
  if (fs.existsSync(manifestPath)) {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && fs.existsSync(v)) {
        serverFontNameCache.set(k, v);
        serverFontNameCache.set(k.toLowerCase(), v);
      }
    }
  }
} catch (e) {}

try {
  if (fs.existsSync(persistentFontsDir)) {
    const fFiles = fs.readdirSync(persistentFontsDir);
    for (const f of fFiles) {
      if (f.endsWith('.ttf') || f.endsWith('.otf') || f.endsWith('.woff') || f.endsWith('.woff2')) {
        const fullPath = path.join(persistentFontsDir, f);
        saveManifestEntry(f, fullPath);
        saveManifestEntry(path.parse(f).name, fullPath);
        try {
          const buf = fs.readFileSync(fullPath);
          const parsed = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
          const nameObj = (parsed as any).tables?.name;
          const candidates: string[] = [];
          if (nameObj?.macintosh?.fontFamily?.en) candidates.push(nameObj.macintosh.fontFamily.en);
          if (nameObj?.windows?.fontFamily?.en) candidates.push(nameObj.windows.fontFamily.en);
          if (nameObj?.macintosh?.fullName?.en) candidates.push(nameObj.macintosh.fullName.en);
          if (nameObj?.windows?.fullName?.en) candidates.push(nameObj.windows.fullName.en);
          if (nameObj?.macintosh?.postScriptName?.en) candidates.push(nameObj.macintosh.postScriptName.en);
          if (nameObj?.windows?.postScriptName?.en) candidates.push(nameObj.windows.postScriptName.en);
          for (const c of candidates) {
            if (typeof c === 'string' && c.trim()) {
              saveManifestEntry(c.trim(), fullPath);
            }
          }
        } catch {}
      }
    }
  }
} catch (e) {}

app.get('/api/projects', (req, res) => {
  try {
    const list: any[] = [];
    if (fs.existsSync(persistentProjectsDir)) {
      const files = fs.readdirSync(persistentProjectsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const raw = fs.readFileSync(path.join(persistentProjectsDir, file), 'utf8');
            const data = JSON.parse(raw);
            if (data && data.id) {
              list.push({
                id: String(data.id),
                name: String(data.name || 'Untitled Fusion'),
                timestamp: Number(data.timestamp) || Date.now()
              });
            }
          } catch {}
        }
      }
    }
    list.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/project/:id', (req, res) => {
  try {
    const id = req.params.id;
    let filePath = path.join(persistentProjectsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return res.type('application/json').send(content);
    }
    const cleanId = id.replace(/\.(fuser|json)$/i, '');
    const altPath = path.join(persistentProjectsDir, `${cleanId}.json`);
    if (fs.existsSync(altPath)) {
      const content = fs.readFileSync(altPath, 'utf8');
      return res.type('application/json').send(content);
    }
    // Scan all project files for ID or name match
    if (fs.existsSync(persistentProjectsDir)) {
      const files = fs.readdirSync(persistentProjectsDir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(persistentProjectsDir, f), 'utf8');
          const p = JSON.parse(raw);
          if (p && (String(p.id) === id || String(p.id) === cleanId || (p.name && p.name.toLowerCase() === id.toLowerCase()))) {
            return res.type('application/json').send(raw);
          }
        } catch {}
      }
    }
    res.status(404).json({ error: 'Project not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download-fuser/:id', (req, res) => {
  try {
    const id = req.params.id;
    let filePath = path.join(persistentProjectsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      const cleanId = id.replace(/\.(fuser|json)$/i, '');
      const altPath = path.join(persistentProjectsDir, `${cleanId}.json`);
      if (fs.existsSync(altPath)) filePath = altPath;
    }

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      let projectName = id;
      try {
        const parsed = JSON.parse(content);
        projectName = parsed.name || id;
      } catch {}
      const safeName = projectName.replace(/\.(fuser|json)$/i, '').replace(/["\r\n\\/:]/g, '_') + '.fuser';
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
      return res.send(content);
    }
    res.status(404).send('Project file not found');
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

app.post('/api/export-fuser', express.json({ limit: '250mb' }), (req, res) => {
  try {
    const { name, data, project } = req.body || {};
    const payload = data || project || req.body;
    if (!payload) {
      return res.status(400).json({ error: 'No project data provided to export' });
    }
    const cleanId = String(payload.id || `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).trim();
    payload.id = cleanId;
    const projName = (name || payload.name || cleanId || 'fusion-project').replace(/\.(fuser|json)$/i, '').replace(/["\r\n\\/:]/g, '_') + '.fuser';
    const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    
    // Always persist to user_projects
    try {
      const filePath = path.join(persistentProjectsDir, `${cleanId}.json`);
      fs.writeFileSync(filePath, jsonStr, 'utf8');
    } catch (saveErr) {
      console.warn('Failed to save export to disk:', saveErr);
    }

    // Extract and cache all font dataUrls into persistentFontsDir
    if (payload.fonts && Array.isArray(payload.fonts)) {
      for (const f of payload.fonts) {
        if (!f) continue;
        const fontId = String(f.id || '');
        const fileName = f.fileName || `${f.name || 'font'}.ttf`;
        let buf: Buffer | null = null;
        if (f.dataUrl && typeof f.dataUrl === 'string') {
          const comma = f.dataUrl.indexOf(',');
          const b64 = comma !== -1 ? f.dataUrl.slice(comma + 1) : f.dataUrl;
          try { buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64'); } catch {}
        }
        if (buf && buf.length > 0) {
          const saveName = fontId ? `${fontId}.ttf` : fileName;
          const pPath = path.join(persistentFontsDir, saveName);
          try {
            fs.writeFileSync(pPath, buf);
            if (fontId) saveManifestEntry(fontId, pPath);
            if (fileName) saveManifestEntry(fileName, pPath);
            if (f.name) saveManifestEntry(f.name, pPath);
          } catch {}
        }
      }
    }

    if (req.query.format === 'json') {
      return res.json({
        success: true,
        downloadUrl: `/api/download-fuser/${encodeURIComponent(cleanId)}`,
        filename: projName,
        id: cleanId
      });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${projName}"; filename*=UTF-8''${encodeURIComponent(projName)}`);
    return res.send(jsonStr);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/save-project', (req, res) => {
  try {
    const project = req.body;
    if (!project || !project.id) {
      return res.status(400).json({ error: 'Project data or id missing' });
    }
    const filePath = path.join(persistentProjectsDir, `${project.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(project), 'utf8');

    // Cache font files onto disk if they have dataUrl or buffer
    if (Array.isArray(project.fonts)) {
      for (const f of project.fonts) {
        if (!f) continue;
        const fontId = String(f.id || '');
        const fileName = f.fileName || `${f.name || 'font'}.ttf`;
        let buf: Buffer | null = null;
        if (f.dataUrl && typeof f.dataUrl === 'string') {
          const comma = f.dataUrl.indexOf(',');
          const b64 = comma !== -1 ? f.dataUrl.slice(comma + 1) : f.dataUrl;
          try { buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64'); } catch {}
        }
        if (buf && buf.length > 0) {
          const saveName = fontId ? `${fontId}.ttf` : fileName;
          const pPath = path.join(persistentFontsDir, saveName);
          fs.writeFileSync(pPath, buf);
          if (fontId) saveManifestEntry(fontId, pPath);
          if (fileName) saveManifestEntry(fileName, pPath);
          if (f.name) saveManifestEntry(f.name, pPath);
        }
      }
    }

    res.json({ success: true, id: project.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/project/:id', (req, res) => {
  try {
    const id = req.params.id;
    const filePath = path.join(persistentProjectsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});



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





const { parseSVG, makeAbsolute } = svgPathParser;



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

    const requestedMode = (req.body.mode || req.query.mode || 'black').toString().toLowerCase();
    const shouldInvert = req.body.invert === 'true' || req.body.invert === true || req.query.invert === 'true' || requestedMode === 'white';
    const thresholdVal = Math.min(254, Math.max(1, Number(req.body.threshold || req.query.threshold) || 128));

    potrace.trace(req.file.path, {
      threshold: thresholdVal,
      optCurve: true,
      turdSize: 20,
      optTolerance: 1.5,
      invert: shouldInvert
    }, (err, svg) => {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      
      if (err || !svg) {
        console.error('Potrace error:', err);
        return res.status(500).json({ error: 'Failed to trace image' });
      }
      
      const match = svg.match(/d="([^"]+)"/);
      const pathData = match ? match[1] : '';
      const wMatch = svg.match(/width="([0-9.]+)(pt|px)?"/);
      const hMatch = svg.match(/height="([0-9.]+)(pt|px)?"/);
      const width = wMatch ? parseFloat(wMatch[1]) : 400;
      const height = hMatch ? parseFloat(hMatch[1]) : 400;
      return res.json({ pathData, width, height });
    });
  } catch (err: any) {
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch (e) {}
    console.error('Unexpected error in /api/trace:', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});


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
    const rawBuf = fs.readFileSync(req.file.path);
    const fn = typeof ttc2ttf === 'function' ? ttc2ttf : (ttc2ttf as any).default;
    const ttfs = fn(rawBuf);
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    if (!ttfs || ttfs.length === 0) {
      return res.status(500).json({ error: 'No fonts found in TTC' });
    }
    res.setHeader('Content-Type', 'font/ttf');
    return res.send(Buffer.from(ttfs[0]));
  } catch (err: any) {
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch (e) {}
    console.error("TTC unpack error:", err);
    res.status(500).json({ error: 'Failed to unpack TTC' });
  }
});


app.get('/api/get-cached-font', (req, res) => {
  try {
    const name = ((req.query.name as string) || '').trim();
    const id = ((req.query.id as string) || '').trim();
    const fontName = ((req.query.fontName as string) || '').trim();
    
    const rawCandidates = [id, name, fontName, path.parse(name).name, path.parse(fontName).name].filter(Boolean);
    const candidates = Array.from(new Set(rawCandidates));
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normCandidates = candidates.map(c => norm(c)).filter(c => c.length >= 2);

    // 1. In-memory server map lookup
    for (const c of candidates) {
      if (serverFontNameCache.has(c)) {
        const p = serverFontNameCache.get(c)!;
        try {
          if (fs.existsSync(p) && fs.statSync(p).size > 100) return res.sendFile(p);
        } catch {}
      }
      if (serverFontNameCache.has(c.toLowerCase())) {
        const p = serverFontNameCache.get(c.toLowerCase())!;
        try {
          if (fs.existsSync(p) && fs.statSync(p).size > 100) return res.sendFile(p);
        } catch {}
      }
      const nc = norm(c);
      if (nc && serverFontNameCache.has(nc)) {
        const p = serverFontNameCache.get(nc)!;
        try {
          if (fs.existsSync(p) && fs.statSync(p).size > 100) return res.sendFile(p);
        } catch {}
      }
    }

    const isFontMatch = (filename: string): boolean => {
      const lower = filename.toLowerCase();
      const baseName = path.parse(filename).name.toLowerCase();
      const normFile = norm(baseName);
      for (const c of candidates) {
        const clower = c.toLowerCase();
        if (filename === c || lower === clower || baseName === clower) return true;
      }
      for (const nc of normCandidates) {
        if (normFile === nc) return true;
        if (nc.length >= 3 && (normFile.includes(nc) || nc.includes(normFile))) return true;
        if (nc.includes('pingfang') && normFile.includes('pingfang')) return true;
      }
      return false;
    };

    // 2. Search persistentFontsDir
    if (fs.existsSync(persistentFontsDir)) {
      const pFiles = fs.readdirSync(persistentFontsDir);
      for (const f of pFiles) {
        const full = path.join(persistentFontsDir, f);
        try {
          if (fs.statSync(full).size > 100 && isFontMatch(f)) {
            return res.sendFile(full);
          }
        } catch {}
      }
    }

    // 3. Search uploadDir
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const f of files) {
        if (f === 'manifest.json') continue;
        const full = path.join(uploadDir, f);
        try {
          if (fs.statSync(full).size > 100 && isFontMatch(f)) {
            return res.sendFile(full);
          }
        } catch {}
      }
    }

    // 4. Deep fallback: check persistentProjectsDir for matching font buffer / dataUrl
    if (fs.existsSync(persistentProjectsDir)) {
      const projFiles = fs.readdirSync(persistentProjectsDir);
      for (const pFile of projFiles) {
        if (!pFile.endsWith('.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(persistentProjectsDir, pFile), 'utf8');
          const proj = JSON.parse(raw);
          if (proj && Array.isArray(proj.fonts)) {
            for (const pf of proj.fonts) {
              if (!pf) continue;
              const pfMatches = candidates.some(c => 
                (pf.id && String(pf.id).toLowerCase() === c.toLowerCase()) ||
                (pf.name && String(pf.name).toLowerCase() === c.toLowerCase()) ||
                (pf.fileName && String(pf.fileName).toLowerCase() === c.toLowerCase()) ||
                (norm(c).length >= 3 && (norm(pf.name).includes(norm(c)) || norm(pf.fileName).includes(norm(c)))) ||
                (norm(c).includes('pingfang') && (norm(pf.name).includes('pingfang') || norm(pf.fileName).includes('pingfang')))
              );
              if (pfMatches) {
                let buf: Buffer | null = null;
                if (pf.dataUrl && typeof pf.dataUrl === 'string') {
                  const comma = pf.dataUrl.indexOf(',');
                  const b64 = comma !== -1 ? pf.dataUrl.slice(comma + 1) : pf.dataUrl;
                  buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
                } else if (pf.buffer && typeof pf.buffer === 'object') {
                  if (pf.buffer.type === 'Buffer' && Array.isArray(pf.buffer.data)) {
                    buf = Buffer.from(pf.buffer.data);
                  } else if (Array.isArray(pf.buffer)) {
                    buf = Buffer.from(pf.buffer);
                  }
                } else if (pf.data && typeof pf.data === 'string') {
                  buf = Buffer.from(pf.data.replace(/\s+/g, ''), 'base64');
                }

                if (buf && buf.length > 100) {
                  const saveName = pf.id ? `${pf.id}.ttf` : (pf.fileName || `${Date.now()}.ttf`);
                  const pPath = path.join(persistentFontsDir, saveName);
                  try {
                    fs.writeFileSync(pPath, buf);
                    saveManifestEntry(saveName, pPath);
                    if (pf.id) saveManifestEntry(pf.id, pPath);
                    if (pf.fileName) saveManifestEntry(pf.fileName, pPath);
                    if (pf.name) saveManifestEntry(pf.name, pPath);
                  } catch {}
                  return res.sendFile(pPath);
                }
              }
            }
          }
        } catch {}
      }
    }

    // 5. Final fallback: if persistentFontsDir has any valid font files (>1000 bytes)
    if (fs.existsSync(persistentFontsDir)) {
      const fontFiles = fs.readdirSync(persistentFontsDir)
        .filter(f => f.endsWith('.ttf') || f.endsWith('.otf') || f.endsWith('.woff') || f.endsWith('.woff2') || f.endsWith('.ttc'))
        .filter(f => {
          try { return fs.statSync(path.join(persistentFontsDir, f)).size > 1000; } catch { return false; }
        });
      if (fontFiles.length > 0) {
        return res.sendFile(path.join(persistentFontsDir, fontFiles[0]));
      }
    }

    res.status(404).json({ error: 'Not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cache-font', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
  try {
    const id = ((req.query.id || req.headers['x-font-id']) as string || '').trim();
    const name = ((req.query.name || req.headers['x-font-name']) as string || '').trim();
    const fileName = ((req.query.filename || req.headers['x-font-filename']) as string || '').trim();
    
    if (!req.body || (req.body as Buffer).length === 0) {
      return res.status(400).json({ error: 'No data provided' });
    }
    
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    const saveName = id ? `${id}.ttf` : (fileName || `${Date.now()}.ttf`);
    const pPath = path.join(persistentFontsDir, saveName);
    fs.writeFileSync(pPath, buffer);
    
    if (id) saveManifestEntry(id, pPath);
    if (name) saveManifestEntry(name, pPath);
    if (fileName) saveManifestEntry(fileName, pPath);
    
    res.json({ success: true, saved: saveName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/check-uploaded-fonts', (req, res) => {
  try {
    const { serverFontIds, fontList } = req.body || {};
    const existing: Record<string, string> = {};

    const findOnServer = (clientId: string, name?: string, fileName?: string): string | null => {
      // 1. Check uploadDir if serverFontIds gave a direct filename
      if (serverFontIds && serverFontIds[clientId]) {
        const uFile = path.join(uploadDir, serverFontIds[clientId]);
        if (fs.existsSync(uFile) && fs.statSync(uFile).size > 100) return serverFontIds[clientId];
      }

      // 2. Build candidate filenames
      const rawCandidates = [
        clientId ? `${clientId}.ttf` : '',
        clientId ? `${clientId}.otf` : '',
        clientId ? `${clientId}.woff` : '',
        clientId ? `${clientId}.woff2` : '',
        fileName || '',
        name ? `${name}.ttf` : '',
        name ? `${name}.otf` : '',
        clientId || '',
        name || ''
      ].filter(Boolean);

      for (const cand of rawCandidates) {
        // Check server cache map
        if (serverFontNameCache.has(cand)) {
          const p = serverFontNameCache.get(cand)!;
          if (fs.existsSync(p) && fs.statSync(p).size > 100) {
            const stagedName = path.basename(p);
            const targetUpload = path.join(uploadDir, stagedName);
            if (!fs.existsSync(targetUpload)) {
              try { fs.copyFileSync(p, targetUpload); } catch {}
            }
            return stagedName;
          }
        }
        if (serverFontNameCache.has(cand.toLowerCase())) {
          const p = serverFontNameCache.get(cand.toLowerCase())!;
          if (fs.existsSync(p) && fs.statSync(p).size > 100) {
            const stagedName = path.basename(p);
            const targetUpload = path.join(uploadDir, stagedName);
            if (!fs.existsSync(targetUpload)) {
              try { fs.copyFileSync(p, targetUpload); } catch {}
            }
            return stagedName;
          }
        }

        // Check persistentFontsDir directly
        const pPath = path.join(persistentFontsDir, cand);
        if (fs.existsSync(pPath) && fs.statSync(pPath).size > 100) {
          const targetUpload = path.join(uploadDir, cand);
          if (!fs.existsSync(targetUpload)) {
            try { fs.copyFileSync(pPath, targetUpload); } catch {}
          }
          return cand;
        }

        // Check uploadDir directly
        const uPath = path.join(uploadDir, cand);
        if (fs.existsSync(uPath) && fs.statSync(uPath).size > 100) {
          return cand;
        }
      }

      return null;
    };

    if (Array.isArray(fontList)) {
      for (const item of fontList) {
        if (!item || !item.id) continue;
        const found = findOnServer(item.id, item.name, item.fileName);
        if (found) existing[item.id] = found;
      }
    }

    if (serverFontIds && typeof serverFontIds === 'object') {
      for (const [clientId, filename] of Object.entries(serverFontIds)) {
        if (!existing[clientId]) {
          const found = findOnServer(clientId, undefined, filename as string);
          if (found) existing[clientId] = found;
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
    writeStream.on('finish', () => {
      if (clientId) saveManifestEntry(clientId, targetPath);
      if (name) saveManifestEntry(name, targetPath);
      res.json({ fontId: filename, clientId });
    });
    writeStream.on('error', (err) => {
      console.error('upload-font-raw write stream error:', err);
      res.status(500).json({ error: err.message });
    });
    req.on('error', (err) => {
      console.error('upload-font-raw req stream error:', err);
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
    if (store.originalName) {
      saveManifestEntry(store.originalName, finalPath);
      saveManifestEntry(path.parse(store.originalName).name, finalPath);
      try {
        fs.copyFileSync(finalPath, path.join(persistentFontsDir, store.originalName));
      } catch (e) {}
    }
    saveManifestEntry(filename, finalPath);
    try {
      fs.copyFileSync(finalPath, path.join(persistentFontsDir, filename));
    } catch (e) {}

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
  
  const originalName = req.file.originalname || (req.body && req.body.originalName);
  const fontId = (req.body && req.body.fontId) || req.file.filename;

  if (originalName) {
    saveManifestEntry(originalName, req.file.path);
    saveManifestEntry(path.parse(originalName).name, req.file.path);
    try {
      fs.copyFileSync(req.file.path, path.join(persistentFontsDir, originalName));
    } catch (e) {}
  }
  if (fontId) {
    saveManifestEntry(fontId, req.file.path);
    try {
      fs.copyFileSync(req.file.path, path.join(persistentFontsDir, fontId));
    } catch (e) {}
  }
  saveManifestEntry(req.file.filename, req.file.path);
  try {
    fs.copyFileSync(req.file.path, path.join(persistentFontsDir, req.file.filename));
  } catch (e) {}

  res.json({ fontId: req.file.filename });
});




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
    req.setTimeout(900000);
    res.setTimeout(900000);
    console.log("Received /api/fuse-by-ids request");
    const { glyphMap, baseFontId, serverFontIds } = req.body;
    if (!glyphMap || !serverFontIds || !baseFontId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const baseServerFilename = serverFontIds[baseFontId];
    if (!baseServerFilename) {
      return res.status(400).json({ error: 'Base font not found in uploaded fonts' });
    }
    const stageFontIfInPersistent = (fname: string) => {
      if (!fname) return;
      const target = path.join(uploadDir, fname);
      if (!fs.existsSync(target)) {
        const fromP = path.join(persistentFontsDir, fname);
        if (fs.existsSync(fromP)) {
          try { fs.copyFileSync(fromP, target); } catch {}
        }
      }
    };

    stageFontIfInPersistent(baseServerFilename);
    for (const fn of Object.values(serverFontIds)) {
      if (typeof fn === 'string') stageFontIfInPersistent(fn);
    }

    const baseFilePath = path.join(uploadDir, baseServerFilename);
    if (!fs.existsSync(baseFilePath)) {
      return res.status(400).json({ error: 'Base font file not found on server storage' });
    }
        
    const jobId = crypto.randomUUID();
    activeJobs.set(jobId, { status: 'progress', message: 'Starting...' });
    
    // Spawn worker with container-safe memory limits (2048MB prevents Linux OOM SIGKILL)
    const workerPath = path.join(process.cwd(), 'fuseWorker.cjs');  
    if (global.gc) global.gc();
    const worker = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=2048', '--expose-gc'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=2048 --expose-gc'
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
        activeJobs.set(jobId, {
          status: 'progress',
          message: msg.message,
          percent: typeof msg.percent === 'number' ? msg.percent : undefined
        });
      } else if (msg.type === 'done') {
        console.log("Worker done. Saving job:", jobId);
        activeJobs.set(jobId, {
          status: 'done',
          file: msg.file,
          originalName: msg.originalName,
          percent: 100,
          serverFontIds
        });
      } else if (msg.type === 'error') {
        console.error("Worker error:", msg.message, msg.stack || '');
        activeJobs.set(jobId, { status: 'error', message: msg.message });
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

app.post('/api/convert-save-to-ttf', express.json({ limit: '100mb' }), async (req, res) => {
  try {
    req.setTimeout(300000);
    res.setTimeout(300000);
    console.log("Received /api/convert-save-to-ttf request");
    let { saveFile, projectId } = req.body || {};

    if (!saveFile && projectId) {
      const pPath = path.join(persistentProjectsDir, `${projectId}.json`);
      if (fs.existsSync(pPath)) {
        try {
          saveFile = JSON.parse(fs.readFileSync(pPath, 'utf8'));
        } catch (e) {}
      }
    }

    if (!saveFile) {
      return res.status(400).json({ error: 'Missing save file data or project ID' });
    }

    const rawFonts = saveFile.fonts || (Array.isArray(saveFile) ? saveFile : (saveFile.saved?.fonts || []));
    const glyphMap = saveFile.glyphMap || saveFile.saved?.glyphMap || {};
    const projectName = (saveFile.name || saveFile.saved?.name || 'FusedFont').replace(/\.(fuser|json|ttf|otf)$/i, '').trim() || 'FusedFont';

    if (!Array.isArray(rawFonts) || rawFonts.length === 0) {
      return res.status(400).json({ error: 'Save file does not contain any fonts to convert' });
    }

    const baseFont = rawFonts[0];
    const neededFontIds = new Set(Object.values(glyphMap).map(String));
    neededFontIds.add(String(baseFont.id));

    // Only process the base font and fonts that actually have mapped glyphs (fast!)
    const fontsToProcess = rawFonts.filter(f => f && (String(f.id) === String(baseFont.id) || neededFontIds.has(String(f.id))));
    const serverFontIds: Record<string, string> = {};

    for (const font of fontsToProcess) {
      const fontId = String(font.id || '');
      const fileName = font.fileName || `${font.name || 'font'}.ttf`;

      let targetPath = '';
      let buf: Buffer | null = null;

      // 1. Direct buffer or dataUrl from the save file (most authoritative)
      if (font.dataUrl && typeof font.dataUrl === 'string') {
        const comma = font.dataUrl.indexOf(',');
        const b64 = comma !== -1 ? font.dataUrl.slice(comma + 1) : font.dataUrl;
        try { buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64'); } catch (e) {}
      } else if (font.buffer) {
        try {
          if (Buffer.isBuffer(font.buffer)) {
            buf = font.buffer;
          } else if (font.buffer && Array.isArray(font.buffer.data)) {
            buf = Buffer.from(font.buffer.data);
          } else if (typeof font.buffer === 'string') {
            const cleanStr = font.buffer.replace(/\s+/g, '');
            buf = Buffer.from(cleanStr, 'base64');
          } else if (font.buffer instanceof ArrayBuffer || ArrayBuffer.isView(font.buffer)) {
            buf = Buffer.from(font.buffer);
          } else if (typeof font.buffer === 'object') {
            const vals = Object.values(font.buffer);
            if (vals.length > 0 && typeof vals[0] === 'number') {
              buf = Buffer.from(vals as number[]);
            }
          }
        } catch (e) {}
      } else if (font.data && typeof font.data === 'string') {
        try { buf = Buffer.from(font.data.replace(/\s+/g, ''), 'base64'); } catch (e) {}
      }

      if (buf && buf.length > 0) {
        // Automatically unpack TTC collections so worker parses cleanly
        if (buf.length >= 4 && buf.readUInt32BE(0) === 0x74746366) {
          try {
            const fn = typeof ttc2ttf === 'function' ? ttc2ttf : (ttc2ttf as any).default;
            const ttfs = fn(buf);
            if (ttfs && ttfs.length > 0) {
              buf = Buffer.from(ttfs[0]);
            }
          } catch (e) {}
        }
        const tmpName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.ttf`;
        const savePath = path.join(uploadDir, tmpName);
        fs.writeFileSync(savePath, buf);
        targetPath = savePath;
        saveManifestEntry(fontId, savePath);
        saveManifestEntry(fileName, savePath);
        if (font.name) saveManifestEntry(font.name, savePath);
      }

      // 2. Fall back to cache on disk if save file only had metadata
      if (!targetPath) {
        if (serverFontNameCache.has(fontId) && fs.existsSync(serverFontNameCache.get(fontId)!)) {
          targetPath = serverFontNameCache.get(fontId)!;
        } else if (serverFontNameCache.has(fileName) && fs.existsSync(serverFontNameCache.get(fileName)!)) {
          targetPath = serverFontNameCache.get(fileName)!;
        } else if (font.name && serverFontNameCache.has(font.name) && fs.existsSync(serverFontNameCache.get(font.name)!)) {
          targetPath = serverFontNameCache.get(font.name)!;
        } else if (fs.existsSync(path.join(persistentFontsDir, fontId))) {
          targetPath = path.join(persistentFontsDir, fontId);
        } else if (fs.existsSync(path.join(persistentFontsDir, fileName))) {
          targetPath = path.join(persistentFontsDir, fileName);
        } else if (fs.existsSync(persistentFontsDir)) {
          // Fuzzy search persistentFontsDir
          const pFiles = fs.readdirSync(persistentFontsDir);
          const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const targetNorm = norm(font.name || fileName || fontId);
          for (const pf of pFiles) {
            try {
              if (fs.statSync(path.join(persistentFontsDir, pf)).size > 100) {
                const pfn = norm(pf);
                if (pfn === targetNorm || (targetNorm.length >= 3 && (pfn.includes(targetNorm) || targetNorm.includes(pfn)))) {
                  targetPath = path.join(persistentFontsDir, pf);
                  break;
                }
              }
            } catch {}
          }
        }
      }

      if (targetPath) {
        const destInUpload = path.join(uploadDir, path.basename(targetPath));
        if (!fs.existsSync(destInUpload) && fs.existsSync(targetPath)) {
          try { fs.copyFileSync(targetPath, destInUpload); } catch (e) {}
        }
        serverFontIds[fontId] = path.basename(targetPath);
      }
    }

    if (!serverFontIds[String(baseFont.id)]) {
      return res.status(400).json({ error: `Base font "${baseFont.name || baseFont.fileName}" binary data not found in save file` });
    }

    const jobId = crypto.randomUUID();
    const outputTtfName = `${projectName}.ttf`;
    activeJobs.set(jobId, { status: 'progress', message: 'Converting save file to TTF...', percent: 5, originalName: outputTtfName });

    // Spawn high-speed worker with container-safe memory limits
    const workerPath = path.join(process.cwd(), 'fuseWorker.cjs');
    if (global.gc) global.gc();
    const worker = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=2048', '--expose-gc'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=2048 --expose-gc'
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    let workerStderr = '';
    if (worker.stderr) {
      worker.stderr.on('data', (data) => {
        workerStderr += data.toString();
      });
    }

    worker.send({
      glyphMap,
      baseFontId: String(baseFont.id),
      serverFontIds,
      uploadDir
    });

    worker.on('message', (msg: any) => {
      if (msg.type === 'progress') {
        activeJobs.set(jobId, {
          status: 'progress',
          message: msg.message,
          percent: typeof msg.percent === 'number' ? msg.percent : undefined,
          originalName: outputTtfName
        });
      } else if (msg.type === 'done') {
        activeJobs.set(jobId, {
          status: 'done',
          file: msg.file,
          originalName: outputTtfName,
          percent: 100
        });
      } else if (msg.type === 'error') {
        activeJobs.set(jobId, { status: 'error', message: msg.message, originalName: outputTtfName });
      }
    });

    worker.on('error', (err) => {
      activeJobs.set(jobId, { status: 'error', message: String(err), originalName: outputTtfName });
    });

    worker.on('exit', (code, signal) => {
      if (code !== 0) {
        const cur = activeJobs.get(jobId);
        if (cur && cur.status !== 'done' && cur.status !== 'error') {
          activeJobs.set(jobId, { status: 'error', message: `Worker exited with code ${code}`, originalName: outputTtfName });
        }
      }
    });

    res.json({ jobId, filename: outputTtfName });
  } catch (err: any) {
    console.error("Save to TTF converter error:", err);
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
  const msg = typeof req.body?.message === 'string' ? req.body.message : '';
  const stk = typeof req.body?.stack === 'string' ? req.body.stack : '';
  if (msg.includes('WebSocket') || msg.includes('websocket') || stk.includes('@vite/client')) {
    return res.send('ok');
  }
  console.error('Client Error:', req.body.message, req.body.stack);
  try {
    fs.appendFileSync('/tmp/client-errors.log', new Date().toISOString() + ' Client Error: ' + req.body.message + '\n' + req.body.stack + '\n\n');
  } catch {}
  res.send('ok');
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'));
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
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

  // Keep-alive and socket timeouts aligned to prevent socket reset or 20-30s disconnects
  server.timeout = 300000;
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
  server.requestTimeout = 300000;
}

startServer();
