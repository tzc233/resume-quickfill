const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.RQF_PLAYWRIGHT || 'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();
  const root=path.resolve(__dirname,'..');
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://rqf.test')return route.abort();const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':'text/html'})});
  await page.goto('http://rqf.test/test/preserve-learning-v2.html');
  // 没点过「一键填充」的站点:手打的内容不记、也不做任何识别(每次停顿都全页扫描,大页面会卡)
  await page.locator('#answer').fill('不该被记住');await page.locator('#note').click();await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>chrome.storage.local.get('rqfV2LearnedSelections').then(m=>Object.keys(m.rqfV2LearnedSelections||{}).length)),0,'unarmed site must not learn');
  await page.locator('#answer').fill('');
  // 点过一次「一键填充」即对本站启用,并记住这个站点
  await page.evaluate(()=>__RQF_V2.fill({basic:{}}));
  assert(await page.evaluate(()=>chrome.storage.local.get('rqfV2LearnSites').then(m=>!!(m.rqfV2LearnSites||{})[location.hostname])),'fill must arm this site');
  await page.evaluate(()=>{changes=[]});
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
  // 此前启用过的站点:页面一加载就挂上监听,不必先点填充
  await page.goto('http://rqf.test/test/preserve-learning-v2.html?armed=1');
  await page.waitForTimeout(100);
  await page.locator('#answer').fill('启用站点的人工回答');await page.locator('#note').click();await page.waitForTimeout(700);
  const armedMem=await page.evaluate(()=>chrome.storage.local.get('rqfV2LearnedSelections'));
  assert(Object.values(armedMem.rqfV2LearnedSelections||{}).some(r=>r.text==='启用站点的人工回答'),'armed site must learn on load');
  /* 填一段,学会填另一段:先点一次填充(标签都认不出,三段全空),再像用户一样手填第一段 */
  await page.goto('http://rqf.test/test/learn-sibling-v2.html');
  await page.waitForTimeout(150);
  await page.evaluate(()=>__RQF_V2.fill(profile));
  const blk=(i,c)=>page.locator('.blk').nth(i).locator('.'+c);
  assert.equal(await blk(1,'school').inputValue(),'','labels are unrecognized before learning');
  await blk(0,'school').fill('示例大学');await blk(0,'major').click();
  await blk(0,'major').fill('示例专业甲');await blk(0,'start').click();
  await blk(0,'start').fill('2024.09');await blk(0,'level').focus();
  await blk(0,'level').selectOption({label:'硕士研究生'});await page.locator('#contact').click();
  await page.waitForTimeout(1500);
  const vals=async(i)=>[await blk(i,'school').inputValue(),await blk(i,'major').inputValue(),await blk(i,'start').inputValue(),
    await blk(i,'level').evaluate(s=>s.selectedOptions[0]?.textContent||'')];
  assert.deepEqual(await vals(0),['示例大学','示例专业甲','2024.09','硕士研究生'],'user block untouched');
  assert.deepEqual(await vals(1),['示例学院','示例专业乙','2020.09','本科'],'sibling block filled from record 2 with learned date format');
  assert.deepEqual(await vals(2),['','','','请选择'],'no third record: leave empty');
  // 下次点填充:学会的规律直接用(先清空第二段)
  await page.evaluate(()=>{const b=document.querySelectorAll('.blk')[1];b.querySelectorAll('input').forEach(x=>x.value='');b.querySelector('select').value='';});
  await page.evaluate(()=>__RQF_V2.fill(profile));
  assert.deepEqual(await vals(1),['示例学院','示例专业乙','2020.09','本科'],'next fill reuses learned meaning');
  // 对不上档案的值不学;能对上多个栏目的值不学
  await page.locator('#contact').fill('示例随便写');await page.locator('#edu').click();await page.waitForTimeout(700);
  const rows=await page.evaluate(async()=>Object.entries((await chrome.storage.local.get('rqfV2LearnedSelections')).rqfV2LearnedSelections||{}).filter(([k])=>k.includes('|sem:')).map(([k,r])=>r.path));
  assert(rows.includes('education.school')&&rows.includes('education.major')&&rows.includes('education.startTime')&&rows.includes('education.degree'),'learned meanings stored: '+rows);
  assert(!rows.some(p=>p.startsWith('basic.')),'unmatched value learned nothing');
  console.log(JSON.stringify({pass:true,checks:['sibling block learned from one manual block','learned date format','no record no fill','next fill reuses meaning','unmatched value not learned','unarmed site learns nothing','fill arms site','armed site learns on load','trusted text/select/portal events','concurrent memory writes','sensitive exclusion','legacy respects learned choice','occupied text and first native option retained','Ant/AUI display retained','second run zero writes','manual clearing forgets']}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
