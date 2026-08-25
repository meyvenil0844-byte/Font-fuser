const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/test_font_root.html', { waitUntil: 'networkidle2' });
  const text = await page.evaluate(() => document.body.innerHTML);
  console.log("RESULT_ROOT:", text);
  await browser.close();
})();
