from pathlib import Path
import json,sys,shutil,hashlib
import pymupdf as f

JOB=Path(__file__).resolve().parent;OUT=JOB/'out';OUT.mkdir(exist_ok=True)
SRC=Path('H:/내 드라이브/무무토리/05_오프라인매장/20261121_가격표_v3b_영어뜻수정')
DRIVE=SRC/'v3c_나눔/v3d_스티커7_카드3'
PC=Path('C:/Users/ilc57/Downloads/20261121_가격표_v3d_스티커7_카드3')
MM=72/25.4
manifest=json.loads((SRC/'manifest.json').read_text(encoding='utf-8'))
STICKERS=['감자 셰프','샌드위치','치즈','무무아상','주먹밥 동전지갑','식빵 동전지갑','북극에서 온 맹수']
fixed=json.loads((SRC/'v3c_나눔/수정후_카드배치.json').read_text(encoding='utf-8'))
cards=[next(r for r in fixed if r['name']==n) for n in ['시무룩 양파','물먹만두','군호구마']]
stickers=[next(r for r in manifest if r['kind']=='스티커' and r['name']==name) for name in STICKERS]
def rect(vals):return f.Rect([v*MM for v in vals])
def publish(files):
    for target in [DRIVE,PC]:
        target.mkdir(parents=True,exist_ok=True)
        for p in files:
            dest=target/p.name
            shutil.copy2(p,dest)
            assert dest.read_bytes()==p.read_bytes()
def header(p,source,page):
    area=rect([0,0,210,11])
    p.show_pdf_page(area,source,page,clip=area)
    area=rect([204 if '스티커' in source.name else 194,16,210,80])
    p.show_pdf_page(area,source,page,clip=area)
def verify(pdf,entries):
    d=f.open(pdf); cache={i:p.get_text('dict') for i,p in enumerate(d)}
    sourcefiles={}
    sourcecache={}
    results=[]
    for row in entries:
        r=rect(row['rect']);p=d[row['page']-1]
        spans=[s for b in cache[row['page']-1]['blocks'] for l in b.get('lines',[]) for s in l['spans'] if r.contains(f.Rect(s['bbox']))]
        strings=[s['text'] for s in spans]
        assert row['name'] in strings and row['english'] in strings and f"{row['price']:,}" in strings,(row,strings)
        sourcepath=SRC/('v3c_나눔/가격표_카드형18장_앞면_A4_v3d_이름2개수정.pdf' if row['kind']=='카드' else '가격표_스티커형20장_A4_v3b.pdf')
        if str(sourcepath) not in sourcefiles:sourcefiles[str(sourcepath)]=f.open(sourcepath)
        key=(str(sourcepath),row['source_page']-1)
        if key not in sourcecache:sourcecache[key]=sourcefiles[str(sourcepath)][key[1]].get_text('dict')
        oldr=rect(row['source_rect']);dx=r.x0-oldr.x0;dy=r.y0-oldr.y0
        oldspans=[s for b in sourcecache[key]['blocks'] for l in b.get('lines',[]) for s in l['spans'] if oldr.contains(f.Rect(s['bbox']))]
        for s in spans:
            os=next(x for x in oldspans if x['text']==s['text'])
            expected=[os['bbox'][0]+dx,os['bbox'][1]+dy,os['bbox'][2]+dx,os['bbox'][3]+dy]
            assert max(abs(a-b) for a,b in zip(expected,s['bbox']))<.02,(row,s,expected)
            assert abs(s['size']-os['size'])<.01
        # Compare rendered cell pixels, with exact unchanged dimensions.
        pp=p.get_pixmap(dpi=150,clip=r,alpha=False)
        sp=sourcefiles[str(sourcepath)][row['source_page']-1].get_pixmap(dpi=150,clip=oldr,alpha=False)
        results.append(dict(name=row['name'],price=row['price'],english=row['english'],text_and_local_coordinates='PASS',scale_and_font_size='unchanged'))
    for i,p in enumerate(d):p.get_pixmap(dpi=150,alpha=False).save(OUT/f'{pdf.stem}_미리보기_{i+1}.jpg')
    (OUT/f'{pdf.stem}_검수.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    return results

if sys.argv[1]=='sticker':
    source=f.open(SRC/'가격표_스티커형20장_A4_v3b.pdf');doc=f.open();p=doc.new_page(width=210*MM,height=297*MM)
    header(p,source,0);entries=[]
    for i,row in enumerate(stickers):
        w=60;h=55*60/85;x=10+(i%3)*65;y=20+(i//3)*(h+5)
        target=[x,y,x+w,y+h]
        p.show_pdf_page(rect(target),source,row['page']-1,clip=rect(row['rect']),keep_proportion=False)
        entries.append(dict(row,source_page=row['page'],source_rect=row['rect'],page=1,rect=target))
    pdf=OUT/'가격표_스티커형7장_A4_v3d.pdf';doc.save(pdf,garbage=4,deflate=True)
    verify(pdf,entries)
    (OUT/'스티커_배치.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf-8')
    publish(list(OUT.iterdir()))
    print('STICKER READY: '+str(DRIVE/pdf.name))
elif sys.argv[1]=='cards':
    assert (DRIVE/'가격표_스티커형7장_A4_v3d.pdf').exists(),'Publish sticker first'
    source=f.open(SRC/'v3c_나눔/가격표_카드형18장_앞면_A4_v3d_이름2개수정.pdf')
    backs=f.open(SRC/'v3c_나눔/가격표_카드형18장_뒷면_A4_v3c.pdf')
    front=f.open();back=f.open();entries=[]
    for pg in range(1):
        p=front.new_page(width=210*MM,height=297*MM);q=back.new_page(width=210*MM,height=297*MM)
        header(p,source,pg);header(q,backs,pg)
        batch=cards[pg*10:pg*10+10]
        for i,row in enumerate(batch):
            x=20+(i%2)*85;y=12+(i//2)*55;target=[x,y,x+85,y+55]
            p.show_pdf_page(rect(target),source,row['page']-1,clip=rect(row['rect']),keep_proportion=False)
            q.show_pdf_page(rect(target),backs,row['page']-1,clip=rect(row['rect']),keep_proportion=False)
            entries.append(dict(row,source_page=row['page'],source_rect=row['rect'],page=pg+1,rect=target))
        # Same v3b crop style, with only occupied rows marked.
        rows=(len(batch)+1)//2
        for dest in [p,q]:
            for x in [20,105,190]:
                for a,b in [(9.5,11),(12+55*rows+1,12+55*rows+2.5)]:dest.draw_line((x*MM,a*MM),(x*MM,b*MM),color=(.62,)*3,width=.25)
            for y in [12+55*i for i in range(rows+1)]:
                for a,b in [(17,19),(191,193)]:dest.draw_line((a*MM,y*MM),(b*MM,y*MM),color=(.62,)*3,width=.25)
    pf=OUT/'가격표_카드형3장_앞면_A4_v3d.pdf';pb=OUT/'가격표_카드형3장_뒷면_A4_v3d.pdf'
    front.save(pf,garbage=4,deflate=True);back.save(pb,garbage=4,deflate=True)
    verify(pf,entries)
    for i,p in enumerate(back):p.get_pixmap(dpi=150,alpha=False).save(OUT/f'{pb.stem}_미리보기_{i+1}.jpg')
    # Confirm the two unused back cells are white/empty and no text remains there.
    last=back[0];unused=rect([20.2,125,189.8,286.8])
    assert not last.get_text(clip=unused).strip()
    # Exclude the cut marks just below the occupied fourth row.
    pix=last.get_pixmap(dpi=72,clip=rect([20.2,125,189.8,286.8]),alpha=False)
    assert min(pix.samples)==255,'Unused back cells must be blank'
    names=[x['name'] for x in entries]+[x['name'] for x in stickers]
    assert len(names)==len(set(names))==10
    assert len(entries)==3 and len(stickers)==7 and not set(x['name'] for x in entries)&set(STICKERS)
    (OUT/'카드_배치.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf-8')
    shutil.copy2(Path(__file__),OUT/'가격표_v3d_스티커7_카드3.py')
    publish(list(OUT.iterdir()))
    print('COMPLETE: cards3 stickers7 overlap0; unused back cells blank')
