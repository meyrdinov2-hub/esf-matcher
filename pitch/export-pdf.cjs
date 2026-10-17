const puppeteer=require('puppeteer-core');const path=require('path');const fs=require('fs');const {PDFDocument}=require('pdf-lib');
(async()=>{const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});const p=await b.newPage();
await p.setViewport({width:1920,height:1080,deviceScaleFactor:1.5});
const url='file:///'+path.resolve(process.argv[2],'index.html').split(path.sep).join('/');
await p.goto(url+'#1',{waitUntil:'networkidle0'});await p.evaluateHandle('document.fonts.ready');
await p.addStyleTag({content:'.hud,.nav,.card::after{display:none!important}'});
await p.evaluate(()=>document.querySelectorAll('.card').forEach(c=>c.setAttribute('aria-expanded','true')));
const n=await p.$$eval('.slide',s=>s.length);const doc=await PDFDocument.create();
for(let i=1;i<=n;i++){await p.evaluate(i=>{location.hash='#'+i},i);await new Promise(r=>setTimeout(r,2800));
const jpg=await p.screenshot({type:'jpeg',quality:88});const img=await doc.embedJpg(jpg);
const pg=doc.addPage([1920,1080]);pg.drawImage(img,{x:0,y:0,width:1920,height:1080});
fs.writeFileSync(path.join(process.argv[4],'final'+i+'.jpg'),jpg);}
doc.setTitle('Подбор номенклатуры во входящих ЭСФ — питч');
const out=await doc.save();fs.writeFileSync(process.argv[3],out);console.log('pages',n,(out.length/1048576).toFixed(2)+' MB');await b.close();})();
