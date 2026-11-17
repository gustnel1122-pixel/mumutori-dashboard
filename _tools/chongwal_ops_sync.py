"""총괄 운영실 동기화(20261117_0004) — H:\\...\\보고서\\현재\\ops.json(총괄이 strategy·proposals·jobs·seats를 씀)을
Firebase hub/chongwalOps 로 올린다. chongwal_report_sync.py(총괄 보고서 이미지 카드)와는 다른 자료·다른 Firebase
경로라 형제 스크립트로 따로 둔다 — 이미지(base64)를 전혀 다루지 않고, report.json처럼 '바뀌면 archive' 할 과거본도
필요 없는 지금 한 장짜리 상태판이라 섞을 이유가 없다(섞으면 두 자료의 검사·건너뛰기 조건이 서로 얽혀 2326 쪽을
건드릴 위험만 커진다).

씀: python _tools\\chongwal_ops_sync.py [--src <ops.json 경로>] [--results <결과 폴더>] [--alive <_살아있음.md 경로>] [--force]

자동 상태 도출(20261117_0004 지시) — jobs[] 의 status를 동기화 때마다 다시 계산한다:
  1) 결과\\<job>_결과.md 가 있으면 status='끝'. 그 job의 result가 비어 있으면 그 결과 파일의 첫 '#' 제목 줄을 채운다.
  2) 결과 파일이 없으면 _살아있음.md에서 그 job id가 나오는 줄만 보고 '진행 중'이 있으면 '하는 중', '막힘'이 있으면 '막힘'.
  3) 총괄이 이미 기본값('보냄') 말고 다른 값(하는 중·끝·막힘)을 직접 적어 두었으면 그 값을 그대로 둔다(자동 판단이
     deliberate한 사람 판단을 덮어쓰지 않음) — '보냄'은 일감을 만들 때 자동으로 붙는 시작값이라 자동 판단이 올려 쓸 수 있다.
  아무 근거도 없으면 원래 값('보냄' 또는 총괄이 적은 값)을 그대로 둔다 — 지어내지 않음.

바뀐 것 없으면 아무것도 안 함: ops.json 내용 + 결과 폴더의 파일 이름 목록(내용까지는 안 읽음, 새 결과 파일이
생겼는지만) + _살아있음.md 내용으로 해시를 만들어 마커 파일과 비교한다(report.json 동기화와 같은 방식).
"""
import sys, os, json, hashlib, argparse, pathlib, datetime

sys.path.insert(0, 'C:/Users/ilc57/mumutori-auto')
from fb_auth import params  # noqa: E402
import requests  # noqa: E402

BASE = 'https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app'
ROOT = r'H:\내 드라이브\무무토리\옵시디언\_협업\총괄_일감함'
DEFAULT_SRC = ROOT + r'\보고서\현재\ops.json'
DEFAULT_RESULTS = ROOT + r'\결과'
DEFAULT_ALIVE = ROOT + r'\_살아있음.md'
MARKER_DIR = pathlib.Path(r'C:\Users\ilc57\mumutori-auto\keeper')
DEFAULT_STATUS = '보냄'  # 일감을 만들 때 총괄이 기본으로 넣는 값 — 이 값일 때만 아래 자동 판단으로 올려 쓴다.


def marker_path(src):
    h = hashlib.sha1(str(src).encode('utf-8')).hexdigest()[:12]
    return MARKER_DIR / f'_chongwal_ops_marker_{h}.json'


def result_file_for(results_dir, job_id):
    p = pathlib.Path(results_dir) / f'{job_id}_결과.md'
    return p if p.exists() else None


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


def alive_mention(alive_text, job_id):
    # job id가 들어간 줄만 본다(보통 "**<id>(...)**: ..." 모양) — 글 전체에서 낱말을 찾으면 다른 일감 설명과 섞일 수 있다.
    for line in alive_text.splitlines():
        if job_id in line:
            if '막힘' in line:
                return '막힘'
            if '진행 중' in line or '진행중' in line:
                return '하는 중'
    return None


def derive_status(job, results_dir, alive_text):
    explicit = job.get('status') or DEFAULT_STATUS
    result = job.get('result') or ''
    if explicit != DEFAULT_STATUS:
        return explicit, result  # 총괄이 이미 판단을 적어 둔 값 — 자동 판단이 덮지 않음
    rf = result_file_for(results_dir, job.get('job', ''))
    if rf:
        return '끝', (result or first_heading(rf))
    mention = alive_mention(alive_text, job.get('job', ''))
    if mention:
        return mention, result
    return explicit, result


def apply_auto_status(data, results_dir, alive_text):
    jobs = []
    for job in data.get('jobs', []):
        status, result = derive_status(job, results_dir, alive_text)
        new_job = dict(job)
        new_job['status'] = status
        new_job['result'] = result
        jobs.append(new_job)
    out = dict(data)
    out['jobs'] = jobs
    # revenuePlan(20261117_1030 "돈 버는 길" — 총괄이 ops.json에 직접 씀)은 jobs처럼 자동 판단할 값이 없어
    # 그대로 둔다(dict(data)가 이미 들고 있음) — 여기서는 모양만 가볍게 확인해 빈 리스트/없음을 구분해 둔다.
    out['revenuePlan'] = data.get('revenuePlan', [])
    return out


def content_hash(src, results_dir, alive_path):
    h = hashlib.sha256()
    src = pathlib.Path(src)
    h.update(src.read_bytes() if src.exists() else b'missing')
    results_dir = pathlib.Path(results_dir)
    names = sorted(p.name for p in results_dir.glob('*_결과.md')) if results_dir.exists() else []
    h.update('\n'.join(names).encode('utf-8'))
    alive_path = pathlib.Path(alive_path)
    h.update(alive_path.read_bytes() if alive_path.exists() else b'missing')
    return h.hexdigest()


def get_etag(path):
    r = requests.get(BASE + path, params=params(), headers={'X-Firebase-ETag': 'true'})
    r.raise_for_status()
    return r.headers.get('ETag'), r.json()


def put_if_match(path, value, etag):
    return requests.put(BASE + path, params=params(), json=value, headers={'If-Match': etag})


def sync(src=DEFAULT_SRC, results_dir=DEFAULT_RESULTS, alive_path=DEFAULT_ALIVE, force=False):
    src = pathlib.Path(src)
    if not src.exists():
        raise SystemExit(f'ops.json 없음: {src}')
    data = json.loads(src.read_text(encoding='utf-8'))

    mpath = marker_path(src)
    chash = content_hash(src, results_dir, alive_path)
    if not force and mpath.exists():
        try:
            prev = json.loads(mpath.read_text(encoding='utf-8'))
        except Exception:
            prev = {}
        if prev.get('hash') == chash:
            print('변화 없음 — 건너뜀')
            return {'skipped': True}

    alive_text = pathlib.Path(alive_path).read_text(encoding='utf-8', errors='replace') if pathlib.Path(alive_path).exists() else ''
    payload = apply_auto_status(data, results_dir, alive_text)
    payload['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    cur_etag, _cur_val = get_etag('/hub/chongwalOps.json')
    r = put_if_match('/hub/chongwalOps.json', payload, cur_etag)
    r.raise_for_status()

    MARKER_DIR.mkdir(parents=True, exist_ok=True)
    mpath.write_text(
        json.dumps({'hash': chash, 'lastRun': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'src': str(src)}, ensure_ascii=False),
        encoding='utf-8',
    )
    changed = [j['job'] for j, j2 in zip(data.get('jobs', []), payload['jobs']) if (j.get('status') or DEFAULT_STATUS) != j2['status']]
    print('ok — jobs:', len(payload['jobs']), '· proposals:', len(payload.get('proposals', [])),
          '· revenuePlan 갈래:', len(payload.get('revenuePlan', [])), '· 상태 바뀐 일감:', changed or '없음')
    return {'skipped': False, 'changed': changed}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=DEFAULT_SRC)
    ap.add_argument('--results', default=DEFAULT_RESULTS)
    ap.add_argument('--alive', default=DEFAULT_ALIVE)
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    sync(a.src, a.results, a.alive, a.force)
