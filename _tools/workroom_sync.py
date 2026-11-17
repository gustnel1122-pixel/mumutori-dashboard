"""자리별 작업실 — 실시간 동기화(20261117_1030 2번) — 자리 9개(coupang·detail-mall·kakao·purchase·sourcing·
design3d·video·video-analysis·hamili)의 `C:\\Users\\ilc57\\mumutori-roles\\<자리>\\작업실\\<자리>.jsonl`
끝 50줄 + 참조된 그림을 작은 jpg(긴 변 320px · 25KB 안)로 줄여 Firebase hub/workroom 으로 올린다.
chongwal_ops_sync.py·chongwal_report_sync.py와 형제 스크립트지만 자료·Firebase 경로가 다르므로 섞지 않는다.

씀: python _tools\\workroom_sync.py [--roles <mumutori-roles 폴더>] [--force]

작업실 jsonl 한 줄 모양(각 자리 CLAUDE.md "작업실 한 줄" 규칙): {"at":"ISO 시각","job":"일감id",
"step":"짧은 단계 글","files":["경로", ...],"progress":"4/37"} — 키·비밀번호·원가·손님 정보는 넣지 않는다(자리
CLAUDE.md 규칙이 막음, 이 스크립트는 들어온 값을 그대로 옮기기만 함 — 내용 검열은 하지 않음).

자리가 아직 jsonl에 한 줄도 안 썼으면(20261117_1030 작성 직후라 당장은 비어 있을 수 있음) results\\·work\\
폴더에서 가장 최근 수정된 파일로 "자동 추정"한다(표시: autoEstimated=true) — jsonl 줄이 생기면 그 쪽을 그대로
쓰고 추정은 멈춘다.

마지막 움직임이 30분 넘으면 status='쉬는 중', 가장 최근 결과 파일 첫 줄이 '막힘:'으로 시작하면 status='막힘',
그 외에 jsonl 자료가 전혀 없으면(파일 없음·폴더 없음) status='확인 필요'(지어내지 않음), 그 외 '움직이는 중'.

바뀐 것 없으면 아무것도 안 함 — jsonl 파일들의 (경로,크기,수정시각) + 각 자리 results/work 안에서 가장 최근
수정 파일의 (경로,수정시각)으로 해시를 만들어 마커 파일과 비교한다(chongwal_ops_sync.py와 같은 방식).
"""
import sys, os, json, base64, hashlib, argparse, pathlib, datetime, io

sys.path.insert(0, 'C:/Users/ilc57/mumutori-auto')
from fb_auth import params  # noqa: E402
import requests  # noqa: E402

try:
    from PIL import Image  # noqa: E402
except Exception:
    Image = None

BASE = 'https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app'
DEFAULT_ROLES = r'C:\Users\ilc57\mumutori-roles'
MARKER_DIR = pathlib.Path(r'C:\Users\ilc57\mumutori-auto\keeper')
MARKER_PATH = MARKER_DIR / '_workroom_marker.json'
SEATS = ['coupang', 'detail-mall', 'kakao', 'purchase', 'sourcing', 'design3d', 'video', 'video-analysis', 'hamili']
STALE_MINUTES = 30
IMG_MAX_SIDE = 320
IMG_MAX_BYTES = 25 * 1024
IMG_EXTS = {'.jpg', '.jpeg', '.png'}
MAX_STEPS_OUT = 50


def jsonl_path(roles_root, seat):
    return pathlib.Path(roles_root) / seat / '작업실' / f'{seat}.jsonl'


def parse_iso(s):
    if not s or not isinstance(s, str):
        return None
    try:
        s2 = s.strip()
        if s2.endswith('Z'):
            s2 = s2[:-1] + '+00:00'
        dt = datetime.datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc)
    except Exception:
        return None


def to_iso(dt):
    return dt.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def mtime_utc(path):
    try:
        return datetime.datetime.fromtimestamp(path.stat().st_mtime, tz=datetime.timezone.utc)
    except OSError:
        return None


def read_jsonl_tail(path, n=50):
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding='utf-8', errors='replace').splitlines()
    except OSError:
        return []
    out = []
    for line in lines[-n:]:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


def from_jsonl(roles_root, seat):
    p = jsonl_path(roles_root, seat)
    entries = read_jsonl_tail(p, MAX_STEPS_OUT)
    if not entries:
        return None
    steps = list(reversed(entries))  # 최신이 위
    latest = entries[-1]
    last_at = parse_iso(latest.get('at'))
    files_recent = []
    for e in steps:
        for f in (e.get('files') or []):
            if isinstance(f, str) and f not in files_recent:
                files_recent.append(f)
        if len(files_recent) >= 3:
            break
    return {
        'job': str(latest.get('job') or ''),
        'progress': str(latest.get('progress') or ''),
        'lastAt': last_at,
        'steps': [{
            'at': str(e.get('at') or ''),
            'job': str(e.get('job') or ''),
            'step': str(e.get('step') or ''),
            'progress': str(e.get('progress') or ''),
        } for e in steps],
        'filesRecent': files_recent[:3],
        'autoEstimated': False,
        'blocked': False,
    }


# results\·work\ 안에서 "일감 결과" 글 파일(.md)만 본다 — 엑셀·csv·이미지는 최신 활동 추정에는 안 씀
# (파일 이름만으로 무슨 일인지 지어내지 않기 위해, '결과'·'루틴'·'하루보고' 규칙 파일만).
def result_md_files(role_dir):
    out = []
    for sub in ('results', 'work'):
        d = role_dir / sub
        if not d.exists():
            continue
        for p in d.rglob('*.md'):
            if 'private' in p.parts:
                continue
            out.append(p)
    return out


def first_line(path):
    try:
        text = path.read_text(encoding='utf-8', errors='replace')
    except OSError:
        return ''
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line
    return ''


def guess_title(path):
    stem = path.stem
    # 날짜/시각 접두어(YYYYMMDD_HHMM_) 와 '_결과' 꼬리를 떼고 보기 좋게만 — 모르면 파일 이름 그대로.
    import re
    m = re.match(r'^\d{8}_\d{4}_(.+)$', stem)
    if m:
        stem = m.group(1)
    stem = stem.replace('_결과', '').replace('_', ' ')
    return stem


def from_fallback(role_dir):
    files = result_md_files(role_dir)
    if not files:
        return None
    files_with_mtime = [(f, mtime_utc(f)) for f in files]
    files_with_mtime = [(f, m) for f, m in files_with_mtime if m is not None]
    if not files_with_mtime:
        return None
    files_with_mtime.sort(key=lambda t: t[1], reverse=True)
    latest, last_at = files_with_mtime[0]
    blocked = first_line(latest).startswith('막힘:')
    steps = []
    for f, m in files_with_mtime[:10]:
        steps.append({'at': to_iso(m), 'job': '', 'step': guess_title(f), 'progress': ''})
    return {
        'job': guess_title(latest),
        'progress': '',
        'lastAt': last_at,
        'steps': steps,
        'filesRecent': [],
        'autoEstimated': True,
        'blocked': blocked,
    }


def recent_images(role_dir, extra_files):
    cands = []
    for f in extra_files:
        p = pathlib.Path(f)
        if p.exists() and p.suffix.lower() in IMG_EXTS:
            cands.append(p)
    if len(cands) < 3:
        pool = []
        for sub in ('results', 'work'):
            d = role_dir / sub
            if not d.exists():
                continue
            for p in d.rglob('*'):
                if p.suffix.lower() in IMG_EXTS and 'private' not in p.parts:
                    pool.append(p)
        pool_with_mtime = [(p, mtime_utc(p)) for p in pool]
        pool_with_mtime = [(p, m) for p, m in pool_with_mtime if m is not None]
        pool_with_mtime.sort(key=lambda t: t[1], reverse=True)
        for p, _ in pool_with_mtime:
            if p not in cands:
                cands.append(p)
            if len(cands) >= 3:
                break
    return cands[:3]


def shrink_to_dataurl(path):
    if Image is None:
        return None
    try:
        im = Image.open(path)
        im = im.convert('RGB')
    except Exception:
        return None
    w, h = im.size
    scale = IMG_MAX_SIDE / max(w, h) if max(w, h) > IMG_MAX_SIDE else 1.0
    cur = im.resize((max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1.0 else im
    for shrink_pass in range(3):
        for quality in (80, 65, 50, 35, 25, 18):
            buf = io.BytesIO()
            cur.save(buf, format='JPEG', quality=quality)
            data = buf.getvalue()
            if len(data) <= IMG_MAX_BYTES:
                return 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')
        cw, ch = cur.size
        cur = cur.resize((max(1, int(cw * 0.7)), max(1, int(ch * 0.7))))
    return None  # 그래도 안 들어가면 그 그림은 건너뜀(지어내지 않음, 자리 없이 빠짐)


def status_for(last_at, blocked, now):
    if blocked:
        return '막힘'
    if last_at is None:
        return '확인 필요'
    age_minutes = (now - last_at).total_seconds() / 60
    return '쉬는 중' if age_minutes > STALE_MINUTES else '움직이는 중'


def build_seat_payload(roles_root, seat, now):
    role_dir = pathlib.Path(roles_root) / seat
    picked = from_jsonl(roles_root, seat)
    if picked is None:
        picked = from_fallback(role_dir)
    if picked is None:
        return {
            'seat': seat, 'status': '확인 필요', 'job': '', 'progress': '',
            'lastMovedAt': '', 'steps': [], 'images': [], 'autoEstimated': True,
        }
    images_src = recent_images(role_dir, picked['filesRecent'])
    images = []
    for p in images_src:
        url = shrink_to_dataurl(p)
        if url:
            images.append(url)
    return {
        'seat': seat,
        'status': status_for(picked['lastAt'], picked['blocked'], now),
        'job': picked['job'],
        'progress': picked['progress'],
        'lastMovedAt': to_iso(picked['lastAt']) if picked['lastAt'] else '',
        'steps': picked['steps'],
        'images': images,
        'autoEstimated': picked['autoEstimated'],
    }


def content_hash(roles_root):
    h = hashlib.sha256()
    for seat in SEATS:
        role_dir = pathlib.Path(roles_root) / seat
        jp = jsonl_path(roles_root, seat)
        if jp.exists():
            st = jp.stat()
            h.update(f'{seat}:jsonl:{st.st_size}:{st.st_mtime}'.encode('utf-8'))
        else:
            h.update(f'{seat}:jsonl:missing'.encode('utf-8'))
        files = result_md_files(role_dir)
        files_with_mtime = sorted(((f, mtime_utc(f)) for f in files), key=lambda t: (t[1] or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)), reverse=True)
        if files_with_mtime:
            f, m = files_with_mtime[0]
            h.update(f'{seat}:latest:{f}:{m}'.encode('utf-8'))
    return h.hexdigest()


def get_etag(path):
    r = requests.get(BASE + path, params=params(), headers={'X-Firebase-ETag': 'true'})
    r.raise_for_status()
    return r.headers.get('ETag'), r.json()


def put_if_match(path, value, etag):
    return requests.put(BASE + path, params=params(), json=value, headers={'If-Match': etag})


def sync(roles_root=DEFAULT_ROLES, force=False):
    chash = content_hash(roles_root)
    if not force and MARKER_PATH.exists():
        try:
            prev = json.loads(MARKER_PATH.read_text(encoding='utf-8'))
        except Exception:
            prev = {}
        if prev.get('hash') == chash:
            print('변화 없음 — 건너뜀')
            return {'skipped': True}

    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {seat: build_seat_payload(roles_root, seat, now) for seat in SEATS}
    payload['updatedAt'] = to_iso(now)

    cur_etag, _cur_val = get_etag('/hub/workroom.json')
    r = put_if_match('/hub/workroom.json', payload, cur_etag)
    r.raise_for_status()

    MARKER_DIR.mkdir(parents=True, exist_ok=True)
    MARKER_PATH.write_text(
        json.dumps({'hash': chash, 'lastRun': to_iso(now), 'roles': str(roles_root)}, ensure_ascii=False),
        encoding='utf-8',
    )
    statuses = {s: payload[s]['status'] for s in SEATS}
    print('ok — 자리:', len(SEATS), '·', statuses)
    return {'skipped': False, 'statuses': statuses}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--roles', default=DEFAULT_ROLES)
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    sync(a.roles, a.force)
