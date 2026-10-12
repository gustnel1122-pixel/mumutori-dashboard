"""브랜딩 공개 목록(src/branding-data.json) 검사 — 공개 저장소·공개 화면으로 나가는 자료의 관문.

원문을 정규식으로 훑지 않고, JSON을 읽어 구조를 본다(칸 이름에 따옴표를 붙이든 말든 같은 결과).
 1) 허용 목록에 있는 칸만 통과한다. 그 밖의 칸이 하나라도 있으면 실패 — 주문번호·도안 원본 같은 칸은 이름이 무엇이든 들어올 수 없다.
 2) 칸마다 정해진 형식(글·숫자·날짜·목록)과 정해진 값만. 상태는 미등록·후보·권고까지(주문 완료·수령·사용 중은 브라우저 장부의 내 기록에서만).
 3) 모든 글 값에서 금지: 파일 위치(윈도우 드라이브·역슬래시·네트워크(UNC)·POSIX 절대 경로·상대 경로·홈 폴더·file:), 허용한 판매처 밖의 주소
    (허용한 주소의 뒷부분에 끼워 넣은 것 포함), 메일·전화번호, 파일 ID처럼 보이는 긴 문자열, 지나치게 긴 글. 금액은 상식적인 범위만.
문제를 알릴 때 값은 적지 않는다(위치와 종류만) — 검사 기록에 비공개 값이 남지 않게.

    python brand_public_check.py [파일]      # 문제 없으면 0, 있으면 문제를 적고 1
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ALLOWED_HOSTS = ("gogostamp.com",)     # 공개 목록에 적어도 되는 판매처 주소. 판매처를 늘릴 때는 여기에 먼저 추가한다.
STATUSES = ("unregistered", "candidate", "recommended")
KINDS = ("도장", "잉크", "포장재", "기타")
MAX_TEXT, MAX_AMOUNT = 1000, 10_000_000      # 글 한 칸의 길이, 금액 한 칸의 크기(숫자·긴 글에 다른 것을 숨기지 못하게)

# 칸 이름 → 형식. 여기에 없는 칸은 공개 목록에 둘 수 없다.
TOP = {"about": "str", "updated": "date", "editor": "str", "basis": "str", "statusRule": "str", "items": "items", "dont": "strs",
       "makerRules": "strs", "artPlan": "str", "reorderSteps": "strs", "privateNote": "str"}
ITEM = {"id": "id", "kind": "kind", "name": "str", "use": "str?", "status": "status", "vendor": "str?", "productNo": "str?", "url": "url?",
        "model": "str?", "form": "str?", "printSize": "str?", "artSize": "str?", "option": "str?", "ink": "ink?", "price": "price?", "art": "art?",
        "pending": "strs", "caution": "str?"}
INK = {"maker": "str?", "model": "str?", "volume": "str?", "compat": "str?"}
PRICE = {"lines": "lines", "total": "int", "note": "str?", "checked": "date"}
ART = {"rule": "str?"}
REQUIRED = {"top": ("updated", "statusRule", "items"), "item": ("id", "kind", "name", "status"), "price": ("lines", "total", "checked")}

ITEM_ID = re.compile(r"^[A-Za-z0-9가-힣_-]{1,40}$")
ANY_URL = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*):/{1,3}([^\s/'\"<>()]*)[^\s'\"<>]*")
BAD_TEXT = [
    ("스크립트·파일 주소", re.compile(r"(?i)\b(?:javascript|vbscript|data|file|blob)\s*:")),
    ("역슬래시가 든 경로", re.compile(r"\\")),
    ("윈도우 드라이브 경로", re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:/")),
    ("네트워크(UNC) 경로", re.compile(r"(?<![:/\w.])//[^/\s]")),
    ("POSIX 절대 경로", re.compile(r"(?<![\w:/.~])/[^\s/'\"]+/")),
    ("POSIX 절대 경로의 파일", re.compile(r"(?<![\w:/.~])/[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,5}\b")),
    ("홈 폴더 경로", re.compile(r"(?<![\w/])~/")),
    ("상대 경로", re.compile(r"(?<![\w.])\.{1,2}/")),
    ("폴더 안의 파일 위치", re.compile(r"(?i)[^\s/]+/[^\s/]*\.(?:ai|psd|pdf|png|jpe?g|svg|eps|zip|xlsx?|docx?|hwp|txt|json|csv)\b")),
    ("메일 주소", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("전화번호", re.compile(r"(?<!\d)0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)")),
    ("파일 ID처럼 보이는 긴 문자열", re.compile(r"(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{28,}(?![A-Za-z0-9_-])")),
]
# 허용한 판매처 주소라도 뒷부분(경로·쿼리)에 다른 주소나 파일 ID를 끼워 넣을 수 없다.
URL_TAIL_BAD = [("주소 안에 끼워 넣은 다른 주소", re.compile(r"(?i)://|%3a|%2f%2f|@|\\")), BAD_TEXT[-1]]
BARE_HOST = re.compile(r"(?i)(?<![\w@.-])((?:[a-z0-9-]+\.)+(?:com|net|org|kr|io|me|so|ms|app|page|dev|ly|gl|cc|co))(?![\w-])")


def host_ok(host):
    host = host.lower().rsplit("@", 1)[-1].split(":", 1)[0]
    return any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)


def scan_text(value, where, errs):
    """글 값 하나에서 공개하면 안 되는 모양을 찾는다."""
    if len(value) > MAX_TEXT:
        errs.append(f"{where}: 글이 너무 깁니다({MAX_TEXT}자 이내)")
    rest, last = [], 0
    for m in ANY_URL.finditer(value):
        if m.group(1).lower() == "https" and host_ok(m.group(2)):
            rest.append(value[last:m.start()])          # 허용한 판매처 주소는 걷어 내고 나머지를 본다
            last = m.end()
            check_url_tail(m, where, errs)
        else:
            errs.append(f"{where}: 허용한 판매처 밖의 주소(https://{' · '.join(ALLOWED_HOSTS)} 만 가능)")
    rest.append(value[last:])
    rest = " ".join(rest)
    for what, pattern in BAD_TEXT:
        if pattern.search(rest):
            errs.append(f"{where}: {what}")
    for m in BARE_HOST.finditer(rest):
        if not host_ok(m.group(1)):
            errs.append(f"{where}: 허용한 판매처 밖의 주소(도메인)")
            break


def check_url_tail(m, where, errs):
    """허용한 판매처 주소의 뒷부분(경로·쿼리)을 본다."""
    tail = m.group(0)[m.end(2) - m.start():]
    for what, pattern in URL_TAIL_BAD:
        if pattern.search(tail):
            errs.append(f"{where}: {what}")
    for b in BARE_HOST.finditer(tail):
        if not host_ok(b.group(1)):
            errs.append(f"{where}: 주소 안에 끼워 넣은 다른 주소(도메인)")
            break


def is_date(v):
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return False
    try:
        date.fromisoformat(v)
        return True
    except ValueError:
        return False


def check_obj(obj, spec, where, errs, required=()):
    if not isinstance(obj, dict):
        errs.append(f"{where}: 묶음({{}}) 형식이어야 합니다")
        return
    for key in obj:
        if key not in spec:
            errs.append(f"{where}: 허용하지 않은 칸 '{str(key)[:40]}' — 공개 목록에는 허용 목록의 칸만 둘 수 있습니다")
    for key in required:
        if key not in obj:
            errs.append(f"{where}: 필요한 칸 '{key}' 없음")
    for key, kind in spec.items():
        if key in obj:
            check_value(obj[key], kind, f"{where}.{key}", errs)


def check_value(v, kind, where, errs):
    if kind.endswith("?"):
        if v is None:
            return
        kind = kind[:-1]
    if kind == "str":
        if not isinstance(v, str):
            errs.append(f"{where}: 글이어야 합니다")
        else:
            scan_text(v, where, errs)
    elif kind == "strs":
        if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
            errs.append(f"{where}: 글 목록이어야 합니다")
        else:
            for i, x in enumerate(v):
                scan_text(x, f"{where}[{i}]", errs)
    elif kind == "date":
        if not is_date(v):
            errs.append(f"{where}: 날짜(YYYY-MM-DD)여야 합니다")
    elif kind == "int":
        if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= MAX_AMOUNT:
            errs.append(f"{where}: 0 이상 {MAX_AMOUNT:,} 이하의 정수여야 합니다")
    elif kind == "id":
        if not isinstance(v, str) or not ITEM_ID.fullmatch(v):
            errs.append(f"{where}: 품목 ID는 글자·숫자·-·_ 40자 이내")
    elif kind == "kind":
        if v not in KINDS:
            errs.append(f"{where}: 종류는 {'·'.join(KINDS)} 중 하나")
    elif kind == "status":
        if v not in STATUSES:
            errs.append(f"{where}: 공개 목록의 상태는 {'·'.join(STATUSES)} 까지만(주문 완료·수령·사용 중은 내 기록에서만)")
    elif kind == "url":
        m = ANY_URL.fullmatch(v) if isinstance(v, str) else None
        if not m or m.group(1).lower() != "https" or not host_ok(m.group(2)):
            errs.append(f"{where}: 판매처 상품 주소는 https://{' · '.join(ALLOWED_HOSTS)} 만 가능")
        else:
            check_url_tail(m, where, errs)
    elif kind == "ink":
        check_obj(v, INK, where, errs)
    elif kind == "art":
        check_obj(v, ART, where, errs)
    elif kind == "price":
        check_obj(v, PRICE, where, errs, REQUIRED["price"])
        if isinstance(v, dict) and isinstance(v.get("lines"), list) and isinstance(v.get("total"), int) and not isinstance(v.get("total"), bool):
            amounts = [x[1] for x in v["lines"] if isinstance(x, list) and len(x) == 2 and isinstance(x[1], int) and not isinstance(x[1], bool)]
            if len(amounts) == len(v["lines"]) and sum(amounts) != v["total"]:
                errs.append(f"{where}: 금액 내역의 합이 total과 다릅니다")
    elif kind == "lines":
        if not isinstance(v, list):
            errs.append(f"{where}: [이름, 금액] 목록이어야 합니다")
            return
        for i, x in enumerate(v):
            if not (isinstance(x, list) and len(x) == 2 and isinstance(x[0], str) and isinstance(x[1], int) and not isinstance(x[1], bool) and 0 <= x[1] <= MAX_AMOUNT):
                errs.append(f"{where}[{i}]: [이름, 0 이상 {MAX_AMOUNT:,} 이하의 정수 금액] 이어야 합니다")
            else:
                scan_text(x[0], f"{where}[{i}]", errs)
    elif kind == "items":
        if not isinstance(v, list):
            errs.append(f"{where}: 품목 목록이어야 합니다")
            return
        seen = set()
        for i, it in enumerate(v):
            name = f"{where}[{i}]" + (f"({it['id']})" if isinstance(it, dict) and isinstance(it.get("id"), str) and ITEM_ID.fullmatch(it["id"]) else "")
            check_obj(it, ITEM, name, errs, REQUIRED["item"])
            if isinstance(it, dict) and isinstance(it.get("id"), str):
                if it["id"] in seen:
                    errs.append(f"{name}: 품목 ID가 겹칩니다")
                seen.add(it["id"])
    else:                                                # 허용 목록에 형식을 잘못 적은 경우 — 통과시키지 않는다
        errs.append(f"{where}: 검사 형식 '{kind}' 을 알 수 없습니다")


def check_data(data):
    errs = []
    check_obj(data, TOP, "공개 목록", errs, REQUIRED["top"])
    return errs


def no_duplicate_keys(pairs):
    out = {}
    for k, v in pairs:
        if k in out:
            raise ValueError(f"같은 칸 '{str(k)[:40]}' 이 두 번 적혀 있습니다")
        out[k] = v
    return out


def check_file(path):
    """문제 목록을 돌려준다(빈 목록이면 통과)."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8-sig"), object_pairs_hook=no_duplicate_keys)
    except FileNotFoundError:
        return ["공개 목록 파일이 없습니다"]
    except (ValueError, UnicodeDecodeError) as e:
        return [f"JSON으로 읽을 수 없습니다: {str(e)[:120]}"]
    return check_data(data)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(errors="backslashreplace")
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "src" / "branding-data.json"
    problems = check_file(target)
    if problems:
        print("브랜딩 공개 목록 검사 실패:", file=sys.stderr)
        for p in problems:
            print(" -", p, file=sys.stderr)
        sys.exit(1)
    print("브랜딩 공개 목록 검사 통과")
