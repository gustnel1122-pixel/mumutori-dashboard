"""v3d vector forms plus the original v3b typography for local browser edits."""
import io,json,math
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont
from pdfrw import PdfReader
from pdfrw.buildxobj import pagexobj
from pdfrw.toreportlab import makerl
from fontTools.ttLib import TTFont
ROOT=Path(__file__).resolve().parent;MM=72/25.4
META=json.loads((ROOT/'templates.json').read_text());PDF=PdfReader(str(ROOT/'templates.pdf'))
FORMS=[pagexobj(p) for p in PDF.pages]
pdfmetrics.registerFont(RLFont('PoorStory',str(ROOT/'PoorStory-Regular.ttf')))
FONT=TTFont(ROOT/'PoorStory-Regular.ttf');CMAP=FONT.getBestCmap();UPM=FONT['head'].unitsPerEm
CREAM=(250/255,245/255,229/255);BROWN=(104/255,35/255,1/255)
def width(text,size):return sum(FONT['hmtx'][CMAP[ord(ch)]][0] for ch in text)*size/UPM
def text_bounds(text,baseline,size):
 ys=[]
 for ch in text:
  g=FONT['glyf'][CMAP[ord(ch)]]
  if g.isComposite():g.recalcBounds(FONT['glyf'])
  if hasattr(g,'yMax'):ys.extend([baseline-g.yMax*size/UPM/MM,baseline-g.yMin*size/UPM/MM])
 return min(ys,default=baseline),max(ys,default=baseline)
def lines(item):
 sub=item.get('sub','');special=bool(sub)
 rows=[(item['name'],20.5 if special else 22,23)]
 if item.get('english'):rows.append((item['english'],25 if special else 27,8.5))
 if sub:rows.append((sub,28.5,8))
 return rows
def validate(item):
 for s in [item['name'],item.get('english',''),item.get('sub','')]:
  if any(ord(ch) not in CMAP for ch in s):raise ValueError('PoorStory 글꼴에 없는 문자가 있어요. 문구를 확인해 주세요.')
 for text,y,size in lines(item):
  if width(text,size)>83*MM:raise ValueError(item['name']+': 문구가 칸보다 길어요. 짧게 적어 주세요.')
 if not isinstance(item.get('price'),(int,float)) or not 0<=item['price']<=9999999:raise ValueError('가격을 숫자로 적어 주세요.')
def form(c,index,x,y,w,h):
 obj=FORMS[index];bw=float(obj.BBox[2])-float(obj.BBox[0]);bh=float(obj.BBox[3])-float(obj.BBox[1])
 c.saveState();c.translate(x*MM,(297-y-h)*MM);c.scale(w*MM/bw,h*MM/bh);c.doForm(makerl(c,obj));c.restoreState()
def exact(item):
 return next((r for r in META['exact'] if all(item.get(k,'')==r.get(k,'') for k in ['kind','name','english','price','sub'])),None)
def dynamic(c,item,x,y,w,h,reverse=False):
 validate(item);scale=w/85
 c.saveState();c.translate(x*MM,(297-y-h)*MM);c.scale(scale,scale)
 path=c.beginPath();path.rect(0,0,85*MM,55*MM);c.clipPath(path,stroke=0)
 c.setFillColorRGB(*CREAM);c.rect(0,0,85*MM,55*MM,fill=1,stroke=0)
 dy=0
 if not reverse and item['kind']=='sticker':
  bounds=[META['cleanInkMM'][1],META['cleanInkMM'][3]]
  for text,baseline,size in lines(item):bounds.extend(text_bounds(text,baseline,size))
  bounds.extend(text_bounds(f"{int(item['price']):,}",39.5 if item.get('sub') else 38,36))
  dy=(55-max(bounds)-min(bounds))/2
 c.saveState();c.translate(0,-dy*MM);c.doForm(makerl(c,FORMS[META['pages']['back' if reverse else 'clean']]));c.restoreState()
 if not reverse:
  c.setFillColorRGB(*BROWN)
  for text,baseline,size in lines(item):
   c.setFont('PoorStory',size);c.drawString((85*MM-width(text,size))/2,(55-baseline-dy)*MM,text)
  digits=f"{int(item['price']):,}";suffix=' 원';xx=(85*MM-width(digits,36)-width(suffix,18))/2;yy=(55-(39.5 if item.get('sub') else 38)-dy)*MM
  c.setFont('PoorStory',36);c.drawString(xx,yy,digits);c.setFont('PoorStory',18);c.drawString(xx+width(digits,36),yy,suffix)
 if item['kind']=='sticker':
  c.setStrokeColorRGB(.62,.62,.62);c.setLineWidth(.22/scale);c.rect(0,0,85*MM,55*MM,stroke=1,fill=0)
 c.restoreState()
def make_pdf(items,kind,reverse=False):
 capacity=18 if kind=='sticker' else 10;pages=math.ceil(len(items)/capacity);buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(210*MM,297*MM),invariant=1)
 c.setTitle('무무토리 가격표 '+('스티커' if kind=='sticker' else '카드 뒷면' if reverse else '카드 앞면'));c.setAuthor('무무토리')
 for pg in range(pages):
  guide=META['pages']['stickerGuide' if kind=='sticker' else 'backGuide' if reverse else 'frontGuide'];form(c,guide,0,0,210,297)
  batch=items[pg*capacity:(pg+1)*capacity]
  for i,item in enumerate(batch):
   w,h=(60,55*60/85) if kind=='sticker' else (85,55)
   x,y=(10+(i%3)*65,20+(i//3)*(h+5)) if kind=='sticker' else (20+(i%2)*85,12+(i//2)*55)
   known=exact(item)
   if reverse:form(c,META['pages']['back'],x,y,w,h)
   elif known:form(c,known['page'],x,y,w,h)
   else:dynamic(c,item,x,y,w,h)
  if kind=='card':
   rows=math.ceil(len(batch)/2);c.setStrokeColorRGB(.62,.62,.62);c.setLineWidth(.25)
   # The v3d header already contains the original top crop marks.
   for x in [20,105,190]:c.line(x*MM,(297-(12+55*rows+1))*MM,x*MM,(297-(12+55*rows+2.5))*MM)
   for yy in [12+55*i for i in range(rows+1)]:
    for a,b in [(17,19),(191,193)]:c.line(a*MM,(297-yy)*MM,b*MM,(297-yy)*MM)
  c.showPage()
 c.save();return buf.getvalue()
def make_pricetags(payload):
 items=json.loads(payload)['items']
 if not items or len(items)>300:raise ValueError('가격표는1~300개를 담아 주세요.')
 shapes={}
 for item in items:
  if item['kind'] not in ['card','sticker']:raise ValueError('모양을 확인해 주세요.')
  key=str(item.get('productId',''));shapes.setdefault(key,set()).add(item['kind']);validate(item)
 if any(len(k)>1 for k in shapes.values()):raise ValueError('같은 상품이 카드와 스티커에 모두 담겼어요.')
 cards=[p for p in items if p['kind']=='card'];stickers=[p for p in items if p['kind']=='sticker'];out=[]
 if cards:out.extend([('front',make_pdf(cards,'card')),('back',make_pdf(cards,'card',True))])
 if stickers:out.append(('sticker',make_pdf(stickers,'sticker')))
 return out
