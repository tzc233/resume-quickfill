const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.RQF_PLAYWRIGHT || 'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();
  const root=path.resolve(__dirname,'..');
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://rqf.test')return route.abort();const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':'text/html'})});
  await page.goto('http://rqf.test/test/preserve-learning-v2.html');
  await page.locator('#gender').focus();await page.locator('#gender').press('ArrowDown');await page.locator('#gender').press('End');await page.locator('#gender').press('Enter');await page.locator('#gender').press('Tab');
  assert.equal(await page.locator('#gender').inputValue(),'f','keyboard selection');
  await page.locator('#answer').fill('人工研究方向');
  await page.locator('#note').fill('另一条人工回答');
  await page.locator('#mail').fill('test@example.com');
  await page.locator('.repeat').nth(1).fill('只属于第二段');
  await page.locator('#captcha').fill('9876');
  await page.locator('#nature').click();await page.getByRole('option',{name:'民营',exact:true}).click();
  await page.waitForTimeout(800);
  const memory=await page.evaluate(()=>chrome.storage.local.get('rqfV2LearnedSelections'));
  const values=Object.values(memory.rqfV2LearnedSelections||{}).map(r=>r.text);
  for(const value of ['女','人工研究方向','另一条人工回答','民营','test@example.com','只属于第二段'])assert(values.includes(value),'not learned: '+value);
  assert(!values.includes('9876'),'captcha was learned');
  await page.evaluate(()=>{document.querySelector('#gender').value='';answer.value='';note.value='';mail.value='';document.querySelectorAll('.repeat').forEach(el=>el.value='');captcha.value='';nature.parentElement.querySelector('span').textContent='';changes=[]});
  await page.evaluate(()=>Promise.all([__RQF_V2.fill(profile),__RQF_V2.fill(profile)]));
  assert.equal(await page.locator('#mail').inputValue(),'test@example.com','known field missing from profile uses learned text');
  assert.deepEqual(await page.locator('.repeat').evaluateAll(els=>els.map(e=>e.value)),['','只属于第二段']);
  assert.equal(await page.evaluate(()=>changes.filter(x=>x==='gender').length),1,'concurrent fill must write once');
  const state=await page.evaluate(()=>({name:document.querySelector('#name').value,gender:gender.value,ethnicity:ethnicity.value,answer:answer.value,note:note.value,city:city.parentElement.textContent.trim(),home:home.parentElement.textContent.trim(),nature:nature.parentElement.textContent.trim()}));
  assert.deepEqual(state,{name:'人工姓名',gender:'f',ethnicity:'other',answer:'人工研究方向',note:'另一条人工回答',city:'杭州',home:'南京',nature:'民营'});
  await page.evaluate(()=>changes=[]);
  const second=await page.evaluate(()=>__RQF_V2.fill(profile));
  assert.equal(second.filled.length,0,'second run must not fill occupied controls');
  assert.deepEqual(await page.evaluate(()=>changes),[],'second run emitted changes');
  await page.locator('#answer').fill('');await page.locator('#note').click();await page.waitForTimeout(700);
  const found=await page.evaluate(()=>{const f=__RQF_V2_PARTS.discover();return __RQF_V2_PARTS.learnedTextFor(f.find(x=>x.el.id==='answer'),f)});
  assert.equal(found,null,'manual clear should forget previous text');
  console.log(JSON.stringify({pass:true,checks:['trusted text/select/portal events','concurrent memory writes','sensitive exclusion','legacy respects learned choice','occupied text and first native option retained','Ant/AUI display retained','second run zero writes','manual clearing forgets']}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
