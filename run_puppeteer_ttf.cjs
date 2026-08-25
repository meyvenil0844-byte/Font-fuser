const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const html = `
  <!DOCTYPE html>
  <html><body>
  <script>
    fetch('/traced_font_test.ttf').then(res => res.arrayBuffer()).then(buffer => {
      const fontFace = new FontFace('Test', buffer);
      return fontFace.load();
    }).then(() => {
      document.body.innerHTML = 'SUCCESS_TTF';
    }).catch(e => {
      document.body.innerHTML = 'ERROR_TTF: ' + e.message;
    });
  </script>
  </body></html>
  `;
  const fs = require('fs');
  fs.writeFileSync('public/test_ttf.html', html);
  fs.copyFileSync('traced_font_test.ttf', 'public/traced_font_test.ttf');
  
  await page.goto('http://localhost:3000/test_ttf.html', { waitUntil: 'networkidle2' });
  const text = await page.evaluate(() => document.body.innerHTML);
  console.log("RESULT_TTF:", text);
  await browser.close();
})();
