#!/usr/bin/env python3
"""무무토리 원형 20mm 택 라벨 만들기 v5 (고정 틀 = 2026-11-12 v3 H 배치 · 글꼴 = 사장님 사진 느낌)

  위 둘레 '재질 ○○'(개구 Bold, 넓게) → 품명(나눔스퀘어라운드 ExtraBold + 덧대기) → EAN-8 바코드(숫자 Arimo)
  → 수입·판매원(나눔스퀘어라운드 Bold) + 무무토리(나눔스퀘어라운드 ExtraBold + 덧대기) → 아래 둘레 '원산지 ○○ · ○세 이상'(개구 Bold)

사용:
  python3 make_round_label.py 상품표.csv --out 출력폴더 [--mix] [--compare 비교.png] [--no-test]

상품표(CSV · UTF-8, 또는 JSON 목록) — 한 줄 = 한 상품:
  품명*        라벨에 크게 들어갈 이름 (길면 자동으로 줄임 · 너무 길면 '표시품명'에 짧게)
  표시품명      (선택) 라벨에만 쓸 짧은 이름
  재질*        예) 폴리에스테르 / 폴리에스테르 100% / 면 60% 폴리에스테르 40%
  표시재질      (선택) 라벨에만 쓸 짧은 재질 (재질이 너무 길어 '못 만듦'이 뜰 때)
  원산지*      예) 중국
  연령*        예) 14  → '14세 이상'  (숫자가 아니면 적은 그대로)
  바코드       8자리 EAN-8 (체크 숫자 검사). 비우면 '상품번호'로 만듦
  상품번호      6자리 → '2' + 상품번호 + 체크 숫자 (가게 안 전용 번호)
  수입판매원    기본 무무토리
  판매원표기    기본 '수입·판매원' (국내 제조면 '제조·판매원' 등)
  원산지표기    기본 '원산지' (또는 '제조국')
  칸수         108칸 중 몇 칸 (기본 108)
"""
import argparse, csv, io, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rlkit as R
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor

# ---------------- 고정 틀 (v3 H 배치 · v5 글꼴) — 바꾸면 모든 상품 라벨 모양이 바뀜 ----------------
FONT = dict(title='NEB', imp='NB', brand='NEB', rim='G', inner='NB', digits='A', title_fallback='B')
STROKE = dict(title=0.0, brand=0.04)   # 획 덧대기 (글자 크기 대비, 양쪽 합) — v6: 품명은 덧대기 없이(사장님 11/16 '번져 · 좀만 얇게') · 무무토리는 그대로
DESIGN = dict(
    title_pt=5.89,       # 품명 (나눔스퀘어라운드 ExtraBold + 덧대기)
    imp_pt=4.05,         # '수입·판매원' (나눔스퀘어라운드 Bold)
    brand_pt=4.97,       # 판매원 이름 (나눔스퀘어라운드 ExtraBold + 덧대기)
    rim_pt=4.2,          # 둘레 글씨 (개구 Bold). 개구는 글자가 작게 생겨 4.2pt ≈ Pretendard 3.1pt 높이 — 인쇄 확인
    rim_track=-0.05,     # 개구는 글자 사이가 원래 넓어서 조금 좁혀도 사진처럼 띄어 보임
    rim_tracks=(-0.05, -0.08, -0.11),   # 자리가 모자랄 때 둘레 자간 단계
    module=0.22, bar_h=3.4,
)
# --rim-plain: 둘레를 읽기 쉬운 나눔스퀘어라운드 Regular 3.8pt로 (개구가 인쇄에서 잘 안 읽힐 때)
RIM_PLAIN = dict(font='NR', rim_pt=3.8, rim_track=0.04, rim_tracks=(0.04, 0.02, 0.0))
MIN = dict(title_pt=4.4, text_pt=3.8, module=0.20, bar_h=3.0)   # 둘레(개구)는 고정 5.0pt = 글자 높이로 3.8pt 상당
# 자리가 모자랄 때 줄이는 순서는 아래 STEPS (품명 글자 → 둘레 자간 → 작은 글자(최소 3.8pt) → 막대 3.2mm → 모듈 0.21 · 0.20 · 막대 3.0)

ALIASES = {'품명': ['품명', 'name', '상품명'], '표시품명': ['표시품명', 'label_name'], '재질': ['재질', 'material'], '표시재질': ['표시재질', 'label_material'],
           '원산지': ['원산지', 'origin', '제조국'], '연령': ['연령', 'age', '사용연령'], '바코드': ['바코드', 'barcode', 'ean8'],
           '상품번호': ['상품번호', 'sku', 'item_no'], '수입판매원': ['수입판매원', 'importer', '판매원'],
           '판매원표기': ['판매원표기'], '원산지표기': ['원산지표기'], '칸수': ['칸수', '장수', 'count']}


def read_table(path):
    if path.lower().endswith('.json'):
        rows = json.load(open(path, encoding='utf-8'))
    else:
        rows = list(csv.DictReader(open(path, encoding='utf-8-sig')))
    out = []
    for r in rows:
        g = {}
        for k, al in ALIASES.items():
            for a in al:
                if a in r and str(r[a]).strip() != '':
                    g[k] = str(r[a]).strip(); break
        out.append(g)
    return out


def normalize(p, idx):
    errs, warns = [], []
    for k in ('품명', '재질', '원산지', '연령'):
        if not p.get(k):
            errs.append(f'{k} 칸이 비었어요')
    code = p.get('바코드', '').replace(' ', '')
    if code:
        if not R.ean8_valid(code):
            errs.append(f'바코드 {code}: 8자리 EAN-8 체크 숫자가 맞지 않아요'
                        + (f' (앞 7자리면 체크 숫자는 {R.ean8_check(code[:7])})' if len(code) >= 7 and code[:7].isdigit() else ''))
    elif p.get('상품번호'):
        sku = re.sub(r'\D', '', p['상품번호'])
        if len(sku) != 6:
            errs.append(f"상품번호 '{p['상품번호']}'는 숫자 6자리여야 해요")
        else:
            code = R.ean8_full('2' + sku)
    else:
        errs.append('바코드 또는 상품번호가 필요해요')
    if code and not code.startswith(('2', '0')):
        warns.append(f'바코드 {code}는 가게 안 전용(2 · 0으로 시작) 번호가 아니에요 — 정식(GS1) 번호인지 확인')
    age = p.get('연령', '')
    age_txt = f'{age}세 이상' if age.isdigit() else age
    n = int(p.get('칸수', '108') or 108)
    if not 1 <= n <= 108:
        errs.append('칸수는 1~108'); n = 108
    return dict(idx=idx, name=p.get('품명', ''), label_name=p.get('표시품명') or p.get('품명', ''),
                material=p.get('표시재질') or p.get('재질', ''), origin=p.get('원산지', ''), age=age_txt, code=code,
                seller=p.get('수입판매원', '무무토리'), seller_role=p.get('판매원표기', '수입·판매원'),
                origin_word=p.get('원산지표기', '원산지'), count=n), errs, warns


# ---------------- 배치 ----------------
ARC_MAX = 160          # 위 둘레(재질) 글씨가 이 각도(도)를 넘으면 안쪽 줄로 옮김
INNER_W = 13.0         # 안쪽 재질 줄 한 줄 최대 폭(mm, 기본 글자 크기 기준)


def split_title(name):
    """품명을 두 줄로 — 가운데에 가장 가까운 띄어쓰기에서 (없으면 글자 수 반)"""
    sp = [i for i, ch in enumerate(name) if ch == ' ']
    if sp:
        k = min(sp, key=lambda i: abs(i - len(name) / 2))
        return [name[:k], name[k + 1:]]
    k = len(name) // 2
    return [name[:k], name[k:]]


def wrap_material(text, pt, width=INNER_W):
    """'재질 …'을 안쪽 줄로: ' · ' 에서 먼저 나누고, 그래도 길면 띄어쓰기에서 나눔"""
    words = []
    for part_i, part in enumerate(text.split(' · ')):
        ws = part.split(' ')
        if part_i:
            ws[0] = '· ' + ws[0]
        words += [(w, part_i > 0 and k == 0) for k, w in enumerate(ws)]
    lines, cur = [], '재질'
    for w, brk in words:
        cand = cur + ' ' + w
        if (brk and cur != '재질') or R.run_metrics(cand, FONT['inner'], pt)[0] > width:
            if cur != '재질' or not lines:
                lines.append(cur); cur = w
                continue
        cur = cand
    lines.append(cur)
    return lines


def wrap_options(text, pt):
    """안쪽 재질 줄 나누는 방법 몇 가지 (줄 수 적은 것부터)"""
    opts = []
    for w in (15.0, INNER_W, 11.0):
        o = wrap_material(text, pt, w)
        if o not in opts:
            opts.append(o)
    return sorted(opts, key=len)


def build_items(pr, title_pt, module, bar_h, title_lines=None, mat_lines=None, k=1.0):
    """k: 품명 말고 나머지 글자(수입·판매원 · 판매원 이름 · 안쪽 재질 줄) 배율"""
    title_lines = title_lines or [pr['label_name']]
    title_fk = FONT['title'] if not R.missing(pr['label_name'], FONT['title']) else FONT['title_fallback']
    seller_fk = FONT['brand'] if not R.missing(pr['seller'], FONT['brand']) else FONT['title_fallback']
    items = [dict(kind='text', runs=[(t, title_fk, title_pt, R.COCOA, STROKE['title'])]) for t in title_lines]
    for ml in (mat_lines or []):
        items.append(dict(kind='text', runs=[(ml, FONT['inner'], DESIGN['imp_pt'] * k, R.BROWN)]))
    items += [dict(kind='barcode', module=module, bar_h=bar_h, digit_pt=round(21 * module, 2)),
              dict(kind='text', runs=[(pr['seller_role'] + ' ', FONT['imp'], DESIGN['imp_pt'] * k, R.BROWN),
                                      (pr['seller'], seller_fk, DESIGN['brand_pt'] * k, R.COCOA, STROKE['brand'])])]
    return items


def rim_runs(pr, pt, with_material=True):
    return ([('재질 ' + pr['material'], FONT['rim'], pt, R.BROWN)] if with_material else [],
            [(f"{pr['origin_word']} {pr['origin']} · {pr['age']}", FONT['rim'], pt, R.BROWN)])


def rims(top_r, bot_r, pt, tr):
    return R.rims(top_r, bot_r, pt, tr, mfk=FONT['rim'])


# 자리가 모자랄 때 차례로 쓰는 단계: (모듈, 막대 높이, 둘레 자간, 나머지 글자 배율) — 단계마다 품명 크기는 최대로(이분 탐색)
def steps():
    t0, t1, t2 = DESIGN['rim_tracks']
    k_min = math.ceil(MIN['text_pt'] / DESIGN['imp_pt'] * 1000) / 1000
    return [(0.22, 3.4, t0, 1.0), (0.22, 3.4, t1, 1.0), (0.22, 3.4, t2, 1.0),
            (0.22, 3.4, t2, 0.97), (0.22, 3.4, t2, k_min), (0.22, 3.2, t2, k_min),
            (0.21, 3.2, t2, k_min), (0.20, 3.0, t2, k_min)]
TITLE_PREF = 5.2       # 1차: 품명을 이 크기 이상으로 지키며 단계를 내려감 → 안 되면 2차: 최소(4.4pt)까지


def solve(pr):
    """고정 틀(STEPS[0])에 넣어 보고, 모자라면 STEPS 차례로 줄임. 각 단계에서 품명 한 줄 → 두 줄 순서.
    재질이 위 둘레에 너무 길면(ARC_MAX 넘음) 안쪽 줄로 옮김. returns layout dict or None"""
    pt = DESIGN['rim_pt']
    modes = [False, True]                       # 재질: 위 둘레 → (안 되면) 안쪽 줄
    if rims(*rim_runs(pr, pt), pt, 0.0)['top'][2] > ARC_MAX:
        modes = [True]
    title_opts = [[pr['label_name']]]
    if len(pr['label_name']) >= 5:
        title_opts.append(split_title(pr['label_name']))
    for title_min in (TITLE_PREF, MIN['title_pt']):
      for (m, h, tr, k) in steps():
        for mat_inner in modes:
            top_r, bot_r = rim_runs(pr, pt, with_material=not mat_inner)
            rm = rims(top_r, bot_r, pt, tr)
            if max(rm['top'][2], rm['bot'][2]) > 200:
                continue
            for mat_lines in (wrap_options(pr['material'], DESIGN['imp_pt'] * k) if mat_inner else [None]):
              for tl in title_opts:
                def ok(tp):
                    return R.best_at(build_items(pr, tp, m, h, tl, mat_lines, k), 1.0, rm['obst'])
                hi, lo = DESIGN['title_pt'], title_min
                b = ok(hi); title_pt = hi
                if b is None:
                    if ok(lo) is None:
                        continue
                    for _ in range(8):
                        mid = (hi + lo) / 2
                        if ok(mid) is not None: lo = mid
                        else: hi = mid
                    title_pt = math.floor(lo * 20) / 20
                    b = ok(title_pt)
                return dict(items=build_items(pr, title_pt, m, h, tl, mat_lines, k), fit=b, rims=rm, title_pt=title_pt,
                            module=m, bar_h=h, track=tr, scale=k, title_lines=tl, mat_inner=mat_inner, mat_lines=mat_lines)
    return None


def describe(pr, L):
    s = L['scale']
    d = dict(title_pt=round(L['title_pt'], 2),
             imp_pt=round(DESIGN['imp_pt'] * s, 2), brand_pt=round(DESIGN['brand_pt'] * s, 2),
             rim_pt=DESIGN['rim_pt'], rim_track=L['track'], module=L['module'], bar_h=L['bar_h'],
             digit_pt=round(21 * L['module'], 2), bars_w=round(67 * L['module'], 2),
             qz_w=round(81 * L['module'], 2), magnification=round(L['module'] / 0.33 * 100),
             rim_top_deg=round(L['rims']['top'][2]), rim_bot_deg=round(L['rims']['bot'][2]),
             title_lines=len(L['title_lines']))
    notes = []
    if len(L['title_lines']) > 1:
        notes.append('품명이 길어 두 줄로 나눔: ' + ' / '.join(L['title_lines']))
    if d['title_pt'] < DESIGN['title_pt'] - 0.01:
        notes.append(f"품명 자동 축소 {DESIGN['title_pt']:.1f}→{d['title_pt']:.1f}pt")
    if L['mat_inner']:
        notes.append('재질 문구가 길어 위 둘레 대신 안쪽 줄로 넣음: ' + ' / '.join(L['mat_lines']) + ' — 가능하면 짧게')
    if L['track'] < DESIGN['rim_track'] - 1e-9:
        notes.append(f"둘레 자간 줄임 ({L['track']})")
    if (L['module'], L['bar_h']) != (DESIGN['module'], DESIGN['bar_h']):
        notes.append(f"바코드 줄임: 모듈 {L['module']}mm · 막대 {L['bar_h']}mm (스캔 시험 다시)")
    if s < 1:
        notes.append(f"작은 글자도 줄임 ×{s:.2f} (수입·판매원 {d['imp_pt']}pt)")
    if R.missing(pr['label_name'], FONT['title']):
        notes.append('품명에 나눔스퀘어라운드에 없는 글자가 있어 Pretendard Bold로 씀')
    return d, notes


def draw_label(c, cx, cy, pr, L):
    rm = L['rims']
    R.draw_arc(c, rm['top'][0], cx, cy, rm['top'][1], True)
    R.draw_arc(c, rm['bot'][0], cx, cy, rm['bot'][1], False)
    s, ms, base, sl, ysh = L['fit']
    R.draw_stack(c, cx, cy, L['items'], ms, base, s, pr['code'])


# ---------------- PDF ----------------
S = R.SHEET


def cells():
    for r in range(S['ROWS']):
        for col in range(S['COLS']):
            yield r, col, S['CX0'] + col * S['PX'], S['H'] - (S['CY0'] + r * S['PY'])


def sheet_pdf(fn, plan, title, start=1):
    """plan: [(pr, L, count)] → 칸을 앞에서부터 채움 · 108칸 넘으면 다음 장 · start: 첫 장에서 이 칸(1부터)부터 (쓰던 용지 이어 인쇄)"""
    c = canvas.Canvas(fn, pagesize=(S['W'] * mm, S['H'] * mm))
    c.setTitle(title); c.setAuthor('무무토리'); c.setSubject('글로리텍 PP7108 원형 20x20mm 108칸 · 실제 크기 100% 인쇄')
    for k, (pr, L, n) in enumerate(plan):
        c.beginForm(f'L{k}', lowerx=-12 * mm, lowery=-12 * mm, upperx=12 * mm, uppery=12 * mm)
        draw_label(c, 0, 0, pr, L); c.endForm()
    seq = [k for k, (_, _, n) in enumerate(plan) for _ in range(n)]
    pos = list(cells()); used = []
    off = max(0, int(start) - 1)
    for j, k in enumerate(seq):
        i = j + off
        if j and i % 108 == 0:
            c.showPage()
        r, col, x, y = pos[i % 108]
        c.saveState(); c.translate(x * mm, y * mm); c.doForm(f'L{k}'); c.restoreState()
        used.append((i // 108, r, col, k))
    c.showPage(); c.save()
    same, nf = R.strip_empty_fonts(fn)
    return used, nf


# ---------------- 미리보기 ----------------
BG = (250, 246, 238)


def preview_doc(pr, L):
    import pymupdf
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(24 * mm, 24 * mm))
    draw_label(c, 12, 12, pr, L)
    c.setStrokeColor(HexColor('#C9C2B8')); c.setLineWidth(0.15); c.circle(12 * mm, 12 * mm, 10 * mm, stroke=1, fill=0)
    c.showPage()
    G = R.GEOM; TW, TH = G['W'], G['H']; m = 1.5
    c.setPageSize(((TW + 2 * m) * mm, (TH + 2 * m) * mm))
    c.setFillColor(HexColor('#FAF6EE')); c.rect(0, 0, (TW + 2 * m) * mm, (TH + 2 * m) * mm, stroke=0, fill=1)
    p = R.acorn_path(c, m + TW / 2, m + TH / 2, TH, mirror=True)
    c.setFillColor(HexColor('#FFFFFF')); c.setStrokeColor(HexColor('#8A7B6C')); c.setLineWidth(0.35); c.drawPath(p, stroke=1, fill=1)
    c.setFillColor(HexColor('#EFE9E2'))
    c.circle((m + TW - G['hole']['cx']) * mm, (m + TH - G['hole']['cy']) * mm, G['hole']['r'] * mm, stroke=1, fill=1)
    lx, ly = m + G['back_circle']['cx'], m + TH - G['back_circle']['cy']
    c.setFillColor(HexColor('#E6E0D8')); c.circle((lx + 0.18) * mm, (ly - 0.22) * mm, 10 * mm, stroke=0, fill=1)
    c.setFillColor(HexColor('#FFFFFF')); c.circle(lx * mm, ly * mm, 10 * mm, stroke=0, fill=1)
    c.saveState(); pth = c.beginPath(); pth.circle(lx * mm, ly * mm, 10 * mm); c.clipPath(pth, stroke=0, fill=0)
    draw_label(c, lx, ly, pr, L); c.restoreState()
    c.setStrokeColor(HexColor('#D8D0C6')); c.setLineWidth(0.12); c.circle(lx * mm, ly * mm, 10 * mm, stroke=1, fill=0)
    c.showPage(); c.save()
    return pymupdf.open(stream=buf.getvalue(), filetype='pdf')


def render(doc, i, pxmm):
    import pymupdf
    from PIL import Image
    z = pxmm * 25.4 / 72
    pix = doc[i].get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


def label_png(doc, pxmm=38):
    from PIL import Image, ImageDraw
    im = render(doc, 0, pxmm); r = 10 * pxmm; cc = im.width / 2
    mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).ellipse((cc - r, cc - r, cc + r, cc + r), fill=255)
    bg = Image.new('RGB', im.size, BG); bg.paste(im, (0, 0), mask)
    ImageDraw.Draw(bg).ellipse((cc - r, cc - r, cc + r, cc + r), outline=(205, 196, 184), width=max(1, pxmm // 19))
    return bg.crop((int(cc - r - 6), int(cc - r - 6), int(cc + r + 7), int(cc + r + 7)))


# ---------------- 판독 시험 (zbar · ZXing, 6조건) ----------------
CONDS = [('600dpi', 600, {}), ('300dpi', 300, {}), ('200dpi', 200, {}),
         ('300dpi 번짐+0.03 흐림0.03', 300, dict(gain=0.03, blur=0.03)),
         ('300dpi 번짐+0.05 흐림0.05', 300, dict(gain=0.05, blur=0.05)),
         ('200dpi 흐림·대비↓·잡음', 200, dict(blur=0.05, noise=12))]


def decode_test(pdf, used_cells, code):
    import numpy as np, pymupdf
    from PIL import Image, ImageFilter
    try:
        from pyzbar.pyzbar import decode as zb
    except Exception:
        zb = None
    try:
        import zxingcpp
    except Exception:
        zxingcpp = None
    HI = 2400; doc = pymupdf.open(pdf); k = 72 / 25.4
    picks = [used_cells[0], used_cells[-1]] if len(used_cells) > 1 else used_cells[:1]
    res = {}
    for name, dpi, kw in CONDS:
        oks = []
        for (pg, r, col) in picks:
            cx = S['CX0'] + col * S['PX']; cy = S['CY0'] + r * S['PY']
            pix = doc[pg].get_pixmap(dpi=HI, clip=pymupdf.Rect((cx - 11) * k, (cy - 11) * k, (cx + 11) * k, (cy + 11) * k),
                                     alpha=False, colorspace=pymupdf.csGRAY)
            a = Image.frombytes('L', (pix.width, pix.height), pix.samples); pxmm = HI / 25.4
            e = int(round(kw.get('gain', 0) / 2 * pxmm))
            if e > 0: a = a.filter(ImageFilter.MinFilter(2 * e + 1))
            if kw.get('blur'): a = a.filter(ImageFilter.GaussianBlur(kw['blur'] * pxmm))
            a = a.resize((round(a.width * dpi / HI), round(a.height * dpi / HI)), Image.BOX)
            if kw.get('noise'):
                arr = np.asarray(a).astype(np.float32)
                arr = np.clip(arr * 0.8 + 30 + np.random.default_rng(1).normal(0, kw['noise'], arr.shape), 0, 255)
                a = Image.fromarray(arr.astype(np.uint8))
            z = (code in [d.data.decode() for d in zb(a)]) if zb else None
            x = (code in [r_.text for r_ in zxingcpp.read_barcodes(a)]) if zxingcpp else None
            oks.append((z, x))
        res[name] = dict(zbar=None if zb is None else all(o[0] for o in oks),
                         zxing=None if zxingcpp is None else all(o[1] for o in oks))
    return res


def ox(v):
    return '-' if v is None else ('O' if v else 'X')


# ---------------- 비교 그림 ----------------
def photo_circle(path, pxmm=38):
    """참고 사진(흰 원 · 옅은 바탕)에서 원을 찾아 라벨 10배 그림과 같은 크기로 자름"""
    import numpy as np
    from PIL import Image, ImageDraw
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int)
    ys, xs = np.where(a.min(axis=2) >= 248)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    r = ((xs.max() - xs.min()) + (ys.max() - ys.min())) / 4
    k = 10 * pxmm / r
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    c = (cx * k, cy * k); R_ = 10 * pxmm
    mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).ellipse((c[0] - R_, c[1] - R_, c[0] + R_, c[1] + R_), fill=255)
    bg = Image.new('RGB', im.size, BG); bg.paste(im, (0, 0), mask)
    ImageDraw.Draw(bg).ellipse((c[0] - R_, c[1] - R_, c[0] + R_, c[1] + R_), outline=(205, 196, 184), width=2)
    return bg.crop((int(c[0] - R_ - 6), int(c[1] - R_ - 6), int(c[0] + R_ + 7), int(c[1] + R_ + 7)))


def compare_png(path, entries, photo=None):
    from PIL import Image, ImageDraw, ImageFont
    F = os.path.join(R.HERE, 'fonts')
    def fnt(w, s): return ImageFont.truetype(os.path.join(F, f'Pretendard-{w}.otf'), s)
    INK = (104, 35, 1); SUB = (124, 66, 35); GRAY = (110, 100, 90); WARN = (170, 60, 30)
    colw = 900; pad = 60; n = len(entries) + (1 if photo else 0)
    H = 250 + 110 + 772 + 330 + 870 + 80 + 140
    img = Image.new('RGB', (pad * 2 + colw * n, H), BG); d = ImageDraw.Draw(img)
    d.text((pad, 50), '원형 20mm 택 라벨 v5 — 사장님 사진 글꼴로', font=fnt('Bold', 60), fill=INK)
    d.text((pad, 135), '위 = 라벨 약 10배 확대(사진도 같은 크기) · 아래 = 택 뒷면에 붙인 모습(실제 비율) · 글로리텍 PP7108 · 바코드 EAN-8', font=fnt('Medium', 30), fill=SUB)
    off = 0
    if photo:
        x0 = pad; y = 250
        d.rounded_rectangle((x0 + 40, y, x0 + 170, y + 92), radius=22, fill=(160, 140, 120))
        tw = d.textlength('사진', font=fnt('Bold', 54)); d.text((x0 + 105 - tw / 2, y + 14), '사진', font=fnt('Bold', 54), fill=(252, 247, 229))
        d.text((x0 + 195, y + 26), '사장님이 보낸 사진 (글꼴 기준)', font=fnt('SemiBold', 34), fill=INK)
        pi = photo_circle(photo); img.paste(pi, (x0 + (colw - pi.width) // 2, y + 110))
        yy = y + 110 + pi.height + 16
        for t in ['사진은 모양 · 글꼴 참고용 (둘레 글씨가 약 2pt로 아주 작아요)']:
            cw = d.textlength(t, font=fnt('Medium', 27)); d.text((x0 + colw / 2 - cw / 2, yy), t, font=fnt('Medium', 27), fill=GRAY)
        yy = y + 110 + 772 + 330 + 20
        for t, bold in [('고른 글꼴 (모두 상업 사용 무료)', True),
                        ('· 품명 · 무무토리: 나눔스퀘어라운드 ExtraBold', False), ('   + 획 덧대기(글자 크기의 4%) — 사진처럼 묵직하게', False),
                        ('· 수입·판매원: 나눔스퀘어라운드 Bold', False),
                        ('· 위 · 아래 둘레: 개구(Gaegu) Bold — 둥근 손글씨', False),
                        ('· 바코드 숫자: Arimo (Arial과 같은 꼴)', False), ('', False),
                        ('라이선스: 나눔스퀘어라운드 = 네이버 나눔글꼴(OFL)', False),
                        ('개구 · Arimo = SIL OFL 1.1 (Google Fonts)', False)]:
            d.text((x0 + 60, yy), t, font=fnt('SemiBold' if bold else 'Medium', 32 if bold else 28), fill=INK if bold else SUB); yy += 50 if t else 20
        off = 1
    for k, e in enumerate(entries):
        x0 = pad + (k + off) * colw; y = 250
        tag = str(k + 1)
        d.rounded_rectangle((x0 + 40, y, x0 + 132, y + 92), radius=22, fill=INK)
        tw = d.textlength(tag, font=fnt('Bold', 60)); d.text((x0 + 86 - tw / 2, y + 10), tag, font=fnt('Bold', 60), fill=(252, 247, 229))
        nm = e['pr']['name'] + ('  (시험용 가짜 상품)' if e.get('fake') else '')
        fs = 34
        while d.textlength(nm, font=fnt('SemiBold', fs)) > colw - 200 and fs > 22: fs -= 2
        d.text((x0 + 155, y + 26), nm, font=fnt('SemiBold', fs), fill=INK)
        y += 110
        li = e['label_img']; img.paste(li, (x0 + (colw - li.width) // 2, y)); y2 = y + li.height + 16
        dd = e['desc']; dec = e['decode']
        allok = all((v['zbar'] is not False) and (v['zxing'] is not False) for v in dec.values())
        lines = [(f"품명 {dd['title_pt']:.1f}pt · {e['pr']['seller']} {dd['brand_pt']:.1f}pt · 판매원표기 {dd['imp_pt']:.1f}pt · 둘레 {dd['rim_pt']:.1f}pt", 'SemiBold', 28, INK),
                 (f"바코드 {e['pr']['code']} · 모듈 {dd['module']:.2f}mm · 막대 {dd['bar_h']:.1f}mm", 'SemiBold', 28, INK),
                 (f"판독 시험 6조건(zbar · ZXing): {'모두 통과' if allok else '일부 실패'}", 'Medium', 27, GRAY)]
        for nt in e['notes'] + e['warns']:
            lines.append(('· ' + nt, 'Medium', 26, WARN))
        for t, w, s_, col in lines:
            f = fnt(w, s_)
            while d.textlength(t, font=f) > colw - 40 and s_ > 18:
                s_ -= 1; f = fnt(w, s_)
            cw = d.textlength(t, font=f); d.text((x0 + colw / 2 - cw / 2, y2), t, font=f, fill=col); y2 += s_ + 14
        y = y + 772 + 330
        t = e['tag_img']; img.paste(t, (x0 + (colw - t.width) // 2, y))
    d.text((pad, H - 110), f"고정 틀 v5: 품명 {DESIGN['title_pt']:.1f}pt · 판매원 이름 {DESIGN['brand_pt']:.1f}pt · 수입·판매원 {DESIGN['imp_pt']:.1f}pt · 둘레 {DESIGN['rim_pt']:.1f}pt · 모듈 0.22mm · 막대 3.4mm — 자리가 모자라면 품명 → 둘레 자간 → 작은 글자(최소 3.8pt) → 바코드(최소 0.20mm) 순서로 줄임",
           font=fnt('Medium', 27), fill=SUB)
    d.text((pad, H - 65), "바코드 '2'로 시작 = 가게 안 전용 번호(바깥 유통 X) · 바코드 · 숫자 검정 100% · 글자 #682301 / #7C4223 · 테두리에서 1.75mm 안쪽", font=fnt('Medium', 27), fill=GRAY)
    img.save(path, optimize=True)


def safe(s):
    return re.sub(r'[\\/:*?"<>|\s]+', '_', s).strip('_')[:40]


def main():
    ap = argparse.ArgumentParser(description='무무토리 원형 20mm 택 라벨 만들기 v6 (고정 틀 v3 H · 사진 글꼴 · 이어 인쇄 · 품명 얇게)')
    ap.add_argument('table'); ap.add_argument('--out', required=True)
    ap.add_argument('--mix', action='store_true', help='모든 상품을 칸수대로 한 시트(들)에 섞어서도 만들기')
    ap.add_argument('--title-stroke', type=float, default=None, help='품명 획 덧대기 비율(v6 기본 0 = ExtraBold만 · 예전 굵은 판은 0.04)')
    ap.add_argument('--start', type=int, default=1, help='--mix 첫 장에서 이 칸(1~108)부터 채우기 — 쓰던 라벨지 이어 인쇄')
    ap.add_argument('--compare', help='비교 그림 PNG 경로')
    ap.add_argument('--fake', default='', help='비교 그림에 "시험용 가짜 상품" 표시할 줄 번호(1부터, 쉼표)')
    ap.add_argument('--no-test', action='store_true', help='판독 시험 건너뛰기')
    ap.add_argument('--fonts', help='글꼴 폴더 (기본: 이 도구 옆 fonts/)')
    ap.add_argument('--rim-plain', action='store_true', help='둘레 글씨를 나눔스퀘어라운드 Regular 3.8pt로 (개구가 작아 안 읽힐 때)')
    ap.add_argument('--photo', help='비교 그림 맨 왼쪽에 넣을 참고 사진(원형 라벨 사진)')
    ap.add_argument('--dx', type=float, default=0.0, help='인쇄 쏠림 보정: 그림 전체를 오른쪽으로 mm (왼쪽은 -)')
    ap.add_argument('--dy', type=float, default=0.0, help='인쇄 쏠림 보정: 그림 전체를 위로 mm (아래는 -)')
    a = ap.parse_args()
    if a.dx or a.dy:
        S['CX0'] = S['CX0'] + a.dx; S['CY0'] = S['CY0'] - a.dy
        print(f'보정: 오른쪽 {a.dx:+.2f}mm · 위 {a.dy:+.2f}mm (첫 칸 중심 {S["CX0"]:.2f}, {S["CY0"]:.2f} mm)')
    if a.title_stroke is not None:
        STROKE['title'] = a.title_stroke
    R.load_fonts(a.fonts); R.DIGIT_FK = FONT['digits']
    if a.rim_plain:
        FONT['rim'] = RIM_PLAIN['font']
        DESIGN.update({k: v for k, v in RIM_PLAIN.items() if k != 'font'})
    os.makedirs(a.out, exist_ok=True)
    fakes = {int(x) for x in a.fake.split(',') if x.strip().isdigit()}
    rows = read_table(a.table)
    summary = []; entries = []; plan = []
    for i, raw in enumerate(rows, 1):
        pr, errs, warns = normalize(raw, i)
        tag = f"{i:02d}_{safe(pr['name'])}"
        if errs:
            print(f'[{tag}] 못 만듦: ' + ' / '.join(errs)); summary.append(dict(번호=i, 품명=pr['name'], 결과='못 만듦', 메모=' / '.join(errs))); continue
        L = solve(pr)
        if L is None:
            msg = '최소 크기(글자 3.8pt · 품명 4.4pt · 모듈 0.20mm)로도 안 들어가요 — 표시품명을 짧게 하거나 재질 문구를 줄여 주세요'
            print(f'[{tag}] 못 만듦: {msg}'); summary.append(dict(번호=i, 품명=pr['name'], 결과='못 만듦', 메모=msg)); continue
        desc, notes = describe(pr, L)
        pdf = os.path.join(a.out, f'{tag}_A4_108칸.pdf')
        used, nf = sheet_pdf(pdf, [(pr, L, pr['count'])], f"{pr['name']} 원형 라벨 ({pr['code']}) — A4 108칸 원형 20mm")
        doc = preview_doc(pr, L)
        li = label_png(doc, 38); li.save(os.path.join(a.out, f'{tag}_미리보기_10배.png'))
        real = label_png(doc, round(300 / 25.4)); real.save(os.path.join(a.out, f'{tag}_실제크기_300dpi.png'), dpi=(300, 300))
        tag_img = render(doc, 1, 26)
        tag_img.save(os.path.join(a.out, f'{tag}_택뒷면_미리보기.png'))
        dec = {} if a.no_test else decode_test(pdf, [(p, r, c) for (p, r, c, k) in used], pr['code'])
        okall = all((v['zbar'] is not False) and (v['zxing'] is not False) for v in dec.values()) if dec else None
        print(f"[{tag}] {pr['code']} · 품명 {desc['title_pt']}pt · 모듈 {desc['module']} · 막대 {desc['bar_h']} · "
              f"판독 {'통과' if okall else ('건너뜀' if okall is None else '일부 실패')}" + (' · ' + ' / '.join(notes + warns) if notes or warns else ''))
        summary.append(dict(번호=i, 품명=pr['name'], 표시품명=pr['label_name'], 바코드=pr['code'], 칸수=pr['count'],
                            품명pt=desc['title_pt'], 판매원표기pt=desc['imp_pt'], 판매원이름pt=desc['brand_pt'], 둘레pt=desc['rim_pt'],
                            모듈mm=desc['module'], 막대mm=desc['bar_h'], 위둘레각도=desc['rim_top_deg'], 아래둘레각도=desc['rim_bot_deg'],
                            판독=' '.join(f"{k}:{ox(v['zbar'])}{ox(v['zxing'])}" for k, v in dec.items()) if dec else '건너뜀',
                            결과='만듦', 메모=' / '.join(notes + warns), PDF=os.path.basename(pdf), 글꼴포함=nf))
        entries.append(dict(pr=pr, desc=desc, notes=notes, warns=warns, decode=dec, label_img=li, tag_img=tag_img, fake=i in fakes))
        plan.append((pr, L, pr['count']))
    if a.mix and plan:
        used, nf = sheet_pdf(os.path.join(a.out, '섞음_A4_108칸.pdf'), plan, '여러 상품 섞음 — A4 108칸 원형 20mm', a.start)
        print(f"섞음_A4_108칸.pdf · {len(used)}칸 · {max(u[0] for u in used) + 1}장")
    keys = ['번호', '품명', '표시품명', '바코드', '칸수', '품명pt', '판매원표기pt', '판매원이름pt', '둘레pt', '모듈mm', '막대mm',
            '위둘레각도', '아래둘레각도', '판독', '결과', '메모', 'PDF']
    with open(os.path.join(a.out, '요약.csv'), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction='ignore'); w.writeheader(); [w.writerow(r) for r in summary]
    with open(os.path.join(a.out, '요약.md'), 'w', encoding='utf-8') as f:
        f.write('| ' + ' | '.join(keys[:-1]) + ' |\n|' + '---|' * (len(keys) - 1) + '\n')
        for r in summary:
            f.write('| ' + ' | '.join(str(r.get(k, '')) for k in keys[:-1]) + ' |\n')
        f.write('\n판독 = 조건별 zbar·ZXing (O 읽힘 · X 못 읽음): ' + ' / '.join(c[0] for c in CONDS) + '\n')
    if a.compare and entries:
        compare_png(a.compare, entries, a.photo); print(a.compare)
    return summary


if __name__ == '__main__':
    main()
