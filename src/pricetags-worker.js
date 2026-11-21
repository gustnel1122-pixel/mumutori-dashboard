let ready;const CDN='https://cdn.jsdelivr.net/pyodide/v0.29.0/full/';
const VERSION=new URL(self.location.href).searchParams.get('v')||'';
function asset(path){const u=new URL(path,self.location.href);u.searchParams.set('v',VERSION);return u;}
async function boot(){
 self.postMessage({type:'status',text:'처음 한 번, 가격표 도구를 불러오고 있어요.'});importScripts(CDN+'pyodide.js');
 const py=await loadPyodide({indexURL:CDN});await py.loadPackage(['fonttools','pillow']);
 for(const wheel of ['reportlab-5.1.0-py3-none-any.whl','pdfrw-0.4-py2.py3-none-any.whl']){const r=await fetch(asset('../assets/vendor/labels/'+wheel));if(!r.ok)throw Error('가격표 도구 연결을 확인해 주세요.');py.unpackArchive(await r.arrayBuffer(),'zip',{extractDir:'/lib/python3.13/site-packages'});}
 const dir='/home/pyodide/pricetags';py.FS.mkdirTree(dir);
 await Promise.all(['browser_pricetags.py','templates.pdf','templates.json','PoorStory-Regular.ttf'].map(async n=>{const r=await fetch(asset('../assets/pricetags/'+n));if(!r.ok)throw Error('가격표 도안과 글꼴을 불러오지 못했어요.');py.FS.writeFile(dir+'/'+n,new Uint8Array(await r.arrayBuffer()));}));
 await py.runPythonAsync(`import sys\nsys.path.insert(0,'${dir}')\nfrom browser_pricetags import make_pricetags`);return py;
}
self.onmessage=async e=>{const {id,items}=e.data;try{const py=await(ready??=boot());self.postMessage({type:'status',text:'v3d 도안으로 가격표 PDF를 만들고 있어요.'});py.globals.set('_price_job',JSON.stringify({items}));const obj=await py.runPythonAsync('make_pricetags(_price_job)');const values=obj.toJs();obj.destroy();py.globals.delete('_price_job');const files=values.map(([key,bytes])=>({key,bytes}));self.postMessage({type:'result',id,files},files.map(f=>f.bytes.buffer));}catch(error){ready=undefined;self.postMessage({type:'error',id,message:String(error.message||error).split('\n').filter(Boolean).slice(-1)[0]});}};
