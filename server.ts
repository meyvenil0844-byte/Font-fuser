import { Worker } from 'worker_threads';
import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import opentype from 'opentype.js';
import { createServer as createViteServer } from 'vite';
import { injectApplyPolyfill } from './src/lib/applyPolyfill.ts';

injectApplyPolyfill();

const app = express();
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
const PORT = 3000;

app.get('/api/download-fused', (req, res) => {
  const filePathTTF = path.join(os.tmpdir(), 'fontfuser-uploads', 'FusedFont.ttf');
  const filePathOTF = path.join(os.tmpdir(), 'fontfuser-uploads', 'FusedFont.otf');
  if (fs.existsSync(filePathTTF)) {
    res.download(filePathTTF, 'FusedFont.ttf');
  } else if (fs.existsSync(filePathOTF)) {
    res.download(filePathOTF, 'FusedFont.otf');
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
} else {
  try {
    fs.readdirSync(uploadDir).forEach(f => fs.unlinkSync(path.join(uploadDir, f)));
  } catch(e) {}
}
const upload = multer({ 
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024, fieldSize: 100 * 1024 * 1024 }
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
  
  if (req.file.originalname.toLowerCase().endsWith('.svg')) {
    const svgStr = fs.readFileSync(req.file.path, 'utf8');
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    
    // Attempt to extract the first path or polygon
    // Just a crude extraction
    let pathData = '';
    const match = svgStr.match(/<path[^>]*d="([^"]+)"/i);
    if (match) {
      pathData = match[1];
    } else {
      // try to get it from polygon or something?
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
    
    try { return res.json({ commands: makeAbsolute(parseSVG(pathData)), width: w, height: h }); } catch(e) { return res.json({ commands: [], width: w, height: h }); }
  }

  Jimp.read(req.file.path, (err, image) => {

    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to read image' });
    }
    if (image.bitmap.width > 400 || image.bitmap.height > 400) {
      image.scaleToFit(400, 400);
    }
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    potrace.trace(image, { threshold: 128, optCurve: true, turdSize: 20, optTolerance: 1.5 }, (err, svg) => {
      // cleanup
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to trace image' });
      }
      
      const match = svg.match(/d="([^"]+)"/);
      const pathData = match ? match[1] : '';
      res.json({ pathData, width, height });
    });
  });
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
    ttc2ttf(req.file.path, distPath);
    
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

app.post('/api/fuse-by-ids', async (req, res) => {
  try {
    console.log("Received /api/fuse-by-ids request");
    const { glyphMap, baseFontId, serverFontIds } = req.body;
    if (!glyphMap || !serverFontIds || !baseFontId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
        
    const jobId = crypto.randomUUID();
    activeJobs.set(jobId, { status: 'progress', message: 'Starting...' });
    
    // Spawn worker
    const workerPath = path.join(process.cwd(), 'fuseWorker.cjs');  
    const worker = new Worker(workerPath, {
      workerData: {
        glyphMap,
        baseFontId,
        serverFontIds,
        uploadDir
      }
    });
    
    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        console.log("Worker progress:", msg.message);
        activeJobs.set(jobId, { status: 'progress', message: msg.message });
      } else if (msg.type === 'done') {
        console.log("Worker done. Saving job:", jobId);
        activeJobs.set(jobId, { status: 'done', file: msg.file, originalName: msg.originalName, serverFontIds });
      } else if (msg.type === 'error') {
        console.error("Worker error:", msg.message);
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
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code}`);
        const currentJob = activeJobs.get(jobId);
        if (currentJob && currentJob.status !== 'done' && currentJob.status !== 'error') {
            activeJobs.set(jobId, { status: 'error', message: `Worker exited with code ${code}` });
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
  res.json(job);
});

app.get('/api/fuse-download/:jobId', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job || job.status !== 'done') return res.status(400).json({ error: 'Job not ready or not found' });
  
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="' + job.originalName + '"');
  const readStream = fs.createReadStream(job.file);
  readStream.pipe(res);
  readStream.on('end', () => {
    try { fs.unlinkSync(job.file); } catch (e) {}
    try {
      if (job.serverFontIds) {
        Object.values(job.serverFontIds).forEach((f: any) => {
          try { fs.unlinkSync(path.join(uploadDir, f)); } catch(e){}
        });
      }
    } catch(e) {}
    activeJobs.delete(req.params.jobId);
  });
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

  app.use((err, req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.error("API Error caught:", err);
      res.status(err.status || 500).json({ error: err.message || String(err) });
    } else {
      next(err);
    }
  });

  
app.post('/api/log-error', express.json(), (req, res) => {
  console.error('Client Error:', req.body.message, req.body.stack);
  res.send('ok');
});
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
