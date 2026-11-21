from pathlib import Path
import json, math, hashlib, shutil, sys
import pymupdf as f
from PIL import Image, ImageChops

JOB = Path(__file__).resolve().parent
OUT = Path(sys.argv[1]) if len(sys.argv)>1 else JOB/'out'
OUT.mkdir(exist_ok=True)
SRC = Path('H:/내 드라이브/무무토리/05_오프라인매장/20261119_가격표_카드10_부착7')
ORIGINAL = SRC/'v2_사장님고침_2213/가격표_v2_만들기.py'
# Load the original v2 assets, clean template, layout helpers and exact colours.
source = ORIGINAL.read_text(encoding='utf-8')
prefix = source.split('# ---- 카드형 앞면')[0]
prefix = prefix.replace("SRC = Path('/mnt/user-data/uploads/내 드라이브/무무토리/05_오프라인매장/20261119_가격표_카드10_부착7')", 'SRC = Path('+repr(str(SRC))+')')
prefix = prefix.replace("OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)", '')
exec(compile(prefix, str(ORIGINAL), 'exec'), globals())

ITEMS = [('대파입니다', "I'm a Scallion", 3000, 'I am으로 ~입니다의 자기소개 말투 유지.'), ('시무룩 양파', 'Sulky Onion', 3000, '시무룩한 표정과 양파를 그대로 옮김.'), ('생강입니다', "I'm Ginger", 3000, 'I am으로 ~입니다의 자기소개 말투 유지.'), ('억울버섯', 'Wronged Mushroom', 3000, '부당한 일을 당해 억울하다는 뜻 유지.'), ('고추 키링', 'Chili Pepper Keyring', 3000, '고추와 키링을 그대로 옮김.'), ('물멍만두', 'Water-Gazing Dumpling', 3000, '물멍을 water-gazing으로 풀어 씀.'), ('식빵 동전지갑', 'Bread Loaf Coin Purse', 3000, '식빵 모양과 동전지갑 용도 유지.'), ('주먹밥 동전지갑', 'Rice Ball Coin Purse', 3000, '주먹밥 모양과 동전지갑 용도 유지.'), ('샌드위치', 'Sandwich', 3000, '새 수식어 없이 음식 이름 그대로.'), ('치즈', 'Cheese', 3000, '새 수식어 없이 음식 이름 그대로.'), ('무무아상', 'Mumu Croissant', 3000, '무무아상의 원래 합성 요소 두 개를 보존.'), ('식빵ㅎ', 'Bread Loaf, Heh', 3000, 'Heh로 ㅎ의 짧은 웃음을 옮김.'), ('무무왕바게트', 'Mumu King-Size Baguette', 3000, '왕은 큰 크기라는 뜻의 king-size로 유지.'), ('무무포크', 'Mumu Fork', 2500, '무무 이름과 포크를 그대로 옮김.'), ('걍빵', 'Just Bread', 2500, '걍의 꾸밈없는 말투를 just로 유지.'), ('감자 셰프', 'Potato Chef', 3000, '감자와 셰프 역할 그대로.'), ('카피바라 말랑이', 'Capybara Squishy', 3000, '카피바라와 말랑이 종류 그대로.'), ('군고구마', 'Roasted Sweet Potato', 3000, '고구마와 굽는 조리법 그대로.'), ('북극에서 온 맹수', 'Fierce Beasts from the Arctic', 3000, '북극이라는 출신과 맹수 의미를 그대로 유지.'), ('버터 말랑이', 'Butter Squishy', 2500, '버터와 말랑이 종류 그대로.')]

def ctext(page, text, y, size):
    x = (85*MM - font.text_length(text, fontsize=size))/2
    page.insert_text((x, y*MM), text, fontname='PoorStory', fontfile=str(FONT), fontsize=size, color=BROWN)

def card(item, dy=0, reverse=False):
    name, en, price, reason = item
    doc = f.open(); p = doc.new_page(width=85*MM, height=55*MM)
    p.draw_rect(p.rect, color=None, fill=CREAM)
    p.show_pdf_page(f.Rect(0, dy*MM, 85*MM, (55+dy)*MM), back if reverse else clean, 0, clip=clip, keep_proportion=False)
    if reverse: return doc
    arctic = name == '북극에서 온 맹수'
    ctext(p, name, (20.5 if arctic else 22)+dy, 23)
    ctext(p, en, (25 if arctic else 27)+dy, 8.5)
    if arctic: ctext(p, '(개당)', 28.5+dy, 8)
    digits, suffix = f'{price:,}', ' 원'
    x = (85*MM - font.text_length(digits, fontsize=36) - font.text_length(suffix, fontsize=18))/2
    y = ((39.5 if arctic else 38)+dy)*MM
    p.insert_text((x,y), digits, fontname='PoorStory', fontfile=str(FONT), fontsize=36, color=BROWN)
    p.insert_text((x+font.text_length(digits, fontsize=36),y), suffix, fontname='PoorStory', fontfile=str(FONT), fontsize=18, color=BROWN)
    return doc

def ink_bounds(doc):
    pix=doc[0].get_pixmap(matrix=f.Matrix(2,2), alpha=False)
    im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    # Compare against actual rendered cream to avoid raster colour rounding.
    bg=Image.new('RGB', im.size, im.getpixel((0,0)))
    diff=ImageChops.difference(im,bg).convert('L').point(lambda v:255 if v>35 else 0)
    bounds=diff.getbbox()
    return [v/2/MM for v in bounds]

manifest=[]
for reverse in [False]:
    doc=f.open()
    for pg in range(2):
        p=doc.new_page(width=210*MM,height=297*MM)
        guide(p,SET,f'카드형 {"뒷면" if reverse else "앞면"} {pg+1} / 85 x 55mm / 아래 10mm 꽂는 부분 / {"앞면과 같은 위치" if reverse else "새 가격 + 영어 이름"}')
        for i,item in enumerate(ITEMS[pg*10:pg*10+10]):
            x=20+(i%2)*85; y=12+(i//2)*55
            one=card(item, reverse=reverse)
            p.show_pdf_page(f.Rect(x*MM,y*MM,(x+85)*MM,(y+55)*MM),one,0)
            if not reverse:
                b=ink_bounds(one)
                assert b[3] <= 45, (item,b)
                manifest.append(dict(kind='카드',page=pg+1,rect=[x,y,x+85,y+55],name=item[0],english=item[1],price=item[2],bottom_blank_mm=55-b[3]))
        crops(p,5);ruler_v(p)
    doc.save(OUT/('가격표_카드형_뒷면_A4_v3b.pdf' if reverse else '가격표_카드형20장_앞면_A4_v3b.pdf'),garbage=4,deflate=True)

shutil.copy2(Path('H:\\내 드라이브\\무무토리\\05_오프라인매장\\20261121_가격표_v3_영어이름\\가격표_카드형_뒷면_A4_v3.pdf'), OUT/'가격표_카드형_뒷면_A4_v3b.pdf')

doc=f.open()
w,h=60,55*60/85
for pg in range(2):
    p=doc.new_page(width=210*MM,height=297*MM)
    guide(p,SET,f'스티커형 {pg+1} / 60 x 38.8mm / 한 면만 / 위아래 가운데 정렬')
    for i,item in enumerate(ITEMS[pg*18:pg*18+18]):
        x=10+(i%3)*65;y=20+(i//3)*(h+5)
        b=ink_bounds(card(item));dy=(55-b[3]-b[1])/2
        one=card(item,dy=dy); b2=ink_bounds(one)
        r=f.Rect(x*MM,y*MM,(x+w)*MM,(y+h)*MM)
        p.show_pdf_page(r,one,0)
        p.draw_rect(r,color=GRAY,width=.22)
        manifest.append(dict(kind='스티커',page=pg+1,rect=[x,y,x+w,y+h],name=item[0],english=item[1],price=item[2],top_blank_mm=b2[1]*60/85,bottom_blank_mm=(55-b2[3])*60/85,english_pt=8.5*60/85))
    # Outside every label, including the sixth row.
    ruler_v(p,x=207,y=20)
doc.save(OUT/'가격표_스티커형20장_A4_v3b.pdf',garbage=4,deflate=True)

json.dump(manifest,open(OUT/'manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
json.dump(ITEMS,open(OUT/'영어이름20개.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
shutil.copy2(ORIGINAL,JOB/'가격표_v2_만들기_원본보관.py')

# Extract from each final physical cell. Require exact names, English, price,
# no displaced text, no overlap between text rows and no invisible clipping.
checks=[]
for row in manifest:
    fn='가격표_카드형20장_앞면_A4_v3b.pdf' if row['kind']=='카드' else '가격표_스티커형20장_A4_v3b.pdf'
    d=f.open(OUT/fn);p=d[row['page']-1];rect=f.Rect([v*MM for v in row['rect']])
    text=p.get_text(clip=rect)
    assert row['name'] in text,(row,text)
    assert row['english'] in text,(row,text)
    assert f"{row['price']:,}" in text,(row,text)
    spans=[s for b in p.get_text('dict',clip=rect)['blocks'] for l in b.get('lines',[]) for s in l['spans']]
    for s in spans:
        assert rect.contains(f.Rect(s['bbox'])),(row,s)
        assert '\ufffd' not in s['text'] and '\u25a1' not in s['text']
    en=next(s for s in spans if s['text']==row['english'])
    assert en['size']>=5
    # Span bounding boxes include font ascent/descent and must stay disjoint.
    for a,b in zip(spans,spans[1:]):
        if abs(a['bbox'][1]-b['bbox'][1])>0.5:
            assert not f.Rect(a['bbox']).intersects(f.Rect(b['bbox'])),(row,a,b)
    if row['kind']=='스티커': assert abs(row['top_blank_mm']-row['bottom_blank_mm'])<.2
    checks.append(dict(kind=row['kind'],page=row['page'],name=row['name'],passed=True,text=text))
assert len(checks)==40
json.dump(checks,open(OUT/'40칸_텍스트검수.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)

for filename in ['가격표_카드형20장_앞면_A4_v3b.pdf','가격표_카드형_뒷면_A4_v3b.pdf','가격표_스티커형20장_A4_v3b.pdf']:
    d=f.open(OUT/filename)
    for i,p in enumerate(d):
        p.get_pixmap(dpi=150,alpha=False).save(OUT/f'{Path(filename).stem}_미리보기_{i+1}.jpg')
for kind,name in [('카드','주먹밥 동전지갑'),('스티커','북극에서 온 맹수')]:
    row=next(r for r in manifest if r['kind']==kind and r['name']==name)
    fn='가격표_카드형20장_앞면_A4_v3b.pdf' if kind=='카드' else '가격표_스티커형20장_A4_v3b.pdf'
    d=f.open(OUT/fn)
    d[row['page']-1].get_pixmap(dpi=600,clip=f.Rect([v*MM for v in row['rect']]),alpha=False).save(OUT/f'확대_{kind}.jpg')


# Back-translation review table, separate from the unchanged label design.
MEANINGS = [('대파입니다', "I'm a Scallion", 3000, '대파입니다', 'I am으로 ~입니다의 자기소개 말투 유지.'), ('시무룩 양파', 'Sulky Onion', 3000, '시무룩한 양파', '시무룩한 표정과 양파를 그대로 옮김.'), ('생강입니다', "I'm Ginger", 3000, '생강입니다', 'I am으로 ~입니다의 자기소개 말투 유지.'), ('억울버섯', 'Wronged Mushroom', 3000, '억울한 버섯', '부당한 일을 당해 억울하다는 뜻 유지.'), ('고추 키링', 'Chili Pepper Keyring', 3000, '고추 키링', '고추와 키링을 그대로 옮김.'), ('물멍만두', 'Water-Gazing Dumpling', 3000, '물을 멍하니 바라보는 만두', '물멍을 water-gazing으로 풀어 씀.'), ('식빵 동전지갑', 'Bread Loaf Coin Purse', 3000, '식빵 동전지갑', '식빵 모양과 동전지갑 용도 유지.'), ('주먹밥 동전지갑', 'Rice Ball Coin Purse', 3000, '주먹밥 동전지갑', '주먹밥 모양과 동전지갑 용도 유지.'), ('샌드위치', 'Sandwich', 3000, '샌드위치', '새 수식어 없이 음식 이름 그대로.'), ('치즈', 'Cheese', 3000, '치즈', '새 수식어 없이 음식 이름 그대로.'), ('무무아상', 'Mumu Croissant', 3000, '무무 + 크루아상', '무무아상의 원래 합성 요소 두 개를 보존.'), ('식빵ㅎ', 'Bread Loaf, Heh', 3000, '식빵ㅎ(짧은 웃음)', 'Heh로 ㅎ의 짧은 웃음을 옮김.'), ('무무왕바게트', 'Mumu King-Size Baguette', 3000, '무무 왕(큰) 바게트', '왕은 큰 크기라는 뜻의 king-size로 유지.'), ('무무포크', 'Mumu Fork', 2500, '무무포크', '무무 이름과 포크를 그대로 옮김.'), ('걍빵', 'Just Bread', 2500, '그냥 빵(걍빵)', '걍의 꾸밈없는 말투를 just로 유지.'), ('감자 셰프', 'Potato Chef', 3000, '감자 셰프', '감자와 셰프 역할 그대로.'), ('카피바라 말랑이', 'Capybara Squishy', 3000, '카피바라 말랑이', '카피바라와 말랑이 종류 그대로.'), ('군고구마', 'Roasted Sweet Potato', 3000, '구운 고구마(군고구마)', '고구마와 굽는 조리법 그대로.'), ('북극에서 온 맹수', 'Fierce Beasts from the Arctic', 3000, '북극에서 온 맹수들', '북극이라는 출신과 맹수 의미를 그대로 유지.'), ('버터 말랑이', 'Butter Squishy', 2500, '버터 말랑이', '버터와 말랑이 종류 그대로.')]
table=f.open();p=table.new_page(width=1180,height=930)
p.draw_rect(p.rect,color=None,fill=CREAM)
def put(x,y,t,size=12):
    p.insert_text((x,y),t,fontname='PoorStory',fontfile=str(FONT),fontsize=size,color=BROWN)
put(20,30,'가격표 v3b - 한글 이름 / 영어 이름 / 뒤로 번역 / 뜻 확인',20)
for x,t in [(20,'한글 이름'),(170,'영어 이름'),(440,'영어를 다시 한국어로'),(690,'뜻 확인 · 말투')]:put(x,60,t,13)
for i,(name,en,price,backmeaning,reason) in enumerate(MEANINGS):
    y=90+i*40
    for x,t in [(20,name),(170,en),(440,backmeaning),(690,reason)]:put(x,y,t)
    p.draw_line((20,y+13),(1160,y+13),color=(.85,.78,.68),width=.3)
p.get_pixmap(dpi=150,alpha=False).save(OUT/'영어이름_20개_뒤로번역표.jpg')
json.dump(MEANINGS,open(OUT/'영어이름_뒤로번역20개.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print(json.dumps({'cells_passed':len(checks),'pdf_pages':6,'min_card_bottom_mm':min(r['bottom_blank_mm'] for r in manifest if r['kind']=='카드'),'sticker_english_pt':8.5*60/85},ensure_ascii=False))
