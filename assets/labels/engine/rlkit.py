"""무무토리 원형 라벨 도구 v5 — 바탕 부품 (글꼴 윤곽선 · EAN-8 · 둘레 글씨 · 자동 배치).
11/10 labelkit.py + 11/12 bckit.py 정리 + v5(11/12 15시 반): 글꼴 대체(fallback) · 획 덧대기(stroke) · 바코드 숫자 글꼴."""
import json, math, os
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely import affinity

HERE = os.path.dirname(os.path.abspath(__file__))
PT = 25.4 / 72  # mm per pt

# ---- 무무토리 색상 정본 ----
COCOA = '#682301'    # 진한 밤색 (품명 · 무무토리)
BROWN = '#7C4223'    # 따뜻한 갈색 (보조 글자 · 둘레)
CARAMEL = '#9F5528'
BLACK = '#000000'    # 바코드 · 숫자 (검정 100%)

# ---- 라벨지: 글로리텍 PP7108 (원형 20mm · A4 108칸) — 11/10 칸 자리 (시험지로 확인할 값) ----
SHEET = dict(W=210.0, H=297.0, COLS=9, ROWS=12, D=20.0, PX=22.5, PY=22.5, CX0=15.0, CY0=24.75)
R_LABEL = 10.0
SAFE_R = 8.25     # 글자 · 막대는 원 중심에서 이 반지름 안 (테두리에서 1.75mm 안쪽)
QZ_R = 9.4        # 바코드 좌우 여백(7모듈)도 라벨 안 (테두리에서 0.6mm 안쪽)


class _OpsPen(BasePen):
    def __init__(self, gs):
        super().__init__(gs); self.ops = []
    def _moveTo(self, p): self.ops.append(('M', p))
    def _lineTo(self, p): self.ops.append(('L', p))
    def _curveToOne(self, a, b, c): self.ops.append(('C', a, b, c))
    def _closePath(self): self.ops.append(('Z',))
    def _endPath(self): self.ops.append(('Z',))


class Font:
    def __init__(self, path):
        self.fallback = None   # 이 글꼴에 없는 글자(예: 가운뎃점)는 이 글꼴에서 가져옴
        self.f = TTFont(path)
        self.gs = self.f.getGlyphSet()
        self.cmap = self.f.getBestCmap()
        self.upm = self.f['head'].unitsPerEm
        self.hm = self.f['hmtx']
        self._cache = {}
    def has(self, ch):
        return ord(ch) in self.cmap
    def glyph(self, ch):
        if ch not in self._cache and ord(ch) not in self.cmap and self.fallback is not None:
            adv, ops, b = self.fallback.glyph(ch)
            k = self.upm / self.fallback.upm
            sc = lambda q: (q[0] * k, q[1] * k)
            ops2 = [(op[0],) + tuple(sc(q) for q in op[1:]) for op in ops]
            self._cache[ch] = (adv * k, ops2, tuple(v * k for v in b) if b else b)
        if ch not in self._cache:
            gn = self.cmap[ord(ch)]
            pen = _OpsPen(self.gs); self.gs[gn].draw(pen)
            bp = BoundsPen(self.gs); self.gs[gn].draw(bp)
            self._cache[ch] = (self.hm[gn][0], pen.ops, bp.bounds)
        return self._cache[ch]


FONTS = {}
FONT_FILES = {'M': 'Pretendard-Medium.otf', 'S': 'Pretendard-SemiBold.otf',
              'B': 'Pretendard-Bold.otf', 'J': 'Jua-Regular.ttf',
              'NR': 'NanumSquareRoundR.ttf', 'NB': 'NanumSquareRoundB.ttf', 'NEB': 'NanumSquareRoundEB.ttf',
              'G': 'Gaegu-Bold.ttf', 'A': 'Arimo[wght].ttf'}
FALLBACK = {'J': 'M', 'G': 'NR', 'A': 'M', 'NR': 'M', 'NB': 'M', 'NEB': 'NB'}
DIGIT_FK = 'M'     # 바코드 숫자 글꼴 (v5: 'A' = Arimo)


def load_fonts(fdir=None):
    fdir = fdir or os.path.join(HERE, 'fonts')
    for k, fn in FONT_FILES.items():
        FONTS[k] = Font(os.path.join(fdir, fn))
    for k, fb in FALLBACK.items():
        FONTS[k].fallback = FONTS[fb]
    return FONTS


def missing(text, fk):
    return [ch for ch in text if ch not in ' ' and not FONTS[fk].has(ch)]


def run_metrics(text, fk, size_pt, track=0.0, stroke=0.0):
    """폭 mm · 잉크 위(+) · 잉크 아래(−). stroke: 획 덧대기 굵기(글자 크기 대비 비율, 양쪽 합)"""
    w, top, bot = _run_metrics(text, fk, size_pt, track)
    sw = stroke * size_pt * PT
    return w + sw, top + sw / 2, bot - sw / 2


def _run_metrics(text, fk, size_pt, track=0.0):
    f = FONTS[fk]; s = size_pt * PT / f.upm
    x = 0; top = -1e9; bot = 1e9
    for i, ch in enumerate(text):
        adv, ops, b = f.glyph(ch)
        if b:
            top = max(top, b[3] * s); bot = min(bot, b[1] * s)
        x += adv * s + (track * size_pt * PT if i < len(text) - 1 else 0)
    if top < -1e8:
        top, bot = 0, 0
    return x, top, bot


def draw_run(c, text, fk, size_pt, x_mm, base_mm, color, track=0.0, stroke=0.0):
    f = FONTS[fk]; s = size_pt * PT / f.upm
    sw = stroke * size_pt * PT
    p = c.beginPath(); x = x_mm + sw / 2
    for ch in text:
        adv, ops, b = f.glyph(ch)
        for op in ops:
            if op[0] == 'M':
                p.moveTo((x + op[1][0] * s) * mm, (base_mm + op[1][1] * s) * mm)
            elif op[0] == 'L':
                p.lineTo((x + op[1][0] * s) * mm, (base_mm + op[1][1] * s) * mm)
            elif op[0] == 'C':
                p.curveTo(*[v for q in op[1:] for v in ((x + q[0] * s) * mm, (base_mm + q[1] * s) * mm)])
            else:
                p.close()
        x += adv * s + track * size_pt * PT
    c.setFillColor(HexColor(color))
    if sw > 0:
        c.saveState()
        c.setStrokeColor(HexColor(color)); c.setLineWidth(sw * mm); c.setLineJoin(1); c.setLineCap(1)
        c.drawPath(p, stroke=1, fill=1, fillMode=1)
        c.restoreState()
    else:
        c.drawPath(p, stroke=0, fill=1, fillMode=1)


# ---- 택 칼선 (포맥스 도토리 택) ----
GEOM = json.load(open(os.path.join(HERE, 'tag_geom.json')))


def acorn_path(c, cx_mm, cy_mm, h_mm, mirror=False):
    W, H = GEOM['W'], GEOM['H']; k = h_mm / H
    def P(q):
        x = q[0] - W / 2
        if mirror: x = -x
        return ((cx_mm + x * k) * mm, (cy_mm - (q[1] - H / 2) * k) * mm)
    p = c.beginPath(); first = True
    for sg in GEOM['outline_segs']:
        if first:
            p.moveTo(*P(sg[1])); first = False
        if sg[0] == 'L':
            p.lineTo(*P(sg[2]))
        else:
            a, b, d = P(sg[2]), P(sg[3]), P(sg[4])
            p.curveTo(a[0], a[1], b[0], b[1], d[0], d[1])
    p.close()
    return p


# ---------------------------------------------------------------- EAN-8
L_CODE = ['0001101', '0011001', '0010011', '0111101', '0100011',
          '0110001', '0101111', '0111011', '0110111', '0001011']
R_CODE = [''.join('1' if b == '0' else '0' for b in c) for c in L_CODE]
EAN8_MODULES = 67
QZ = 7
GUARD = set(range(0, 3)) | set(range(31, 36)) | set(range(64, 67))


def ean8_check(d7):
    d7 = str(d7)
    assert len(d7) == 7 and d7.isdigit(), d7
    s = sum(int(ch) * (3 if i % 2 == 0 else 1) for i, ch in enumerate(d7))
    return (10 - s % 10) % 10


def ean8_full(d7):
    return str(d7) + str(ean8_check(d7))


def ean8_valid(code8):
    return len(code8) == 8 and code8.isdigit() and int(code8[7]) == ean8_check(code8[:7])


def ean8_modules(code8):
    assert ean8_valid(code8), code8
    m = '101' + ''.join(L_CODE[int(ch)] for ch in code8[:4]) + '01010'
    m += ''.join(R_CODE[int(ch)] for ch in code8[4:]) + '101'
    return m


def bars(code8):
    mods = ean8_modules(code8); out = []; i = 0
    while i < len(mods):
        if mods[i] == '1':
            j = i
            while j < len(mods) and mods[j] == '1':
                j += 1
            out.append((i, j - i, i in GUARD)); i = j
        else:
            i += 1
    return out


def bc_metrics(module, bar_h, digit_pt, dgap=0.15):
    dw, dtop, dbot = run_metrics('0123456789', DIGIT_FK, digit_pt)
    ext = 5 * module
    below = max(ext, dgap + dtop - min(dbot, 0))
    return dict(w=EAN8_MODULES * module, qz_w=(EAN8_MODULES + 2 * QZ) * module,
                top=bar_h, below=below, ext=ext, dtop=dtop, dgap=dgap)


def draw_ean8(c, code8, x0, yb, module, bar_h, digit_pt, color=BLACK, dgap=0.15):
    """x0: 첫 막대 왼끝 · yb: 데이터 막대 바닥 (mm, PDF 좌표 y 위)"""
    mt = bc_metrics(module, bar_h, digit_pt, dgap)
    c.setFillColor(HexColor(color))
    p = c.beginPath()
    for (i, n, g) in bars(code8):
        y = yb - (mt['ext'] if g else 0); h = bar_h + (mt['ext'] if g else 0)
        p.rect((x0 + i * module) * mm, y * mm, n * module * mm, h * mm)
    c.drawPath(p, stroke=0, fill=1)
    base = yb - dgap - mt['dtop']
    slots = [3 + 7 * k for k in range(4)] + [36 + 7 * k for k in range(4)]
    for ch, s0 in zip(code8, slots):
        w, _, _ = run_metrics(ch, DIGIT_FK, digit_pt)
        draw_run(c, ch, DIGIT_FK, digit_pt, x0 + (s0 + 3.5) * module - w / 2, base, color)
    return mt


# ---------------------------------------------------------------- 둘레(호) 글씨
def arc_layout(runs, rb, center_deg, outer_up, track=0.0):
    gl = []; total = 0.0
    for (t, fk, sz, col) in runs:
        f = FONTS[fk]; s = sz * PT / f.upm
        for ch in t:
            adv = f.glyph(ch)[0] * s + track * sz * PT
            gl.append([ch, fk, sz, col, adv]); total += adv
    theta = total / rb
    out = []; acc = 0.0; c0 = math.radians(center_deg)
    for ch, fk, sz, col, adv in gl:
        mid = (acc + adv / 2) / rb
        phi = c0 + theta / 2 - mid if outer_up else c0 - theta / 2 + mid
        out.append((ch, fk, sz, col, phi, adv)); acc += adv
    return out, math.degrees(theta)


def _frame(phi, outer_up):
    if outer_up:
        return (math.sin(phi), -math.cos(phi)), (math.cos(phi), math.sin(phi))
    return (-math.sin(phi), math.cos(phi)), (-math.cos(phi), -math.sin(phi))


def arc_glyph_polys(glyphs, cx, cy, rb, outer_up):
    polys = []
    for ch, fk, sz, col, phi, adv in glyphs:
        f = FONTS[fk]; s = sz * PT / f.upm
        _, _, b = f.glyph(ch)
        if not b:
            continue
        t, u = _frame(phi, outer_up)
        P = (cx + rb * math.cos(phi), cy + rb * math.sin(phi))
        pts = []
        for (lx, ly) in ((b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])):
            x = lx * s - adv / 2; y = ly * s
            pts.append((P[0] + x * t[0] + y * u[0], P[1] + x * t[1] + y * u[1]))
        polys.append(Polygon(pts))
    return polys


def draw_arc(c, glyphs, cx, cy, rb, outer_up):
    paths = {}
    for ch, fk, sz, col, phi, adv in glyphs:
        f = FONTS[fk]; s = sz * PT / f.upm
        _, ops, _ = f.glyph(ch)
        t, u = _frame(phi, outer_up)
        P = (cx + rb * math.cos(phi), cy + rb * math.sin(phi))
        def T(q):
            x = q[0] * s - adv / 2; y = q[1] * s
            return ((P[0] + x * t[0] + y * u[0]) * mm, (P[1] + x * t[1] + y * u[1]) * mm)
        p = paths.get(col)
        if p is None:
            p = paths[col] = c.beginPath()
        for op in ops:
            if op[0] == 'M': p.moveTo(*T(op[1]))
            elif op[0] == 'L': p.lineTo(*T(op[1]))
            elif op[0] == 'C':
                a, b2, d = T(op[1]), T(op[2]), T(op[3]); p.curveTo(a[0], a[1], b2[0], b2[1], d[0], d[1])
            else: p.close()
    for col, p in paths.items():
        c.setFillColor(HexColor(col)); c.drawPath(p, stroke=0, fill=1, fillMode=1)


def rims(top_runs, bot_runs, pt, track, metric='재질폴리에스테르제조국중국14세이상', r_out=SAFE_R, mfk='M'):
    """위 · 아래 둘레 글씨 배치. 반지름은 고정 문자열로 정해서 상품이 바뀌어도 같은 자리."""
    _, top, bot = run_metrics(metric, mfk, pt)
    rb_top = r_out - top; rb_bot = r_out + bot
    gt, at = arc_layout(top_runs, rb_top, 90, True, track)
    gb, ab = arc_layout(bot_runs, rb_bot, 270, False, track)
    polys = arc_glyph_polys(gt, 0, 0, rb_top, True) + arc_glyph_polys(gb, 0, 0, rb_bot, False)
    obst = affinity.scale(unary_union(polys), 1, -1, origin=(0, 0))   # 배치 좌표(y 아래)
    return dict(top=(gt, rb_top, at), bot=(gb, rb_bot, ab), obst=obst, pt=pt, track=track)


# ---------------------------------------------------------------- 세로 쌓기 + 자동 맞춤
LEAD_K = 1.14


def measure(it, s):
    if it['kind'] == 'text':
        w = 0; top = 0; bot = 0; mx = 0
        for r in it['runs']:
            t, fk, sz, col = r[:4]; st = r[4] if len(r) > 4 else 0.0
            rw, rt, rb = run_metrics(t, fk, sz * s, stroke=st)
            w += rw; top = max(top, rt); bot = min(bot, rb); mx = max(mx, sz * s)
        return dict(w=w, top=top, bot=bot, size_mm=mx * PT, lead=mx * PT * LEAD_K)
    if it['kind'] == 'barcode':
        mt = bc_metrics(it['module'], it['bar_h'], it['digit_pt'])
        return dict(w=mt['w'], qz_w=mt['qz_w'], top=mt['top'], bot=-mt['below'], mt=mt, bc=True)
    raise ValueError(it['kind'])


def stack(items, s, y_shift=0.0, gap_bc=0.55):
    ms = [measure(it, s) for it in items]
    base = [0.0]
    for i in range(1, len(ms)):
        p, q = ms[i - 1], ms[i]
        if q.get('bc'):
            base.append(base[-1] + max(-p['bot'], 0.12 * p.get('size_mm', 0)) + gap_bc + q['top'])
        elif p.get('bc'):
            base.append(base[-1] + (-p['bot']) + gap_bc + q['top'])
        else:
            base.append(base[-1] + p['lead'])
    ink_top = min(b - m['top'] for b, m in zip(base, ms))
    ink_bot = max(b - m['bot'] for b, m in zip(base, ms))
    off = -(ink_top + ink_bot) / 2 + y_shift
    return ms, [b + off for b in base]


def shapes(items, ms, base):
    out = []
    for it, m, b in zip(items, ms, base):
        hw = m['w'] / 2
        if m.get('bc'):
            mt = m['mt']
            out.append(('bars', box(-hw, b - mt['top'], hw, b + mt['ext'])))
            out.append(('digits', box(-hw + 3 * it['module'], b, hw - 3 * it['module'], b + mt['below'])))
            q = m['qz_w'] / 2
            out.append(('qz', box(-q, b - mt['top'], q, b + mt['ext'])))
        else:
            out.append(('text', box(-hw, b - m['top'], hw, b - m['bot'])))
    return out


LIM = dict(text=SAFE_R, digits=SAFE_R, bars=SAFE_R, qz=QZ_R)


def _rmax(poly):
    return max(math.hypot(x, y) for (x, y) in poly.exterior.coords)


def slack_of(shp, obstacles=None, min_gap=0.35):
    sl = 1e9
    for kind, poly in shp:
        sl = min(sl, LIM[kind] - _rmax(poly))
        if obstacles is not None and kind != 'qz':
            sl = min(sl, poly.distance(obstacles) - min_gap)
    qzs = [p for k, p in shp if k == 'qz']
    for kind, poly in shp:
        if kind == 'text' and any(poly.intersects(q) for q in qzs):
            sl = min(sl, -1)
    if obstacles is not None and any(q.intersects(obstacles) for q in qzs):
        sl = min(sl, -1)
    return sl


SHIFTS = [round(-2.0 + 0.05 * k, 2) for k in range(81)]


def best_at(items, s, obstacles=None):
    b = None
    for ysh in SHIFTS:
        ms, base = stack(items, s, ysh)
        sl = slack_of(shapes(items, ms, base), obstacles)
        if sl >= 0 and (b is None or sl > b[3]):
            b = (s, ms, base, sl, ysh)
    return b


def fit(items, obstacles=None, s_lo=0.4, s_hi=1.6):
    top = best_at(items, s_hi, obstacles)
    if top is not None:
        return top
    best = best_at(items, s_lo, obstacles)
    if best is None:
        return None
    lo, hi = s_lo, s_hi
    for _ in range(14):
        mid = (lo + hi) / 2
        b = best_at(items, mid, obstacles)
        if b is not None:
            lo, best = mid, b
        else:
            hi = mid
    s = math.floor(lo * 200) / 200
    return best_at(items, s, obstacles) or best


def draw_stack(c, cx, cy, items, ms, base, s, code8):
    for it, m, b in zip(items, ms, base):
        by = cy - b
        if it['kind'] == 'text':
            x = cx - m['w'] / 2
            for r in it['runs']:
                t, fk, sz, col = r[:4]; st = r[4] if len(r) > 4 else 0.0
                rw, _, _ = run_metrics(t, fk, sz * s, stroke=st)
                draw_run(c, t, fk, sz * s, x, by, col, stroke=st); x += rw
        elif it['kind'] == 'barcode':
            draw_ean8(c, code8, cx - m['w'] / 2, by, it['module'], it['bar_h'], it['digit_pt'])


def strip_empty_fonts(fn):
    """reportlab이 넣는 빈 글꼴 줄 · Helvetica 참조 제거 (모양이 같을 때만 바꿈)."""
    import hashlib, pymupdf
    def dig(d):
        return hashlib.md5(b''.join(pg.get_pixmap(dpi=100, alpha=False).samples for pg in d)).hexdigest()
    doc = pymupdf.open(fn); before = dig(doc)
    for xref in range(1, doc.xref_length()):
        try:
            if doc.xref_is_stream(xref):
                raw = doc.xref_stream(xref)
                if raw and b'BT /F1 12 Tf 14.4 TL ET' in raw:
                    doc.update_stream(xref, raw.replace(b'BT /F1 12 Tf 14.4 TL ET', b''))
            if 'Resources' in doc.xref_get_keys(xref):
                t, v = doc.xref_get_key(xref, 'Resources/Font')
                if t != 'null':
                    doc.xref_set_key(xref, 'Resources/Font', 'null')
        except Exception:
            pass
    tmp = fn + '.tmp'; doc.save(tmp, garbage=4, deflate=True); doc.close()
    d2 = pymupdf.open(tmp); same = dig(d2) == before; nf = sum(len(p.get_fonts()) for p in d2); d2.close()
    if same:
        os.replace(tmp, fn)
    else:
        os.remove(tmp)
    return same, nf
