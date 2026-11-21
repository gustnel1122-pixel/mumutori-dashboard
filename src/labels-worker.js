/* Python and label inputs stay inside this worker. No catalog or network writes. */
let ready;
const ROOT=new URL('../assets/labels/engine/',self.location.href);
const CDN='https://cdn.jsdelivr.net/pyodide/v0.29.0/full/';
const VERSION=new URL(self.location.href).searchParams.get('v')||'';
function asset(name,base=ROOT){const url=new URL(name,base);url.searchParams.set('v',VERSION);return url;}
const status=text=>self.postMessage({type:'status',text});
async function boot(){
  status('처음 한 번, 라벨 도구를 불러오고 있어요.');
  importScripts(CDN+'pyodide.js');
  const py=await loadPyodide({indexURL:CDN});
  await py.loadPackage(['fonttools','shapely','pillow']);
  const wheel=await fetch(asset('../assets/vendor/labels/reportlab-5.1.0-py3-none-any.whl',self.location.href));
  if(!wheel.ok)throw Error('라벨 도구 파일을 불러오지 못했어요.');
  py.unpackArchive(await wheel.arrayBuffer(),'zip',{extractDir:'/lib/python3.13/site-packages'});
  const dir='/home/pyodide/round_label_v6';py.FS.mkdirTree(dir+'/fonts');
  const files=['rlkit.py','make_round_label_offset.py','tag_geom.json','browser_bridge.py',...['Arimo[wght].ttf','Gaegu-Bold.ttf','NanumSquareRoundB.ttf','NanumSquareRoundEB.ttf','NanumSquareRoundR.ttf','Pretendard-Bold.otf','Pretendard-Medium.otf'].map(n=>'fonts/'+n)];
  await Promise.all(files.map(async name=>{const r=await fetch(asset(name));if(!r.ok)throw Error('글꼴과 라벨 틀을 불러오지 못했어요.');py.FS.writeFile(dir+'/'+name,new Uint8Array(await r.arrayBuffer()));}));
  await py.runPythonAsync(`import sys\nsys.path.insert(0,'${dir}')\nfrom browser_bridge import make_labels`);
  return py;
}
self.onmessage=async event=>{
  const {id,pages}=event.data;
  try{
    const py=await(ready??=boot());status('같은 라벨 틀로 PDF를 만들고 있어요.');
    py.globals.set('_label_payload',JSON.stringify({pages}));
    const result=await py.runPythonAsync('make_labels(_label_payload)');
    const parts=result.toJs();result.destroy();py.globals.delete('_label_payload');
    const bytes=parts[0];const meta=JSON.parse(parts[1]);
    self.postMessage({type:'result',id,bytes,meta},[bytes.buffer]);
  }catch(error){ready=undefined;self.postMessage({type:'error',id,message:String(error.message||error).split('\n').filter(Boolean).slice(-1)[0]});}
};
