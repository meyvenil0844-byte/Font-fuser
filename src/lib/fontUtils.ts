import * as opentype from 'opentype.js';
import type { UploadedFont, GlyphMapping } from '../types';
import { buildSvgTable, buildCpalTable, buildCaplTable, buildColrTable, extractColorFontInfo, wrapGlyphSvg } from './colorFontUtils';
import { generateUUID, registerFontBuffer } from './workspace';

export interface TraceOptions {
  mode?: 'black' | 'white';
  invert?: boolean;
  threshold?: number;
}

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
    const args = argsStr.match(/[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g)?.map(Number) || [];
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
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) return file;
  
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: File) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try { URL.revokeObjectURL(url); } catch (e) {}
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish(file);
    }, 2000);

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
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
        return finish(file);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return finish(file);
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          finish(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".png", { type: 'image/png' }));
        } else {
          finish(file);
        }
      }, 'image/png', 0.9);
    };
    img.onerror = () => {
      finish(file);
    };
    img.src = url;
  });
}

function parseSvgClient(svgText: string): { pathData: string; width: number; height: number } {
  let w = 800;
  let h = 800;
  let combinedPath = '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (svgEl) {
      const wAttr = svgEl.getAttribute('width');
      const hAttr = svgEl.getAttribute('height');
      const vbAttr = svgEl.getAttribute('viewBox');
      if (wAttr && !isNaN(parseFloat(wAttr))) w = parseFloat(wAttr);
      if (hAttr && !isNaN(parseFloat(hAttr))) h = parseFloat(hAttr);
      else if (vbAttr) {
        const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
        if (parts.length >= 4) {
          w = parts[2];
          h = parts[3];
        }
      }
    }

    const paths = doc.querySelectorAll('path');
    paths.forEach(p => {
      const d = p.getAttribute('d');
      if (d) combinedPath += ' ' + d;
    });

    const polygons = doc.querySelectorAll('polygon, polyline');
    polygons.forEach(poly => {
      const ptsStr = poly.getAttribute('points');
      if (ptsStr) {
        const pts = ptsStr.trim().split(/[\s,]+/).map(Number);
        if (pts.length >= 2) {
          let pD = `M ${pts[0]} ${pts[1]}`;
          for (let i = 2; i < pts.length; i += 2) {
            pD += ` L ${pts[i]} ${pts[i + 1]}`;
          }
          if (poly.tagName.toLowerCase() === 'polygon') pD += ' Z';
          combinedPath += ' ' + pD;
        }
      }
    });

    const rects = doc.querySelectorAll('rect');
    rects.forEach(r => {
      const rx = parseFloat(r.getAttribute('x') || '0');
      const ry = parseFloat(r.getAttribute('y') || '0');
      const rw = parseFloat(r.getAttribute('width') || '0');
      const rh = parseFloat(r.getAttribute('height') || '0');
      if (rw > 0 && rh > 0) {
        combinedPath += ` M ${rx} ${ry} L ${rx + rw} ${ry} L ${rx + rw} ${ry + rh} L ${rx} ${ry + rh} Z`;
      }
    });
  } catch (e) {
    const match = svgText.match(/d="([^"]+)"/i);
    if (match) combinedPath = match[1];
  }

  return { pathData: combinedPath.trim(), width: w, height: h };
}

function traceBinaryGridToSvg(grid: Uint8Array, w: number, h: number): string {
  const nextMap = new Map<string, [number, number][]>();

  function addEdge(x1: number, y1: number, x2: number, y2: number) {
    const k = `${x1},${y1}`;
    if (!nextMap.has(k)) nextMap.set(k, []);
    nextMap.get(k)!.push([x2, y2]);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === 1) {
        if (y === 0 || grid[(y - 1) * w + x] === 0) {
          addEdge(x, y, x + 1, y);
        }
        if (x === w - 1 || grid[y * w + (x + 1)] === 0) {
          addEdge(x + 1, y, x + 1, y + 1);
        }
        if (y === h - 1 || grid[(y + 1) * w + x] === 0) {
          addEdge(x + 1, y + 1, x, y + 1);
        }
        if (x === 0 || grid[y * w + (x - 1)] === 0) {
          addEdge(x, y + 1, x, y);
        }
      }
    }
  }

  const paths: [number, number][][] = [];
  for (const [startK, nextList] of nextMap.entries()) {
    while (nextList.length > 0) {
      const firstNext = nextList.pop()!;
      const [sx, sy] = startK.split(',').map(Number);
      const loop: [number, number][] = [[sx, sy]];

      let curr = firstNext;
      let limit = 50000;
      while (limit-- > 0) {
        loop.push(curr);
        if (curr[0] === sx && curr[1] === sy) break;
        const currK = `${curr[0]},${curr[1]}`;
        const outgoing = nextMap.get(currK);
        if (!outgoing || outgoing.length === 0) break;
        curr = outgoing.pop()!;
      }

      if (loop.length >= 4) {
        const simplified: [number, number][] = [loop[0]];
        for (let i = 1; i < loop.length - 1; i++) {
          const prev = simplified[simplified.length - 1];
          const cur = loop[i];
          const next = loop[i + 1];
          const dx1 = cur[0] - prev[0];
          const dy1 = cur[1] - prev[1];
          const dx2 = next[0] - cur[0];
          const dy2 = next[1] - cur[1];
          if (dx1 * dy2 === dy1 * dx2 && (dx1 * dx2 >= 0) && (dy1 * dy2 >= 0)) continue;
          simplified.push(cur);
        }
        simplified.push(loop[loop.length - 1]);
        paths.push(simplified);
      }
    }
  }

  let svg = '';
  for (const p of paths) {
    if (p.length < 3) continue;
    svg += `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) {
      svg += ` L ${p[i][0]} ${p[i][1]}`;
    }
    svg += ' Z ';
  }
  return svg.trim();
}

export async function traceImageClient(
  file: File,
  options: TraceOptions = {}
): Promise<{ pathData: string; width: number; height: number }> {
  const mode = options.mode || 'black';
  const shouldInvert = !!options.invert;
  const threshold = options.threshold ?? 128;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      const maxSize = 400;
      if (w > maxSize || h > maxSize) {
        if (w > h) {
          h = Math.round(h * (maxSize / w));
          w = maxSize;
        } else {
          w = Math.round(w * (maxSize / h));
          h = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('Canvas 2D context not available'));
      
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      
      let transparentCount = 0;
      let opaqueCount = 0;
      let opaqueLumSum = 0;

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 128) {
          transparentCount++;
        } else {
          opaqueCount++;
          opaqueLumSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
      }

      const hasAlpha = transparentCount > (w * h * 0.05); // > 5% transparent
      const avgOpaqueLum = opaqueCount > 0 ? (opaqueLumSum / opaqueCount) : 0;

      const grid = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          const lum = (r + g + b) / 3;

          let isGlyph = false;
          if (hasAlpha) {
            // Transparent background
            if (a >= 50) {
              if (mode === 'white') {
                isGlyph = lum >= threshold;
              } else {
                // If opaque pixels are purely a white icon on transparent:
                if (avgOpaqueLum > 200 && opaqueCount > 0) {
                  isGlyph = lum >= threshold;
                } else {
                  isGlyph = lum <= threshold;
                }
              }
            }
          } else {
            // Solid image (e.g. paper or digital drawing):
            // In 'black' mode (default), ALL black/dark ink (lum < threshold) is the glyph!
            // NEVER guess or flip based on border brightness!
            if (mode === 'white') {
              isGlyph = lum >= threshold;
            } else {
              isGlyph = lum < threshold;
            }
          }

          if (shouldInvert) {
            isGlyph = !isGlyph;
          }

          if (isGlyph) grid[y * w + x] = 1;
        }
      }
      
      const pathData = traceBinaryGridToSvg(grid, w, h);
      resolve({ pathData, width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image into browser canvas'));
    };
    img.src = url;
  });
}

export async function traceImageToFont(
  file: File, 
  fileName: string, 
  cps: number[],
  options: TraceOptions = {}
): Promise<UploadedFont> {
  file = await downscaleImage(file);
  if (file.size > 100 * 1024 * 1024) {
    throw new Error(`Image is too large (${(file.size/1024/1024).toFixed(1)}MB). The limit is 100MB.`);
  }

  let commands: any[] | null = null;
  let pathData: string | null = null;
  let width = 400;
  let height = 400;

  // 1. Direct client-side SVG parsing if input is an SVG file
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  if (isSvg) {
    try {
      const svgText = await file.text();
      const parsedSvg = parseSvgClient(svgText);
      if (parsedSvg.pathData) {
        pathData = parsedSvg.pathData;
        width = parsedSvg.width;
        height = parsedSvg.height;
      }
    } catch (e) {
      console.warn('Direct SVG parse failed, will try server or canvas:', e);
    }
  }

  // 2. If not SVG or SVG parse had no paths, try server /api/trace
  if (!pathData) {
    try {
      const formData = new FormData();
      formData.append('image', file);
      if (options.mode) formData.append('mode', options.mode);
      if (options.invert) formData.append('invert', 'true');
      if (options.threshold !== undefined) formData.append('threshold', String(options.threshold));
      const response = await fetch('/api/trace', {
        method: 'POST',
        body: formData
      });
      const text = await response.text();
      // Only parse if server returned valid JSON (not HTML error or SPA fallback)
      if (response.ok && !text.trim().startsWith('<')) {
        const data = JSON.parse(text);
        if (data && (data.pathData || data.commands)) {
          pathData = data.pathData || null;
          commands = data.commands || null;
          width = data.width || 400;
          height = data.height || 400;
        }
      } else {
        console.warn('Server /api/trace returned non-JSON response, falling back to client-side vectorization');
      }
    } catch (err) {
      console.warn('Network /api/trace failed, falling back to client-side vectorization:', err);
    }
  }

  // 3. If still no pathData or commands, execute robust client-side canvas vectorization fallback
  if (!pathData && (!commands || commands.length === 0)) {
    try {
      const clientResult = await traceImageClient(file, options);
      pathData = clientResult.pathData;
      width = clientResult.width;
      height = clientResult.height;
    } catch (clientErr: any) {
      throw new Error('Failed to trace image: ' + (clientErr?.message || String(clientErr)));
    }
  }

  if (pathData && (!commands || commands.length === 0)) {
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
  const isCaret = cps.some(cp => cp === 0x005E || cp === 0x02C6 || cp === 0x2038 || cp === 0x2041 || cp === 0x2303);
  let scale: number;
  let scaleX: number;
  let scaleY: number;
  let offsetX: number;
  let offsetY: number;
  let advanceW: number;

  if (isCaret) {
    // Caret: Correct size (~380 units height, ~400 units width, ~38-40% EM),
    // cap-height top (~700), sitting above baseline (~320), centered with ~500 advance width
    const targetHeight = Math.round(EM * 0.38);
    const targetWidth = Math.round(EM * 0.40);
    const targetTop = Math.round(EM * 0.70);
    
    let baseScale = Math.min(targetWidth / Math.max(1, width), targetHeight / Math.max(1, height));
    const aspect = width / Math.max(1, height);
    scaleX = baseScale;
    scaleY = baseScale;
    if (aspect > 1.8) {
      scaleY = targetHeight / Math.max(1, height);
      scaleX = Math.min(targetWidth / Math.max(1, width), scaleY * 0.6);
    } else if (aspect < 0.6) {
      scaleX = targetWidth / Math.max(1, width);
      scaleY = Math.min(targetHeight / Math.max(1, height), scaleX * 0.6);
    }
    const scaledWidth = width * scaleX;
    const scaledHeight = height * scaleY;
    advanceW = Math.max(Math.round(EM * 0.50), Math.round(scaledWidth + EM * 0.10));
    offsetX = Math.round((advanceW - scaledWidth) / 2);
    offsetY = targetTop - scaledHeight;
    scale = baseScale;
  } else {
    const maxDim = Math.max(1, Math.max(width, height));
    scale = EM / maxDim;
    scaleX = scale;
    scaleY = scale;
    offsetX = 0; // Glyph starts exactly at X=0
    offsetY = (EM - (height * scale)) / 2;
    advanceW = Math.round(width * scale);
  }
  const newPath = new opentype.Path();
  
  if (commands.length > 25000) {
    throw new Error('Image is too complex (over 25,000 path commands). Please use a simpler, cleaner image.');
  }
  const rawCommands = [];
  for (const cmd of commands) {
    const type = cmd.code ? cmd.code.toUpperCase() : 'Z';
    const num = (v: number) => isNaN(v) ? 0 : v;
    const computedX = Math.round(num(offsetX + cmd.x * scaleX));
    const computedY = isCaret
      ? Math.round(num(offsetY + (height - cmd.y) * scaleY))
      : Math.round(num(offsetY + (height * scaleY - (cmd.y * scaleY)))) - 200;
    const numY = (yVal: number) => isCaret
      ? Math.round(num(offsetY + (height - yVal) * scaleY))
      : Math.round(num(offsetY + (height * scaleY - (yVal * scaleY)))) - 200;

    if (type === 'M') rawCommands.push({ type: 'M', x: computedX, y: computedY });
    else if (type === 'L') rawCommands.push({ type: 'L', x: computedX, y: computedY });
    else if (type === 'Q') rawCommands.push({ type: 'Q', x1: Math.round(num(offsetX + cmd.x1 * scaleX)), y1: numY(cmd.y1), x: computedX, y: computedY });
    else if (type === 'C') rawCommands.push({ type: 'C', x1: Math.round(num(offsetX + cmd.x1 * scaleX)), y1: numY(cmd.y1), x2: Math.round(num(offsetX + cmd.x2 * scaleX)), y2: numY(cmd.y2), x: computedX, y: computedY });
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

  const flattenSubpath = (cmds) => {
    let pts = [];
    let lastX = 0, lastY = 0;
    for (const cmd of cmds) {
      if (cmd.type === 'M' || cmd.type === 'L') {
        pts.push({x: cmd.x, y: cmd.y});
        lastX = cmd.x; lastY = cmd.y;
      } else if (cmd.type === 'Q') {
        for (let t = 0.2; t <= 1; t += 0.2) {
          let x = (1-t)*(1-t)*lastX + 2*(1-t)*t*cmd.x1 + t*t*cmd.x;
          let y = (1-t)*(1-t)*lastY + 2*(1-t)*t*cmd.y1 + t*t*cmd.y;
          pts.push({x, y});
        }
        lastX = cmd.x; lastY = cmd.y;
      } else if (cmd.type === 'C') {
        for (let t = 0.2; t <= 1; t += 0.2) {
          let x = Math.pow(1-t, 3)*lastX + 3*Math.pow(1-t, 2)*t*cmd.x1 + 3*(1-t)*t*t*cmd.x2 + Math.pow(t, 3)*cmd.x;
          let y = Math.pow(1-t, 3)*lastY + 3*Math.pow(1-t, 2)*t*cmd.y1 + 3*(1-t)*t*t*cmd.y2 + Math.pow(t, 3)*cmd.y;
          pts.push({x, y});
        }
        lastX = cmd.x; lastY = cmd.y;
      }
    }
    return pts;
  };

  const isInside = (pt, pts) => {
    let inside = false;
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

  const flattenedSubpaths = subpaths.map(cmds => flattenSubpath(cmds));
  const subpathBounds = subpaths.map(cmds => getBounds(cmds));

  for (let i = 0; i < subpaths.length; i++) {
    let nestCount = 0;
    const b1 = subpathBounds[i];
    const pts1 = flattenedSubpaths[i];
    
    for (let j = 0; j < subpaths.length; j++) {
      if (i === j) continue;
      const b2 = subpathBounds[j];
      const pts2 = flattenedSubpaths[j];
      
      if (b1.minX >= b2.minX && b1.maxX <= b2.maxX && b1.minY >= b2.minY && b1.maxY <= b2.maxY) {
        let inside = false;
        for (let k = 0; k < pts1.length; k += Math.max(1, Math.floor(pts1.length / 10))) {
           let testPt = { x: pts1[k].x + 0.001234, y: pts1[k].y + 0.001234 };
           if (isInside(testPt, pts2)) {
             inside = true;
             break;
           }
        }
        if (inside) nestCount++;
      }
    }
    
    const getSubpathSignedArea = (cmds: any[]): number => {
      const pts: { x: number; y: number }[] = [];
      let lastX = 0, lastY = 0;
      for (const cmd of cmds) {
        if (cmd.type === 'M' || cmd.type === 'L') {
          pts.push({ x: cmd.x, y: cmd.y });
          lastX = cmd.x; lastY = cmd.y;
        } else if (cmd.type === 'Q') {
          for (let t = 0.25; t <= 1; t += 0.25) {
            const x = (1 - t) * (1 - t) * lastX + 2 * (1 - t) * t * cmd.x1 + t * t * cmd.x;
            const y = (1 - t) * (1 - t) * lastY + 2 * (1 - t) * t * cmd.y1 + t * t * cmd.y;
            pts.push({ x, y });
          }
          lastX = cmd.x; lastY = cmd.y;
        } else if (cmd.type === 'C') {
          for (let t = 0.25; t <= 1; t += 0.25) {
            const x = Math.pow(1 - t, 3) * lastX + 3 * Math.pow(1 - t, 2) * t * cmd.x1 + 3 * (1 - t) * t * t * cmd.x2 + Math.pow(t, 3) * cmd.x;
            const y = Math.pow(1 - t, 3) * lastY + 3 * Math.pow(1 - t, 2) * t * cmd.y1 + 3 * (1 - t) * t * t * cmd.y2 + Math.pow(t, 3) * cmd.y;
            pts.push({ x, y });
          }
          lastX = cmd.x; lastY = cmd.y;
        }
      }
      let a = 0;
      const n = pts.length;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        a += pts[k].x * pts[j].y - pts[j].x * pts[k].y;
      }
      return a / 2;
    };

    const area = getSubpathSignedArea(subpaths[i]);
    // In OpenType CFF:
    // Level 0 (outer) must be Counter-Clockwise (area > 0).
    // Level 1 (hole) must be Clockwise (area < 0).
    const shouldBeCCW = (nestCount % 2 === 0);
    const isCCW = area > 0;
    const needsReverse = shouldBeCCW !== isCCW;
    const finalCmds = needsReverse ? reverseSubpath(subpaths[i]) : subpaths[i];
    for (const cmd of finalCmds) {
      if (cmd.type === 'M') newPath.moveTo(cmd.x, cmd.y);
      else if (cmd.type === 'L') newPath.lineTo(cmd.x, cmd.y);
      else if (cmd.type === 'Q') newPath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
      else if (cmd.type === 'C') newPath.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      else if (cmd.type === 'Z') newPath.close();
    }
    if (finalCmds.length > 0 && finalCmds[finalCmds.length - 1].type !== 'Z') {
      newPath.close();
    }
  }
  
  const glyphs = [notdef];
  for (const cp of cps) {
    glyphs.push(new opentype.Glyph({
      name: cp === 0 ? '.null' : ('uni' + cp.toString(16).toUpperCase()),
      unicode: cp,
      advanceWidth: advanceW,
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

  if (!(font as any).tables) (font as any).tables = {};
  if (!(font as any).tables.hhea) (font as any).tables.hhea = {};
  if (!(font as any).tables.os2) (font as any).tables.os2 = {};
  (font as any).tables.hhea.caretSlopeRise = 1;
  (font as any).tables.hhea.caretSlopeRun = 0;
  (font as any).tables.hhea.caretOffset = 0;
  (font as any).tables.os2.sTypoAscender = 800;
  (font as any).tables.os2.sTypoDescender = -200;
  (font as any).tables.os2.sTypoLineGap = 0;
  (font as any).tables.os2.usWinAscent = 800;
  (font as any).tables.os2.usWinDescent = 200;
  (font as any).tables.os2.fsSelection = 128; // USE_TYPO_METRICS
  
  // COLOR UPDATE: Check if source file is an SVG document
  let rawSvgDoc: string | null = null;
  if (file.name.match(/\.svg$/i) || file.type.includes('svg')) {
    try {
      rawSvgDoc = await file.text();
    } catch(e) {}
  }

  if (rawSvgDoc) {
    const svgEntries: { glyphID: number; svg: string }[] = [];
    for (let i = 0; i < cps.length; i++) {
      const gid = i + 1;
      svgEntries.push({ glyphID: gid, svg: rawSvgDoc });
    }
    const svgTable = buildSvgTable(svgEntries);
    (font as any).tables.svg = svgTable;
    (font as any).tables.SVG = svgTable;

    const cpal = buildCpalTable([['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#000000', '#ffffff']]);
    (font as any).tables.cpal = cpal;
    (font as any).tables.capl = cpal;
    (font as any).tables.CPAL = cpal;
    (font as any).tables.CAPL = cpal;

    const colrBases = cps.map((_, i) => ({ glyphID: i + 1, layers: [{ glyphID: i + 1, paletteIndex: 0 }] }));
    const colr = buildColrTable(colrBases);
    (font as any).tables.colr = colr;
    (font as any).tables.COLR = colr;
  }

  const buffer = font.toArrayBuffer();
  const fontFile = new File([buffer], fileName + '.ttf', { type: 'font/ttf' });
  const id = generateUUID();
  
  registerFontBuffer(id, file.name, fontFile.name, buffer);

  const fontFace = new FontFace(`FontFuser_${id}`, buffer);
  try {
    await fontFace.load();
    document.fonts.add(fontFace);
  } catch(e) {
    console.warn("Failed to load traced fontface", e);
  }
  
  const colorData = extractColorFontInfo(font);
  return {
    id,
    name: file.name,
    fileName: fontFile.name,
    file: fontFile,
    buffer: buffer.slice(0),
    parsed: font,
    fontFamilyName: `FontFuser_${id}`,
    color: '#10b981',
    hasColor: colorData.hasColor,
    colorData,
    supportedCodePoints: new Set<number>(cps)
  };
}

export function coerceToArrayBuffer(val: any): ArrayBuffer | null {
  if (!val) return null;
  if (val instanceof ArrayBuffer) {
    return val.byteLength > 0 ? val.slice(0) : null;
  }
  if (ArrayBuffer.isView(val)) {
    return val.byteLength > 0 ? val.buffer.slice(val.byteOffset, val.byteOffset + val.byteLength) : null;
  }
  if (typeof val === 'object' && Array.isArray((val as any).data) && (val as any).data.length > 0) {
    try {
      const u8 = new Uint8Array((val as any).data);
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    } catch {
      return null;
    }
  }
  return null;
}

export function isWoff2Buffer(buffer: any): boolean {
  const ab = coerceToArrayBuffer(buffer);
  if (!ab || ab.byteLength < 4) return false;
  const view = new DataView(ab);
  return view.getUint32(0, false) === 0x774F4632; // 'wOF2'
}

export function isWoff1Buffer(buffer: any): boolean {
  const ab = coerceToArrayBuffer(buffer);
  if (!ab || ab.byteLength < 4) return false;
  const view = new DataView(ab);
  return view.getUint32(0, false) === 0x774F4646; // 'wOFF'
}

export function isTtcBuffer(buffer: any): boolean {
  const ab = coerceToArrayBuffer(buffer);
  if (!ab || ab.byteLength < 4) return false;
  const view = new DataView(ab);
  return view.getUint32(0, false) === 0x74746366; // 'ttcf'
}

export async function decompressWoff1IfNeeded(buffer: ArrayBuffer, fileName?: string): Promise<ArrayBuffer> {
  const cleanBuf = coerceToArrayBuffer(buffer) || buffer;
  if (isWoff1Buffer(cleanBuf) || (fileName && /\.woff$/i.test(fileName))) {
    let timer: any;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 15000);
      const formData = new FormData();
      formData.append('font', new Blob([cleanBuf], { type: 'font/woff' }), 'font.woff');
      const res = await fetch('/api/decompress-woff1', { method: 'POST', body: formData, signal: controller.signal });
      if (res.ok) {
        return await res.arrayBuffer();
      }
    } catch (e) {
      console.warn('WOFF1 decompression error:', e);
    } finally {
      clearTimeout(timer);
    }
  }
  return cleanBuf;
}

export async function unpackTtcIfNeeded(buffer: ArrayBuffer, fileName?: string): Promise<ArrayBuffer> {
  const cleanBuf = coerceToArrayBuffer(buffer) || buffer;
  if (isTtcBuffer(cleanBuf) || (fileName && /\.ttc$/i.test(fileName))) {
    let timer: any;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 15000);
      const formData = new FormData();
      formData.append('font', new Blob([cleanBuf], { type: 'font/collection' }), fileName || 'font.ttc');
      const res = await fetch('/api/unpack-ttc', { method: 'POST', body: formData, signal: controller.signal });
      if (res.ok) {
        return await res.arrayBuffer();
      }
    } catch (e) {
      console.warn('TTC unpack warning:', e);
    } finally {
      clearTimeout(timer);
    }
  }
  return cleanBuf;
}

export async function decompressWoff2IfNeeded(buffer: ArrayBuffer, fileName?: string): Promise<ArrayBuffer> {
  const cleanBuf = coerceToArrayBuffer(buffer) || buffer;
  if (isWoff2Buffer(cleanBuf) || (fileName && /\.woff2$/i.test(fileName))) {
    let timer: any;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 15000);
      const formData = new FormData();
      formData.append('font', new Blob([cleanBuf], { type: 'font/woff2' }), 'font.woff2');
      const res = await fetch('/api/decompress-woff2', { method: 'POST', body: formData, signal: controller.signal });
      if (res.ok) {
        return await res.arrayBuffer();
      }
    } catch (e) {
      console.warn('WOFF2 decompression error:', e);
    } finally {
      clearTimeout(timer);
    }
  }
  return cleanBuf;
}

export async function normalizeFontBuffer(buffer: ArrayBuffer, fileName?: string): Promise<ArrayBuffer> {
  const cleanBuf = coerceToArrayBuffer(buffer);
  if (!cleanBuf || cleanBuf.byteLength < 4) return buffer;
  let buf = cleanBuf;
  if (isTtcBuffer(buf)) {
    buf = await unpackTtcIfNeeded(buf, fileName);
  } else if (isWoff2Buffer(buf)) {
    buf = await decompressWoff2IfNeeded(buf, fileName);
  } else if (isWoff1Buffer(buf)) {
    buf = await decompressWoff1IfNeeded(buf, fileName);
  }
  return buf;
}

export async function parseFont(source: File | ArrayBuffer, fileName?: string): Promise<opentype.Font> {
  let arrayBuffer: ArrayBuffer;
  const name = source instanceof File ? source.name : (fileName || 'font.ttf');
  if (source instanceof File) {
    arrayBuffer = await source.arrayBuffer();
  } else {
    arrayBuffer = source;
  }
  arrayBuffer = await normalizeFontBuffer(arrayBuffer, name);
  const parsed = opentype.parse(arrayBuffer.slice(0));
  (parsed as any)._decompressedBuffer = arrayBuffer;
  return parsed;
}

export function parseSfntBasic(arrayBuffer: ArrayBuffer, fallbackName: string = 'Custom Font'): { name: string; codePoints: Set<number> } {
  try {
    const cleanBuf = coerceToArrayBuffer(arrayBuffer);
    if (!cleanBuf || cleanBuf.byteLength < 12) return { name: fallbackName, codePoints: new Set<number>() };
    const view = new DataView(cleanBuf);
    
    let sfntOffset = 0;
    if (cleanBuf.byteLength >= 16) {
      const sig = view.getUint32(0, false);
      if (sig === 0x74746366) { // 'ttcf' TTC header
        sfntOffset = view.getUint32(12, false);
        if (sfntOffset + 12 > cleanBuf.byteLength) sfntOffset = 0;
      }
    }

    const maxTables = Math.floor((cleanBuf.byteLength - (sfntOffset + 12)) / 16);
    const numTables = Math.min(view.getUint16(sfntOffset + 4, false), Math.min(maxTables, 256));
    let nameOffset = 0;
    let cmapOffset = 0;
    
    for (let i = 0; i < numTables; i++) {
      const o = sfntOffset + 12 + i * 16;
      if (o + 16 > cleanBuf.byteLength) break;
      const tag = String.fromCharCode(view.getUint8(o), view.getUint8(o+1), view.getUint8(o+2), view.getUint8(o+3));
      if (tag === 'name') {
        nameOffset = view.getUint32(o + 8, false);
      } else if (tag === 'cmap') {
        cmapOffset = view.getUint32(o + 8, false);
      }
    }
    
    let fontName = fallbackName;
    if (nameOffset > 0 && nameOffset + 6 <= cleanBuf.byteLength) {
      const count = Math.min(view.getUint16(nameOffset + 2, false), 256);
      const stringOffset = nameOffset + view.getUint16(nameOffset + 4, false);
      let familyFound = '';
      for (let i = 0; i < count; i++) {
        const rec = nameOffset + 6 + i * 12;
        if (rec + 12 > cleanBuf.byteLength) break;
        const nameId = view.getUint16(rec + 6, false);
        if (nameId === 1 || nameId === 4) { // 1 = Font Family, 4 = Full Name
          const len = view.getUint16(rec + 8, false);
          const offset = stringOffset + view.getUint16(rec + 10, false);
          if (offset + len <= cleanBuf.byteLength && len > 0) {
            const bytes = new Uint8Array(cleanBuf, offset, len);
            let str = '';
            if (bytes.length >= 2 && bytes[0] === 0) {
              for (let j = 1; j < bytes.length; j += 2) str += String.fromCharCode(bytes[j]);
            } else {
              try { str = new TextDecoder('utf-8').decode(bytes); } catch { str = ''; }
            }
            if (str.trim()) {
              if (nameId === 1) {
                familyFound = str.trim();
                break;
              } else if (!familyFound) {
                familyFound = str.trim();
              }
            }
          }
        }
      }
      if (familyFound) fontName = familyFound;
    }
    
    const codePoints = new Set<number>();
    if (cmapOffset > 0 && cmapOffset + 4 <= cleanBuf.byteLength) {
      const numSub = Math.min(view.getUint16(cmapOffset + 2, false), 64);
      for (let i = 0; i < numSub; i++) {
        const subRec = cmapOffset + 4 + i * 8;
        if (subRec + 8 > cleanBuf.byteLength) break;
        const subOffset = cmapOffset + view.getUint32(subRec + 4, false);
        if (subOffset + 6 > cleanBuf.byteLength) continue;
        const format = view.getUint16(subOffset, false);
        if (format === 4 && subOffset + 14 <= cleanBuf.byteLength) {
          const segCount = Math.min(Math.floor(view.getUint16(subOffset + 6, false) / 2), 2048);
          const endCodesOffset = subOffset + 14;
          const startCodesOffset = endCodesOffset + segCount * 2 + 2;
          for (let s = 0; s < segCount; s++) {
            if (startCodesOffset + s * 2 + 2 <= cleanBuf.byteLength && endCodesOffset + s * 2 + 2 <= cleanBuf.byteLength) {
              const start = view.getUint16(startCodesOffset + s * 2, false);
              const end = view.getUint16(endCodesOffset + s * 2, false);
              if (end >= start && end <= 0xFFFF && (end - start) <= 65536) {
                if (start === 0xFFFF && end === 0xFFFF) continue;
                for (let cp = start; cp <= end; cp++) {
                  codePoints.add(cp);
                  if (codePoints.size >= 65536) break;
                }
              }
            }
            if (codePoints.size >= 65536) break;
          }
        } else if (format === 12 && subOffset + 16 <= cleanBuf.byteLength) {
          const nGroups = Math.min(view.getUint32(subOffset + 12, false), 16384);
          for (let g = 0; g < nGroups; g++) {
            const gOff = subOffset + 16 + g * 12;
            if (gOff + 12 > cleanBuf.byteLength) break;
            const start = view.getUint32(gOff, false);
            const end = view.getUint32(gOff + 4, false);
            if (end >= start && (end - start) <= 65536 && end <= 0x10FFFF) {
              for (let cp = start; cp <= end; cp++) {
                codePoints.add(cp);
                if (codePoints.size >= 65536) break;
              }
            }
            if (codePoints.size >= 65536) break;
          }
        } else if (format === 0 && subOffset + 6 + 256 <= cleanBuf.byteLength) {
          for (let c = 0; c < 256; c++) {
            const gId = view.getUint8(subOffset + 6 + c);
            if (gId > 0) codePoints.add(c);
          }
        }
        if (codePoints.size >= 65536) break;
      }
    }
    return { name: fontName, codePoints };
  } catch (e) {
    return { name: fallbackName, codePoints: new Set<number>() };
  }
}

export function extractSupportedCodePoints(parsed: any): Set<number> {
  const codePoints = new Set<number>();
  if (!parsed) return codePoints;

  try {
    const cmap = parsed.tables?.cmap;
    
    // 1. Primary: opentype.js builds a single pre-merged glyphIndexMap for the best subtable (0ms lookup)
    if (cmap?.glyphIndexMap && typeof cmap.glyphIndexMap === 'object') {
      for (const cpStr in cmap.glyphIndexMap) {
        const cp = Number(cpStr);
        if (cp >= 0 && cp <= 0x10FFFF && cmap.glyphIndexMap[cpStr] > 0) {
          codePoints.add(cp);
          if (codePoints.size >= 65536) break;
        }
      }
    }

    // If primary cmap yielded codepoints, return immediately without scanning redundant tables
    if (codePoints.size > 0) {
      return codePoints;
    }

    // 2. Secondary: Inspect subtables with safe bounded ranges
    if (Array.isArray(cmap?.tables)) {
      for (const sub of cmap.tables) {
        if (!sub) continue;
        if (sub.glyphIndexMap && typeof sub.glyphIndexMap === 'object') {
          for (const cpStr in sub.glyphIndexMap) {
            const cp = Number(cpStr);
            if (cp >= 0 && cp <= 0x10FFFF && sub.glyphIndexMap[cpStr] > 0) {
              codePoints.add(cp);
              if (codePoints.size >= 65536) break;
            }
          }
        }
        if (Array.isArray(sub.groups)) {
          for (const grp of sub.groups) {
            if (grp && typeof grp.startCharCode === 'number' && typeof grp.endCharCode === 'number') {
              const start = Math.max(0, grp.startCharCode);
              const end = Math.min(0x10FFFF, grp.endCharCode);
              if (end >= start && (end - start) <= 65536) {
                for (let cp = start; cp <= end; cp++) {
                  codePoints.add(cp);
                  if (codePoints.size >= 65536) break;
                }
              }
            }
            if (codePoints.size >= 65536) break;
          }
        }
        if (codePoints.size > 0) break;
      }
    }

    if (codePoints.size > 0) {
      return codePoints;
    }

    // 3. Fallback: Encoding table
    const encCmap = (parsed.encoding as any)?.cmap?.glyphIndexMap;
    if (encCmap && typeof encCmap === 'object') {
      for (const cpStr in encCmap) {
        const cp = Number(cpStr);
        if (cp >= 0 && cp <= 0x10FFFF && encCmap[cpStr] > 0) {
          codePoints.add(cp);
          if (codePoints.size >= 65536) break;
        }
      }
    }

    if (codePoints.size > 0) {
      return codePoints;
    }

    // 4. Fallback: Glyphs container unicodes without deconstruction
    const glyphs = parsed.glyphs;
    if (glyphs) {
      const len = typeof glyphs.length === 'number' ? glyphs.length : 0;
      if (typeof glyphs.get === 'function') {
        const count = Math.min(len, 32768);
        for (let i = 0; i < count; i++) {
          const g = glyphs.get(i);
          if (g) {
            if (typeof g.unicode === 'number' && g.unicode > 0 && g.unicode <= 0x10FFFF) codePoints.add(g.unicode);
            if (Array.isArray(g.unicodes)) {
              for (const u of g.unicodes) if (typeof u === 'number' && u > 0 && u <= 0x10FFFF) codePoints.add(u);
            }
          }
          if (codePoints.size >= 65536) break;
        }
      } else if (glyphs.glyphs && typeof glyphs.glyphs === 'object') {
        const vals = Object.values(glyphs.glyphs);
        for (let i = 0; i < vals.length; i++) {
          const g: any = vals[i];
          if (g) {
            if (typeof g.unicode === 'number' && g.unicode > 0 && g.unicode <= 0x10FFFF) codePoints.add(g.unicode);
            if (Array.isArray(g.unicodes)) {
              for (const u of g.unicodes) if (typeof u === 'number' && u > 0 && u <= 0x10FFFF) codePoints.add(u);
            }
          }
          if (codePoints.size >= 65536) break;
        }
      }
    }
  } catch (e) {
    console.warn('Error extracting supported code points:', e);
  }

  return codePoints;
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

// Session cache of server font IDs to eliminate redundant uploads
const sessionServerFontCache: Record<string, string> = {};

export function clearSessionServerFontCache(): void {
  for (const k of Object.keys(sessionServerFontCache)) {
    delete sessionServerFontCache[k];
  }
}

export async function generateFusedFont(
  baseFontInfo: UploadedFont,
  fonts: UploadedFont[],
  glyphMap: GlyphMapping,
  onProgress?: (msg: string) => void
): Promise<ArrayBuffer> {
  if (!baseFontInfo.file) {
    throw new Error('Base font file is missing');
  }

  const serverFontIds: Record<string, string> = {};

  // 1. Only upload the base font and fonts that are actually referenced in glyphMap!
  const usedFontIds = new Set<string>();
  usedFontIds.add(baseFontInfo.id);
  if (glyphMap) {
    for (const fontId of Object.values(glyphMap)) {
      if (fontId) usedFontIds.add(fontId);
    }
  }

  const allFontsToUpload: UploadedFont[] = [];
  if (baseFontInfo.file) {
    allFontsToUpload.push(baseFontInfo);
  }
  for (const font of fonts) {
    if (font.id !== baseFontInfo.id && font.file && usedFontIds.has(font.id)) {
      allFontsToUpload.push(font);
    }
  }

  // 2. Check if any fonts were already uploaded in this session and still exist on server
  if (Object.keys(sessionServerFontCache).length > 0) {
    try {
      const checkRes = await fetch('/api/check-uploaded-fonts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverFontIds: sessionServerFontCache })
      });
      if (checkRes.ok) {
        const { existing } = await checkRes.json();
        if (existing && typeof existing === 'object') {
          for (const [cid, sid] of Object.entries(existing)) {
            serverFontIds[cid] = sid as string;
          }
        }
      }
    } catch (e) {
      console.warn('Check uploaded fonts error:', e);
    }
  }

  // --- Resilient Upload Helpers ---
  async function uploadFontRaw(font: UploadedFont): Promise<string> {
    const url = `/api/upload-font-raw?clientId=${encodeURIComponent(font.id)}&name=${encodeURIComponent(font.fileName || font.name || 'font.ttf')}&t=${Date.now()}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: font.file
    });
    if (!res.ok) throw new Error(`Raw upload returned HTTP ${res.status}`);
    const data = await res.json();
    if (!data.fontId) throw new Error('No fontId returned from raw upload');
    return data.fontId;
  }

  async function uploadFontChunked(font: UploadedFont, onSubProgress?: (msg: string) => void): Promise<string> {
    const CHUNK_SIZE = 1.5 * 1024 * 1024; // 1.5MB chunks
    const file = font.file;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    for (let j = 0; j < totalChunks; j++) {
      const start = j * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      let chunkOk = false;
      let lastErr = '';
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const url = `/api/upload-chunk-raw?uploadId=${uploadId}&chunkIndex=${j}&totalChunks=${totalChunks}&originalName=${encodeURIComponent(file.name)}&t=${Date.now()}`;
          const chunkRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunk
          });
          if (chunkRes.ok) {
            chunkOk = true;
            break;
          } else {
            lastErr = `HTTP ${chunkRes.status}`;
          }
        } catch (e: any) {
          lastErr = e.message || String(e);
        }
        await new Promise(r => setTimeout(r, 800 * attempt));
      }

      if (!chunkOk) {
        throw new Error(`Failed to upload ${font.name} chunk ${j + 1}/${totalChunks} (${lastErr})`);
      }
      if (onSubProgress && totalChunks > 1) {
        onSubProgress(`Uploading large font ${font.name} (${Math.round(((j + 1) / totalChunks) * 100)}%)...`);
      }
    }

    const finishRes = await fetch('/api/upload-chunk-finish?t=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId })
    });

    if (!finishRes.ok) {
      const err = await finishRes.json().catch(() => ({}));
      throw new Error(`Failed to finalize chunked font ${font.name}: ${err.error || finishRes.status}`);
    }
    const finishData = await finishRes.json();
    return finishData.fontId;
  }

  async function uploadFontResilient(font: UploadedFont, onSubProgress?: (msg: string) => void): Promise<string> {
    if (font.file.size > 2.5 * 1024 * 1024) {
      return await uploadFontChunked(font, onSubProgress);
    }

    // Try raw streaming upload first
    let lastErr: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const fontId = await uploadFontRaw(font);
        return fontId;
      } catch (err: any) {
        lastErr = err;
        await new Promise(r => setTimeout(r, 600 * attempt));
      }
    }

    // If raw upload fails, fall back to chunked upload
    console.warn(`Raw upload failed for ${font.name}, falling back to chunked upload:`, lastErr);
    return await uploadFontChunked(font, onSubProgress);
  }

  // Filter fonts that still need to be uploaded
  const fontsNeeded = allFontsToUpload.filter(f => !serverFontIds[f.id]);
  const totalFonts = allFontsToUpload.length;
  let completed = totalFonts - fontsNeeded.length;

  if (fontsNeeded.length > 0) {
    if (onProgress) onProgress(`Preparing ${fontsNeeded.length} font(s) for fusion (${completed}/${totalFonts})...`);

    // Separate into small fonts (< 2MB) for safe batching and large fonts (>= 2MB) for resilient single/chunk upload
    const BATCH_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB max batch total size
    const MAX_BATCH_COUNT = 4; // Max 4 fonts per batch

    const smallFonts = fontsNeeded.filter(f => f.file.size < 2 * 1024 * 1024);
    const largeFonts = fontsNeeded.filter(f => f.file.size >= 2 * 1024 * 1024);

    // Group small fonts into safe-sized batches
    const batches: UploadedFont[][] = [];
    let currentBatch: UploadedFont[] = [];
    let currentBatchBytes = 0;

    for (const font of smallFonts) {
      if (currentBatch.length >= MAX_BATCH_COUNT || currentBatchBytes + font.file.size > BATCH_SIZE_LIMIT) {
        if (currentBatch.length > 0) batches.push(currentBatch);
        currentBatch = [font];
        currentBatchBytes = font.file.size;
      } else {
        currentBatch.push(font);
        currentBatchBytes += font.file.size;
      }
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    // Upload small font batches
    for (const batch of batches) {
      if (onProgress) onProgress(`Uploading fonts (${completed}/${totalFonts})...`);

      let batchSuccess = false;
      let retries = 2;

      while (retries > 0) {
        // ALWAYS build fresh FormData for every attempt to avoid consumed stream errors
        const fd = new FormData();
        fd.append('clientIdsJson', JSON.stringify(batch.map(f => f.id)));
        batch.forEach(f => {
          fd.append('clientIds', f.id);
          fd.append('fonts', f.file);
        });

        try {
          const res = await fetch('/api/upload-fonts-batch', { method: 'POST', body: fd });
          if (res.ok) {
            const data = await res.json();
            if (data.mapping) {
              Object.assign(serverFontIds, data.mapping);
              Object.assign(sessionServerFontCache, data.mapping);
              batchSuccess = true;
              break;
            }
          }
        } catch (e) {
          if (retries === 1) console.warn('Batch upload attempt failed, falling back:', e);
        }
        retries--;
        if (retries > 0) await new Promise(r => setTimeout(r, 800));
      }

      // If batch fails, fallback to uploading each font in the batch individually
      if (!batchSuccess) {
        for (const font of batch) {
          try {
            const sid = await uploadFontResilient(font, onProgress);
            serverFontIds[font.id] = sid;
            sessionServerFontCache[font.id] = sid;
          } catch (singleErr) {
            console.error(`Failed to upload ${font.name}:`, singleErr);
            throw new Error(`Failed to upload font "${font.name}": ${singleErr}`);
          }
        }
      }

      completed += batch.length;
      if (onProgress) onProgress(`Uploaded fonts... (${completed}/${totalFonts})`);
    }

    // Upload large fonts using resilient single/chunked pipeline
    for (const font of largeFonts) {
      if (onProgress) onProgress(`Uploading ${font.name}... (${completed}/${totalFonts})`);
      try {
        const sid = await uploadFontResilient(font, onProgress);
        serverFontIds[font.id] = sid;
        sessionServerFontCache[font.id] = sid;
        completed++;
        if (onProgress) onProgress(`Uploaded fonts... (${completed}/${totalFonts})`);
      } catch (err: any) {
        throw new Error(`Failed to upload large font "${font.name}": ${err.message || err}`);
      }
    }
  }

  // Double-check all required fonts are present
  const missing = allFontsToUpload.filter(f => !serverFontIds[f.id]);
  if (missing.length > 0) {
    if (onProgress) onProgress(`Retrying upload for ${missing.length} missing font(s)...`);
    for (const font of missing) {
      const sid = await uploadFontResilient(font, onProgress);
      serverFontIds[font.id] = sid;
      sessionServerFontCache[font.id] = sid;
    }
  }

  if (!serverFontIds[baseFontInfo.id]) {
    throw new Error(`Base font "${baseFontInfo.name}" could not be uploaded to server.`);
  }

  if (onProgress) onProgress('Compiling font on server (fast Type 2 CFF engine)...');

  let jobId: string | null = null;
  let fuseErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch('/api/fuse-by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          glyphMap,
          baseFontId: baseFontInfo.id,
          serverFontIds
        })
      });

      if (response.ok) {
        const data = await response.json();
        jobId = data.jobId;
        break;
      } else {
        const errObj = await response.json().catch(() => ({}));
        fuseErr = errObj.error || `Server responded with status ${response.status}`;
      }
    } catch (e: any) {
      fuseErr = e.message || String(e);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
  }

  if (!jobId) {
    throw new Error(fuseErr || 'Failed to start font fusion process on server.');
  }

  let finalResponse: Response | null = null;
  let fontOriginalName = 'FusedFont.otf';
  let pollFailures = 0;

  while (true) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const statusRes = await fetch(`/api/fuse-status/${jobId}?t=${Date.now()}`);
      if (!statusRes.ok) {
        pollFailures++;
        if (pollFailures > 6) {
          const errObj = await statusRes.json().catch(() => ({}));
          throw new Error(errObj.error || `Failed to get status (HTTP ${statusRes.status})`);
        }
        continue;
      }
      pollFailures = 0;
      const statusData = await statusRes.json();
      if (statusData.status === 'progress') {
        if (onProgress) onProgress(statusData.message || 'Fusing...');
      } else if (statusData.status === 'error') {
        throw new Error(statusData.message || 'Error during fusion');
      } else if (statusData.status === 'done') {
        fontOriginalName = statusData.originalName || 'FusedFont.otf';
        for (let dlAttempt = 1; dlAttempt <= 3; dlAttempt++) {
          try {
            const dlRes = await fetch(`/api/fuse-download/${jobId}`);
            if (dlRes.ok) {
              finalResponse = dlRes;
              break;
            }
          } catch (e) {}
          await new Promise(r => setTimeout(r, 800));
        }
        break;
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith('Error during fusion')) {
        throw err;
      }
      pollFailures++;
      if (pollFailures > 6) {
        throw new Error(`Lost connection to server during fusion: ${err.message || err}`);
      }
    }
  }

  if (!finalResponse || !finalResponse.ok) {
    throw new Error('Failed to download fused font from server');
  }

  if (onProgress) onProgress('Preparing font for download...');
  const arrayBuffer = await finalResponse.arrayBuffer();

  // Attach download metadata to the returned ArrayBuffer for direct browser saving
  (arrayBuffer as any).downloadUrl = `/api/fuse-download/${jobId}`;
  (arrayBuffer as any).filename = fontOriginalName;

  return arrayBuffer;
}

export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string, directUrl?: string) {
  const mimeType = filename.toLowerCase().endsWith('.otf') ? 'font/otf' : (filename.toLowerCase().endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream');
  const blob = new Blob([buffer], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);

  // Trigger browser download via anchor using the verified in-memory blob
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {}
  }, 2000);
}
