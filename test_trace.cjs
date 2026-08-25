const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Make dummy png
  const Jimp = require('jimp');
  await new Promise(r => new Jimp(200, 200, '#ffffff', (err, img) => img.write('test.png', r)));
  const imgData = fs.readFileSync('test.png').toString('base64');
  
  const html = `<!DOCTYPE html><html><body><script>
    async function run() {
      try {
        const bin = window.atob('${imgData}');
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const file = new File([arr], 'test.png', { type: 'image/png' });
        
        const fd = new FormData();
        fd.append('image', file);
        
        const res = await fetch('/api/trace', { method: 'POST', body: fd });
        const text = await res.text();
        console.log("STATUS:", res.status);
        console.log("RESPONSE:", text.substring(0, 100));
      } catch (e) {
        console.log("ERR:", e.message);
      }
    }
    run();
  </script></body></html>`;
  
  fs.writeFileSync('public/test_trace.html', html);
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  await page.goto('http://localhost:3000/test_trace.html');
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
