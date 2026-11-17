"""쌓이는 판(20261117_1030 3번) — 11/16부터 줄지 않는 숫자 + 끝난 일 벽.
H:\\...\\총괄_일감함\\결과\\ 폴더의 파일(날짜 20261116 이상)을 세어서 숫자를 만들고(지어내지 않음 — 파일이
없으면 0, '모른다'가 아니라 '아직 없다'), ops.json의 jobs 중 status=='끝'인 것을 날짜순으로 hub/doneWall/wall
에 쌓는다(지우지 않고 덧붙이기만 — 이미 올라간 job id는 다시 안 건드림).

씀: python _tools\\done_wall_sync.py [--results <결과 폴더>] [--ops <ops.json 경로>] [--force]

숫자 종류(결과 파일 이름의 날짜·낱말로 가름 — 내용을 지어내지 않고 파일 존재·이름만 본다):
  끝낸 일감 수      = 결과\\ 바로 아래 *_결과.md 전부(11/16부터)
  만든 상세페이지 수 = 파일 이름에 detail·상세
  온라인에 올린 상품 수 = 파일 이름에 go-live·register-online·올려·listed
  검색 고친 상품 수  = 파일 이름에 seo
  만든 포스터 수     = 파일 이름에 poster·pop-
  굿즈 시안 수       = 파일 이름에 goods·굿즈·gacha
  이모티콘 수        = 파일 이름에 emoticon
각 갈래는 '일감 수'(jobs, 파일 개수)와 '개수'(items)를 같이 둔다 — items는 그 파일의 첫 '#' 제목 줄에서
'숫자+개' 꼴을 찾아 가장 큰 수를 쓰고, 못 찾으면 그 파일을 1개로 센다(지어내지 않고 파일 하나=하나).
"""
import sys, os, json, re, base64, hashlib, argparse, pathlib, datetime, io

sys.path.insert(0, 'C:/Users/ilc57/mumutori-auto')
from fb_auth import params  # noqa: E402
import requests  # noqa: E402

try:
    from PIL import Image
except Exception:
    Image = None

BASE = 'https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app'
ROOT = r'H:\내 드라이브\무무토리\옵시디언\_협업\총괄_일감함'
DEFAULT_RESULTS = ROOT + r'\결과'
DEFAULT_OPS = ROOT + r'\보고서\현재\ops.json'
MARKER_DIR = pathlib.Path(r'C:\Users\ilc57\mumutori-auto\keeper')
MARKER_PATH = MARKER_DIR / '_done_wall_marker.json'
START_DATE = datetime.date(2026, 11, 16)  # "11/16부터 줄지 않는 숫자" — 사장님 지시 기준일
DAILY_WINDOW = 14
IMG_MAX_SIDE = 320
IMG_MAX_BYTES = 25 * 1024
IMG_EXTS = {'.jpg', '.jpeg', '.png'}

CATEGORIES = {
    'detailPages': ['detail', '상세'],
    'onlineListed': ['go-live', 'register-online', '올려', 'listed'],
    'seoFixed': ['seo'],
    'posters': ['poster', 'pop-'],
    'goodsDesigns': ['goods', '굿즈', 'gacha'],
    'emoticons': ['emoticon'],
}
LABELS = {
    'doneJobs': '끝낸 일감 수', 'detailPages': '만든 상세페이지 수', 'onlineListed': '온라인에 올린 상품 수',
    'seoFixed': '검색 고친 상품 수', 'posters': '만든 포스터 수', 'goodsDesigns': '굿즈 시안 수', 'emoticons': '이모티콘 수',
}

DATE_RE = re.compile(r'^(\d{8})_')
NUM_GAE_RE = re.compile(r'(\d+)\s*개')


def file_date(p):
    m = DATE_RE.match(p.name)
    if not m:
        return None
    try:
        return datetime.datetime.strptime(m.group(1), '%Y%m%d').date()
    except ValueError:
        return None


def result_files(results_dir):
    d = pathlib.Path(results_dir)
    if not d.exists():
        return []
    out = []
    for p in d.iterdir():
        if p.is_file() and p.name.endswith('_결과.md'):
            dt = file_date(p)
            if dt and dt >= START_DATE:
                out.append((p, dt))
    return out


def first_heading(path):
    try:
        text = path.read_text(encoding='utf-8', errors='replace')
    except OSError:
        return ''
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('#'):
            return line.lstrip('#').strip()
    return ''


def item_count_for(path):
    heading = first_heading(path)
    nums = [int(n) for n in NUM_GAE_RE.findall(heading)]
    return max(nums) if nums else 1


def build_counts(results_dir):
    files = result_files(results_dir)
    counts = {'doneJobs': {'jobs': len(files), 'items': len(files)}}
    for key, keywords in CATEGORIES.items():
        matched = [p for p, _dt in files if any(k.lower() in p.name.lower() for k in keywords)]
        items = sum(item_count_for(p) for p in matched)
        counts[key] = {'jobs': len(matched), 'items': items}
    # 지난 14일 날마다 전체 결과 파일 수(갈래 구분 없음 — 전체 활동량 막대).
    today = datetime.date.today()
    daily = []
    by_date = {}
    for _p, dt in files:
        by_date[dt] = by_date.get(dt, 0) + 1
    for i in range(DAILY_WINDOW - 1, -1, -1):
        d = today - datetime.timedelta(days=i)
        daily.append({'date': d.isoformat(), 'count': by_date.get(d, 0)})
    return {'counts': counts, 'labels': LABELS, 'daily': daily, 'since': START_DATE.isoformat()}


def shrink_to_dataurl(path):
    if Image is None or not path.exists():
        return None
    try:
        im = Image.open(path).convert('RGB')
    except Exception:
        return None
    w, h = im.size
    scale = IMG_MAX_SIDE / max(w, h) if max(w, h) > IMG_MAX_SIDE else 1.0
    cur = im.resize((max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1.0 else im
    for _ in range(3):
        for quality in (80, 65, 50, 35, 25, 18):
            buf = io.BytesIO()
            cur.save(buf, format='JPEG', quality=quality)
            data = buf.getvalue()
            if len(data) <= IMG_MAX_BYTES:
                return 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')
        cw, ch = cur.size
        cur = cur.resize((max(1, int(cw * 0.7)), max(1, int(ch * 0.7))))
    return None


def find_job_image(results_dir, job_id):
    d = pathlib.Path(results_dir)
    if not d.exists():
        return None
    cands = [p for p in d.glob(job_id + '*') if p.suffix.lower() in IMG_EXTS]
    return cands[0] if cands else None


def build_wall_entries(ops_path, results_dir):
    ops_path = pathlib.Path(ops_path)
    if not ops_path.exists():
        return []
    data = json.loads(ops_path.read_text(encoding='utf-8'))
    done = [j for j in data.get('jobs', []) if (j.get('status') or '') == '끝']
    done.sort(key=lambda j: j.get('sent') or '')
    entries = []
    for j in done:
        entry = {'job': j.get('job', ''), 'title': j.get('title', ''), 'sent': j.get('sent', ''), 'result': j.get('result', '') or ''}
        img_path = find_job_image(results_dir, j.get('job', ''))
        if img_path:
            url = shrink_to_dataurl(img_path)
            if url:
                entry['image'] = url
        entries.append(entry)
    return entries


def get_etag(path):
    r = requests.get(BASE + path, params=params(), headers={'X-Firebase-ETag': 'true'})
    r.raise_for_status()
    return r.headers.get('ETag'), r.json()


def put_if_match(path, value, etag):
    return requests.put(BASE + path, params=params(), json=value, headers={'If-Match': etag})


def merge_wall(existing, new_entries):
    existing = existing if isinstance(existing, list) else []
    known = {e.get('job') for e in existing if isinstance(e, dict)}
    merged = list(existing)
    added = []
    for e in new_entries:
        if e['job'] not in known:
            merged.append(e)
            known.add(e['job'])
            added.append(e['job'])
    return merged, added


def content_hash(results_dir, ops_path):
    h = hashlib.sha256()
    for p, _dt in sorted(result_files(results_dir), key=lambda t: t[0].name):
        h.update(p.name.encode('utf-8'))
    ops_path = pathlib.Path(ops_path)
    h.update(ops_path.read_bytes() if ops_path.exists() else b'missing')
    return h.hexdigest()


def sync(results_dir=DEFAULT_RESULTS, ops_path=DEFAULT_OPS, force=False):
    chash = content_hash(results_dir, ops_path)
    if not force and MARKER_PATH.exists():
        try:
            prev = json.loads(MARKER_PATH.read_text(encoding='utf-8'))
        except Exception:
            prev = {}
        if prev.get('hash') == chash:
            print('변화 없음 — 건너뜀')
            return {'skipped': True}

    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    counts_payload = build_counts(results_dir)
    counts_payload['updatedAt'] = now_iso
    c_etag, _ = get_etag('/hub/doneWall/counts.json')
    r1 = put_if_match('/hub/doneWall/counts.json', counts_payload, c_etag)
    r1.raise_for_status()

    new_entries = build_wall_entries(ops_path, results_dir)
    w_etag, w_cur = get_etag('/hub/doneWall/wall.json')
    merged, added = merge_wall(w_cur, new_entries)
    wall_payload = {'entries': merged, 'updatedAt': now_iso}
    r2 = put_if_match('/hub/doneWall/wall.json', wall_payload, w_etag)
    r2.raise_for_status()

    MARKER_DIR.mkdir(parents=True, exist_ok=True)
    MARKER_PATH.write_text(json.dumps({'hash': chash, 'lastRun': now_iso}, ensure_ascii=False), encoding='utf-8')
    print('ok — counts:', {k: v['items'] for k, v in counts_payload['counts'].items()}, '· wall 전체:', len(merged), '· 새로 쌓음:', added or '없음')
    return {'skipped': False, 'added': added, 'wallTotal': len(merged)}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--results', default=DEFAULT_RESULTS)
    ap.add_argument('--ops', default=DEFAULT_OPS)
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    sync(a.results, a.ops, a.force)
