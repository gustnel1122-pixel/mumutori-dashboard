export const SIZE=108,MAX_PAGES=100;
export const SHEET=Object.freeze({width:210,height:297,columns:9,rows:12,pitch:22.5,diameter:20,cx:15.7,cy:24.15,dx:0.7,dy:0.6});
const clean=v=>String(v??'').trim();
export function validEAN8(code){return /^\d{8}$/.test(code)&&(+code[7]===(10-[...code.slice(0,7)].reduce((s,n,i)=>s+(+n)*(i%2?1:3),0)%10)%10);}
export function labelErrors(p){
 if(!p)return ['상품을 골라 주세요.'];
 const errors=[];
 for(const [k,t] of [['name','품명'],['material','재질'],['origin','제조국 / 원산지'],['age','사용 연령'],['seller','판매원']])if(!clean(p[k]))errors.push(t+'을 적어 주세요.');
 if(!validEAN8(clean(p.barcode)))errors.push('8자리 바코드와 마지막 확인 숫자를 확인해 주세요.');
 if(['name','material','origin','age','seller'].some(k=>clean(p[k]).length>80))errors.push('문구를80자이내로 줄여 주세요.');
 return errors;
}
export function toEngine(p){return {'품명':clean(p.name),'재질':clean(p.material),'원산지':clean(p.origin),'연령':clean(p.age),'바코드':clean(p.barcode),'칸수':1,'수입판매원':clean(p.seller),'판매원표기':clean(p.sellerRole),'원산지표기':clean(p.originWord)};}
export function newSheet(){return Array(SIZE).fill(null);}
export function clonePages(pages){return pages.map(p=>p.map(v=>v?{...v}:null));}
export function rangeSelection(a,b){const [ra,ca]=[Math.floor(a/9),a%9],[rb,cb]=[Math.floor(b/9),b%9];const out=[];for(let r=Math.min(ra,rb);r<=Math.max(ra,rb);r++)for(let c=Math.min(ca,cb);c<=Math.max(ca,cb);c++)out.push(r*9+c);return out;}
export function fillFrom(pages,page,start,count,label,locked=[]){
 if(!Number.isInteger(start)||start<1||start>108||!Number.isInteger(count)||count<1||count>MAX_PAGES*SIZE)throw Error('시작칸은1~108,칸수는1이상으로적어주세요.');
 const begin=page*108+start-1,end=begin+count;
 if(end>MAX_PAGES*108)throw Error('한번에100장까지만들수있어요.');
 const next=clonePages(pages);while(next.length*108<end)next.push(newSheet());
 for(let g=begin;g<end;g++){const pi=Math.floor(g/108),s=g%108;if(s<(locked[pi]||0))throw Error('이미쓴앞칸은채울수없어요. 시작칸을뒤로옮겨주세요.');next[pi][s]={...label};}
 return next;
}
export function stats(pages){let total=0,invalid=0;const byCode={};for(const page of pages)for(const p of page)if(p){total++;if(labelErrors(p).length)invalid++;byCode[p.barcode]=(byCode[p.barcode]||0)+1;}return {total,invalid,blank:pages.length*108-total,pages:pages.length,byCode};}
export function projectCatalog(raw,rules){
 const products=Array.isArray(raw?.products)?raw.products:Object.values(raw?.products||{});
 const safe=[];
 for(const p of products){
  if(!p||typeof p!=='object')continue;
  const barcode=clean(p.sale?.barcode||p.barcode||p.goods?.barcode),spec=rules.specs?.[barcode]||{};
  const material=clean(p.label?.material||p.material||spec.material),origin=clean(p.label?.origin||p.origin||spec.origin);
  safe.push({id:clean(p.id),name:clean(spec.labelName||p.name),barcode,material,origin,age:clean(p.label?.age||spec.age||'14'),seller:'무무토리',sellerRole:clean(p.label?.sellerRole||spec.sellerRole||(origin==='대한민국'||origin==='한국'?'판매원':'수입·판매원')),originWord:clean(p.label?.originWord||spec.originWord||(origin==='대한민국'||origin==='한국'?'제조국':'원산지')),decision:clean(p.sale?.decision),variant:false});
  for(const v of rules.variants||[])if(v.parentId===p.id&&Array.isArray(p.goods?.options)&&p.goods.options.some(o=>o.name===v.option)){
   const vs=rules.specs?.[v.barcode]||{};safe.push({id:clean(p.id)+'-'+v.barcode,name:v.name,barcode:v.barcode,material:vs.material||material,origin:vs.origin||origin,age:vs.age||'14',seller:'무무토리',sellerRole:vs.sellerRole||'판매원',originWord:vs.originWord||'제조국',decision:clean(p.sale?.decision),variant:true});
  }
 }
 return safe;
}
export async function readCatalog({auth,fetchImpl=fetch,rules}){
 const user=auth.current();if(!user?.uid)throw Error('운영홈계정으로로그인해주세요.');
 const url=await auth.dbUrl('productCatalogPrivate/products_v5');
 if(auth.current()?.uid!==user.uid)throw Error('로그인이바뀌었어요.');
 const response=await fetchImpl(url,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
 if(auth.current()?.uid!==user.uid)throw Error('로그인이바뀌었어요.');
 if(response.status===401||response.status===403)throw Error('이계정은상품목록을볼수없어요.');
 if(!response.ok)throw Error('상품목록을읽지못했어요. 다시불러와주세요.');
 const raw=await response.json();if(auth.current()?.uid!==user.uid)throw Error('로그인이바뀌었어요.');
 return projectCatalog(raw,rules);
}
export function readUsed(storage){try{const n=JSON.parse(storage.getItem('mumutori-labels-used-v1')||'null');return Number.isInteger(n?.slot)&&n.slot>=1&&n.slot<=108?n:null;}catch{return null;}}
export function rememberUsed(storage,slot){if(!Number.isInteger(slot)||slot<1||slot>108)return false;try{storage.setItem('mumutori-labels-used-v1',JSON.stringify({slot,at:new Date().toISOString()}));return true;}catch{return false;}}
