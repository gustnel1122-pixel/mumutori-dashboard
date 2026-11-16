"""총괄 보고서 동기화(20261116_2326) — H:\\...\\보고서\\현재\\report.json + jpg 4장을 base64로 담아
Firebase hub/chongwalReport/current 로 올린다. 이미지·report.json은 공개 GitHub 저장소에 절대 들어가지 않는다
(내부 운영 화면 전용 자료라 Firebase RTDB에만 둔다) — 이 스크립트도 이 repo의 _tools 안에 있지만 실행 결과는
Firebase로만 간다.

씀: python _tools\\chongwal_report_sync.py [--src <현재 폴더>] [--force]
  - --src: 기본값은 실제 운영 폴더(H:\\내 드라이브\\무무토리\\옵시디언\\_협업\\총괄_일감함\\보고서\\현재).
    시험할 때만 다른 폴더(가짜 report.json + jpg)를 가리킨다.
  - --force: 아래 '변화 없음' 건너뛰기를 무시하고 무조건 올린다.

바뀐 것 없으면 아무것도 안 함(값싼 10분 틱): report.json + 카드 jpg 전부의 내용으로 해시를 만들어
<이 폴더 경로별로 다른> marker 파일(mumutori-auto\\keeper\\_chongwal_report_marker_<해시12>.json)과 비교한다.
같으면 Firebase에 아무 요청도 보내지 않는다(건너뜀).

새 id가 들어오면: 지금 hub/chongwalReport/current 를 hub/chongwalReport/history/<옛 id> 로 먼저 옮겨
담고(옛 자료를 잃지 않음), 그다음 current 를 새 값으로 덮어쓴다. 두 쓰기 모두 그 leaf 자신의 ETag로
조건부 PUT 한다(mumutori-auto\\inbox_private\\_5b_write_barcodes.py 와 같은 패턴 — 부모가 아니라
leaf 자신의 ETag).
"""
import sys, os, json, base64, hashlib, argparse, pathlib, datetime

sys.path.insert(0, 'C:/Users/ilc57/mumutori-auto')
from fb_auth import params  # noqa: E402
import requests  # noqa: E402

BASE = 'https://mumutori-letter-default-rtdb.asia-southeast1.firebasedatabase.app'
DEFAULT_SRC = r'H:\내 드라이브\무무토리\옵시디언\_협업\총괄_일감함\보고서\현재'
MARKER_DIR = pathlib.Path(r'C:\Users\ilc57\mumutori-auto\keeper')


def marker_path(src):
    h = hashlib.sha1(str(src).encode('utf-8')).hexdigest()[:12]
    return MARKER_DIR / f'_chongwal_report_marker_{h}.json'


def load_source(src):
    report_path = pathlib.Path(src) / 'report.json'
    if not report_path.exists():
        raise SystemExit(f'report.json 없음: {report_path}')
    data = json.loads(report_path.read_text(encoding='utf-8'))
    h = hashlib.sha256()
    h.update(report_path.read_bytes())
    for c in data.get('cards', []):
        p = pathlib.Path(src) / c['file']
        if p.exists():
            h.update(p.read_bytes())
        else:
            h.update(b'missing:' + c['file'].encode('utf-8'))
    return data, h.hexdigest()


def build_payload(src, data):
    cards = []
    for c in data.get('cards', []):
        p = pathlib.Path(src) / c['file']
        raw = p.read_bytes()
        b64 = base64.b64encode(raw).decode('ascii')
        cards.append({'caption': c.get('caption', ''), 'img': f'data:image/jpeg;base64,{b64}'})
    if not cards:
        raise SystemExit('카드가 없습니다 — report.json을 확인해 주세요.')
    return {
        'id': data['id'],
        'updatedAt': data.get('updatedAt') or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'title': data.get('title', ''),
        'cards': cards,
    }


def get_etag(path):
    r = requests.get(BASE + path, params=params(), headers={'X-Firebase-ETag': 'true'})
    r.raise_for_status()
    return r.headers.get('ETag'), r.json()


def put_if_match(path, value, etag):
    r = requests.put(BASE + path, params=params(), json=value, headers={'If-Match': etag})
    return r


def sync(src=DEFAULT_SRC, force=False):
    src = pathlib.Path(src)
    data, content_hash = load_source(src)
    mpath = marker_path(src)
    if not force and mpath.exists():
        try:
            prev = json.loads(mpath.read_text(encoding='utf-8'))
        except Exception:
            prev = {}
        if prev.get('hash') == content_hash:
            print('변화 없음 — 건너뜀')
            return {'skipped': True}

    payload = build_payload(src, data)
    cur_etag, cur_val = get_etag('/hub/chongwalReport/current.json')

    if cur_val and isinstance(cur_val, dict) and cur_val.get('id') and cur_val.get('id') != payload['id']:
        old_id = cur_val['id']
        hist_path = f'/hub/chongwalReport/history/{old_id}.json'
        hist_etag, _ = get_etag(hist_path)
        hr = put_if_match(hist_path, cur_val, hist_etag)
        hr.raise_for_status()
        print('지난 보고서 보관:', old_id)

    cr = put_if_match('/hub/chongwalReport/current.json', payload, cur_etag)
    cr.raise_for_status()

    MARKER_DIR.mkdir(parents=True, exist_ok=True)
    mpath.write_text(
        json.dumps({'hash': content_hash, 'lastRun': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'src': str(src)}, ensure_ascii=False),
        encoding='utf-8',
    )
    print('ok — current id:', payload['id'])
    return {'skipped': False, 'id': payload['id']}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=DEFAULT_SRC)
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    sync(a.src, a.force)
