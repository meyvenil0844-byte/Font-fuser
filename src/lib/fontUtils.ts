import * as opentype from 'opentype.js';
import type { UploadedFont, GlyphMapping } from '../types';



function fastParseSVG(pathStr: string) {
  const commands = [];
  const regex = /([MLCZ])([^MLCZ]*)/ig;
  let match;
  while ((match = regex.exec(pathStr)) !== null) {
    const type = match[1].toUpperCase();
    if (type === 'Z') {
       commands.push({ code: 'Z' });
       continue;
    }
    const argsStr = match[2].trim();
    if (!argsStr) continue;
    const args = argsStr.split(/[\s,]+/).map(Number);
    let i = 0;
    while (i < args.length) {
      if (type === 'M' || type === 'L') {
        if (i + 1 < args.length) {
          commands.push({ code: type, x: args[i], y: args[i+1] });
          i += 2;
        } else break;
      } else if (type === 'C') {
        if (i + 5 < args.length) {
          commands.push({ code: 'C', x1: args[i], y1: args[i+1], x2: args[i+2], y2: args[i+3], x: args[i+4], y: args[i+5] });
          i += 6;
        } else break;
      } else {
        break;
      }
    }
  }
  return commands;
}


async function downscaleImage(file: File, maxSize: number = 800): Promise<File> {
  if (file.type === 'image/svg+xml') return file;
  
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let width = img.width;
      let height = img.height;
      
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
      } else {
        return resolve(file);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name.replace(/\\.[^/.]+$/, "") + ".png", { type: 'image/png' }));
        } else {
          resolve(file);
        }
      }, 'image/png', 0.9);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export async function traceImageToFont(file: File, fileName: string, cps: number[]): Promise<UploadedFont> {
  file = await downscaleImage(file);
  if (file.size > 100 * 1024 * 1024) {
    throw new Error(`Image is too large (${(file.size/1024/1024).toFixed(1)}MB). The limit is 100MB.`);
  }
  const formData = new FormData();
  formData.append('image', file);
  
  const response = await fetch('/api/trace', {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error('Failed to trace image: HTTP ' + response.status + ' ' + text.substring(0, 100));
  }
  
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('Server returned invalid data (possibly file too large or server error). HTTP ' + response.status + ' Content: ' + text.substring(0, 100));
  }
  let { commands, pathData, width, height } = data;
  if (pathData && !commands) {
    commands = fastParseSVG(pathData);
  }
  
  if (commands && commands.length > 25000) {
    throw new Error('Image is too complex, over 25,000 path commands. Please use a simpler cleaner image.');
  }
  if (!commands || commands.length === 0) {
    throw new Error('No outline detected in the image. Please upload an image with higher contrast or black shapes.');
  }
  
  const notdefPath = new opentype.Path();
  notdefPath.moveTo(100, 100);
  notdefPath.lineTo(400, 100);
  notdefPath.lineTo(400, 800);
  notdefPath.lineTo(100, 800);
  notdefPath.close();
  const notdef = new opentype.Glyph({ name: '.notdef', unicode: undefined, advanceWidth: 500, path: notdefPath });

  
  const EM = 1000;
  const maxDim = Math.max(1, Math.max(width, height));
  const scale = EM / maxDim;
  const offsetX = 0; // Glyph starts exactly at X=0
  const offsetY = (EM - (height * scale)) / 2;
  const newPath = new opentype.Path();
  
  if (commands.length > 25000) {
    throw new Error('Image is too complex (over 25,000 path commands). Please use a simpler, cleaner image.');
  }
  const rawCommands = [];
  for (const cmd of commands) {
    const type = cmd.code ? cmd.code.toUpperCase() : 'Z';
    const num = (v) => isNaN(v) ? 0 : v;
    if (type === 'M') rawCommands.push({ type: 'M', x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
    else if (type === 'L') rawCommands.push({ type: 'L', x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
    else if (type === 'Q') rawCommands.push({ type: 'Q', x1: Math.round(num(offsetX + cmd.x1 * scale)), y1: Math.round(num(offsetY + (height * scale - (cmd.y1 * scale)))) - 200, x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
    else if (type === 'C') rawCommands.push({ type: 'C', x1: Math.round(num(offsetX + cmd.x1 * scale)), y1: Math.round(num(offsetY + (height * scale - (cmd.y1 * scale)))) - 200, x2: Math.round(num(offsetX + cmd.x2 * scale)), y2: Math.round(num(offsetY + (height * scale - (cmd.y2 * scale)))) - 200, x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
    else if (type === 'Z') rawCommands.push({ type: 'Z' });
  }

  const subpaths = [];
  let currentSubpath = [];
  for (const cmd of rawCommands) {
    if (cmd.type === 'M' && currentSubpath.length > 0) {
      subpaths.push(currentSubpath);
      currentSubpath = [];
    }
    currentSubpath.push(cmd);
    if (cmd.type === 'Z') {
      subpaths.push(currentSubpath);
      currentSubpath = [];
    }
  }
  if (currentSubpath.length > 0) subpaths.push(currentSubpath);

  const getBounds = (cmds) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of cmds) {
      if (cmd.x !== undefined) {
        if (cmd.x < minX) minX = cmd.x;
        if (cmd.x > maxX) maxX = cmd.x;
      }
      if (cmd.y !== undefined) {
        if (cmd.y < minY) minY = cmd.y;
        if (cmd.y > maxY) maxY = cmd.y;
      }
    }
    return { minX, minY, maxX, maxY };
  };

  const reverseSubpath = (cmds) => {
    if (cmds.length === 0) return [];
    const reversed = [];
    let startCmd = cmds[0];
    let lastCmd = cmds.length > 1 ? cmds[cmds.length - 2] : startCmd;
    if (cmds[cmds.length - 1].type !== 'Z') lastCmd = cmds[cmds.length - 1];
    let lastX = lastCmd.x !== undefined ? lastCmd.x : startCmd.x;
    let lastY = lastCmd.y !== undefined ? lastCmd.y : startCmd.y;
    
    reversed.push({ type: 'M', x: lastX, y: lastY });
    for (let i = cmds.length - 1; i > 0; i--) {
      const cmd = cmds[i];
      if (cmd.type === 'Z') continue;
      const prevCmd = cmds[i-1];
      const prevX = prevCmd.x;
      const prevY = prevCmd.y;
      if (cmd.type === 'L') reversed.push({ type: 'L', x: prevX, y: prevY });
      else if (cmd.type === 'Q') reversed.push({ type: 'Q', x1: cmd.x1, y1: cmd.y1, x: prevX, y: prevY });
      else if (cmd.type === 'C') reversed.push({ type: 'C', x1: cmd.x2, y1: cmd.y2, x2: cmd.x1, y2: cmd.y1, x: prevX, y: prevY });
    }
    reversed.push({ type: 'Z' });
    return reversed;
  };

  const isInside = (pt, cmds) => {
    let inside = false;
    let pts = [];
    for (const cmd of cmds) {
      if (cmd.x !== undefined) pts.push({x: cmd.x, y: cmd.y});
    }
    if (pts.length === 0) return false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      let xi = pts[i].x, yi = pts[i].y;
      let xj = pts[j].x, yj = pts[j].y;
      let intersect = ((yi > pt.y) !== (yj > pt.y))
          && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const shoelaceArea = (cmds) => {
    let area = 0;
    let pts = [];
    for (const cmd of cmds) {
      if (cmd.x !== undefined) pts.push({x: cmd.x, y: cmd.y});
    }
    if (pts.length < 3) return 0;
    for (let i = 0; i < pts.length; i++) {
      let j = (i + 1) % pts.length;
      area += (pts[i].x * pts[j].y) - (pts[j].x * pts[i].y);
    }
    return area;
  };


  for (let i = 0; i < subpaths.length; i++) {
    let firstPt = null;
    for (const cmd of subpaths[i]) {
      if (cmd.x !== undefined) { firstPt = {x: cmd.x, y: cmd.y}; break; }
    }
    let nestCount = 0;
    if (firstPt) {
      for (let j = 0; j < subpaths.length; j++) {
        if (i === j) continue;
        const b2 = getBounds(subpaths[j]);
        // Quick bounding box check before expensive raycast
        if (firstPt.x >= b2.minX && firstPt.x <= b2.maxX && firstPt.y >= b2.minY && firstPt.y <= b2.maxY) {
          if (isInside(firstPt, subpaths[j])) nestCount++;
        }
      }
    }
    
    // In CFF fonts, outer contours should be Counter-Clockwise (Area > 0).
    // Inner contours (holes) should be Clockwise (Area < 0).
    // nestCount % 2 === 0 means it's an outer contour.
    let area = shoelaceArea(subpaths[i]);
    let isCCW = area > 0;
    let needsCCW = (nestCount % 2 === 0);
    
    const finalCmds = (isCCW !== needsCCW) ? reverseSubpath(subpaths[i]) : subpaths[i];
    for (const cmd of finalCmds) {
      if (cmd.type === 'M') newPath.moveTo(cmd.x, cmd.y);
      else if (cmd.type === 'L') newPath.lineTo(cmd.x, cmd.y);
      else if (cmd.type === 'Q') newPath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
      else if (cmd.type === 'C') newPath.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      else if (cmd.type === 'Z') newPath.close();
    }
  }
  
  const glyphs = [notdef];
  for (const cp of cps) {
    glyphs.push(new opentype.Glyph({
      name: cp === 0 ? '.null' : ('uni' + cp.toString(16).toUpperCase()),
      unicode: cp,
      advanceWidth: Math.round(width * scale),
      path: newPath
    }));
  }
  
  const font = new opentype.Font({
    familyName: "TracedFont",
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: glyphs,
    // @ts-ignore
    outlinesFormat: 'cff',
    
  });
  
  const buffer = font.toArrayBuffer();
  const fontFile = new File([buffer], fileName + '.ttf', { type: 'font/ttf' });
  const id = crypto.randomUUID();
  
  const fontFace = new FontFace(`FontFuser_${id}`, buffer);
  try {
    await fontFace.load();
    document.fonts.add(fontFace);
  } catch(e) {
    console.warn("Failed to load traced fontface", e);
  }
  
  return {
    id,
    name: file.name,
    fileName: fontFile.name,
    file: fontFile,
    parsed: font,
    fontFamilyName: `FontFuser_${id}`,
    color: '#10b981' // give it a nice color
  };
}

export async function parseFont(file: File): Promise<opentype.Font> {
  const arrayBuffer = await file.arrayBuffer();
  return opentype.parse(arrayBuffer);
}

export function safeStringFromCodePoint(cp: number): string {
  if (cp >= 0xD800 && cp <= 0xDFFF) return ''; 
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

import { generateFusedFontClient } from './fuse';

export async function generateFusedFont(
  baseFontInfo: UploadedFont,
  fonts: UploadedFont[],
  glyphMap: GlyphMapping,
  onProgress?: (msg: string) => void
): Promise<ArrayBuffer> {
  const serverFontIds: Record<string, string> = {};

  const uploadFont = async (font: UploadedFont) => {
    if (!font.file) return;
    if (font.file.size > 100 * 1024 * 1024) {
      throw new Error(`Font ${font.name} is too large (${(font.file.size/1024/1024).toFixed(1)}MB). The server limit is 100MB. If this is a traced font, please delete it and re-trace the image using the updated engine.`);
    }
    const fd = new FormData();
    fd.append('font', font.file);
    const res = await fetch('/api/upload-font', { method: 'POST', body: fd });
    const contentType = res.headers.get('content-type');
    if (!res.ok) {
       if (contentType && contentType.includes('application/json')) {
           const errObj = await res.json().catch(()=>({}));
           throw new Error(errObj.error || `Failed to upload font ${font.name}`);
       } else {
           throw new Error(`Failed to upload font ${font.name}: ${res.statusText}`);
       }
    }
    if (contentType && contentType.includes('text/html')) {
       throw new Error("Server is currently restarting or unavailable. Please wait a moment and try again.");
    }
    const __ct_res = res.headers.get('content-type');
    if (__ct_res && __ct_res.includes('text/html')) {
        const text = await res.text().catch(()=>'');
        throw new Error(`Server returned HTML instead of JSON for ${res.url} (${res.status}). Response: ${text.substring(0, 100)}`);
    }
    const data = await res.json();
    serverFontIds[font.id] = data.fontId;
  };

  if (onProgress) onProgress('Uploading fonts to server...');
  
  const allFontsToUpload = [baseFontInfo];
  for (const font of fonts) {
    if (font.id !== baseFontInfo.id && font.file) {
      allFontsToUpload.push(font);
    }
  }

  // Batch upload in chunks of 50 to avoid any limits
  const BATCH_SIZE = 5; // Reduced from 50 to prevent payload timeouts
  for (let i = 0; i < allFontsToUpload.length; i += BATCH_SIZE) {
    const chunk = allFontsToUpload.slice(i, i + BATCH_SIZE);
    if (onProgress) onProgress(`Uploading fonts ${i+1} to ${Math.min(i + BATCH_SIZE, allFontsToUpload.length)} of ${allFontsToUpload.length}...`);
    
    const fd = new FormData();
    for (const font of chunk) {
      fd.append('fonts', font.file);
    }
    
    const res = await fetch('/api/upload-fonts-batch', { method: 'POST', body: fd });
    if (!res.ok) {
       throw new Error(`Failed to upload batch: ${res.statusText}`);
    }
    const __ct_res = res.headers.get('content-type');
    if (__ct_res && __ct_res.includes('text/html')) {
        const text = await res.text().catch(()=>'');
        throw new Error(`Server returned HTML instead of JSON for ${res.url} (${res.status}). Response: ${text.substring(0, 100)}`);
    }
    const data = await res.json();
    for (let j = 0; j < chunk.length; j++) {
       serverFontIds[chunk[j].id] = data.fontIds[j];
    }
  }

  if (onProgress) onProgress('Compiling font on server (this may take a few seconds)...');

  const response = await fetch('/api/fuse-by-ids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      glyphMap,
      baseFontId: baseFontInfo.id,
      serverFontIds
    })
  });

  const contentType = response.headers.get('content-type');
  if (!response.ok) {
     if (contentType && contentType.includes('application/json')) {
         const errObj = await response.json().catch(()=>({}));
         throw new Error(errObj.error || `Server responded with ${response.status}`);
     } else {
         throw new Error(`Failed to initiate fusion: ${response.statusText}`);
     }
  }

  const __ct_response = response.headers.get('content-type');
    if (__ct_response && __ct_response.includes('text/html')) {
        const text = await response.text().catch(()=>'');
        throw new Error(`Server returned HTML instead of JSON for ${response.url} (${response.status}). Response: ${text.substring(0, 100)}`);
    }
    const { jobId } = await response.json();
  
  let finalResponse;
  while (true) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`/api/fuse-status/${jobId}`);
      const ct = statusRes.headers.get('content-type');
      if (ct && ct.includes('text/html')) {
          throw new Error("Server disconnected or crashed (returned HTML). The font might be too large.");
      }
      if (!statusRes.ok) {
         if (ct && ct.includes('application/json')) {
             const errObj = await statusRes.json().catch(()=>({}));
             throw new Error(errObj.error || `Failed to get status: ${statusRes.status}`);
         }
         throw new Error(`Failed to get status: ${statusRes.statusText}`);
      }
      const __ct_statusRes = statusRes.headers.get('content-type');
    if (__ct_statusRes && __ct_statusRes.includes('text/html')) {
        const text = await statusRes.text().catch(()=>'');
        throw new Error(`Server returned HTML instead of JSON for ${statusRes.url} (${statusRes.status}). Response: ${text.substring(0, 100)}`);
    }
    const statusData = await statusRes.json();
      if (statusData.status === 'progress') {
         if (onProgress) onProgress(statusData.message || 'Fusing...');
      } else if (statusData.status === 'error') {
         throw new Error(statusData.message || 'Error during fusion');
      } else if (statusData.status === 'done') {
         finalResponse = await fetch(`/api/fuse-download/${jobId}`);
         break;
      }
  }

  if (!finalResponse.ok) {
     throw new Error(`Failed to download fused font: ${finalResponse.statusText}`);
  }

  if (onProgress) onProgress('Downloading fused font...');
  const arrayBuffer = await finalResponse.arrayBuffer();
  return arrayBuffer;
}

export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: 'font/ttf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
