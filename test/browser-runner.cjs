const fs = require('fs');
const path = require('path');
const {chromium} = require(process.env.RQF_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const pages = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  let failed = false;
  try {
    for (const name of pages) {
      const page = await browser.newPage();
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://rqf.test') return route.abort();
        const file = path.resolve(root, '.' + url.pathname);
        if (!file.startsWith(root + path.sep)) return route.abort();
        return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html'});
      });
      await page.addInitScript(() => window.addEventListener('message', e => {if(e.data?.__rqf) window.result=e.data}));
      page.on('pageerror', e => console.error(name, e.message));
      try {
        await page.goto('http://rqf.test/test/' + name + '?run=1');
        await page.waitForFunction(() => window.result, {}, {timeout: 120000});
        const result = await page.evaluate(() => window.result);
        console.log(JSON.stringify({page: name, ...result})); failed ||= !result.pass;
      } catch(e) { failed = true; console.log(JSON.stringify({page:name,error:e.message})); }
      await page.close();
    }
  } finally {await browser.close();}
  process.exitCode = failed ? 1 : 0;
})();
