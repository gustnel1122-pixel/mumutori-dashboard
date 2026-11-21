"""Browser-only adapter. Original v6 solve/draw functions are kept unchanged."""
import io,json,hashlib
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import rlkit as R
import make_round_label_offset as V
_keys={'A','G','NB','NEB','NR','B','M'}
R.FONT_FILES={k:v for k,v in R.FONT_FILES.items() if k in _keys}
R.FALLBACK={k:v for k,v in R.FALLBACK.items() if k in _keys and v in _keys}
R.load_fonts('/home/pyodide/round_label_v6/fonts');R.DIGIT_FK=V.FONT['digits']
R.SHEET['CX0']=15.7;R.SHEET['CY0']=24.15
_cache={}
def make_labels(payload):
    job=json.loads(payload);pages=job['pages']
    if not isinstance(pages,list) or not 1<=len(pages)<=100:raise ValueError('라벨 장수를 확인해 주세요.')
    layouts={};codes=[];summaries=[]
    for page in pages:
        if len(page)!=108:raise ValueError('한 장은108칸이어야 해요.')
        for raw in page:
            if raw is None:continue
            key=json.dumps(raw,sort_keys=True,ensure_ascii=False)
            if key in layouts:continue
            p,errors,warnings=V.normalize(raw,1)
            if errors:raise ValueError(' / '.join(errors))
            if any(len(str(raw.get(k,'')))>160 for k in ['품명','재질','원산지','연령','수입판매원']):raise ValueError('입력문구가너무길어요.')
            if key not in _cache:
                L=V.solve(p)
                if L is None:raise ValueError(p['name']+': 품명이나재질문구를짧게적어주세요.')
                _cache[key]=(p,L)
            p,L=_cache[key];layouts[key]=(p,L)
            desc,notes=V.describe(p,L);summaries.append({'name':p['name'],'barcode':p['code'],'layout':desc,'notes':notes})
    if not layouts:raise ValueError('상품을넣을칸을먼저골라주세요.')
    buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(210*mm,297*mm),invariant=1)
    c.setTitle('무무토리 PP7108 라벨');c.setAuthor('무무토리');c.setSubject('실제크기100% · 여백없음해제 · 오른쪽0.7mm·위0.6mm')
    forms={}
    for i,(key,(p,L)) in enumerate(layouts.items()):
        name='L'+str(i);forms[key]=name;c.beginForm(name,lowerx=-12*mm,lowery=-12*mm,upperx=12*mm,uppery=12*mm);V.draw_label(c,0,0,p,L);c.endForm()
    for pi,page in enumerate(pages):
        for slot,raw in enumerate(page):
            if raw is None:continue
            row,col=divmod(slot,9);x=15.7+col*22.5;y=297-(24.15+row*22.5)
            key=json.dumps(raw,sort_keys=True,ensure_ascii=False)
            c.saveState();c.translate(x*mm,y*mm);c.doForm(forms[key]);c.restoreState()
            codes.append({'page':pi,'slot':slot,'barcode':str(raw['바코드'])})
        c.showPage()
    c.save()
    return buf.getvalue(),json.dumps({'cells':codes,'layouts':summaries,'pages':len(pages),'total':len(codes),'blank':len(pages)*108-len(codes)},ensure_ascii=False)
