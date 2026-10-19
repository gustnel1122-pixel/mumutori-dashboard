// 재무 공용 장부 저장 — Firebase hub/financeV1 (사장님 구글 로그인 전용 칸, 보안 규칙은 hub 규칙을 그대로 물려받음).
// SDK 없이 REST + ID 토큰(fbauth.dbUrl). 쓰기는 '한 줄' 단위(PUT entries/<id>) — 칸 전체를 덮어쓰지 않는다.
// 시험: window.__MMT_TEST_FIN__ = {entries:{}, sales:{}, meta:{}} 가 있으면 네트워크 없이 메모리에서만 읽고 쓴다.
import { dbUrl } from './fbauth.js';

export const ROOT = 'hub/financeV1';
// 칸 자리(1단계에서 쓰는 것: entries · receipts · meta, 2단계 · 알림 입구가 채울 것: sales · inboxSeen · imports · recon · legacy)
export const PATHS = { entries: 'entries', receipts: 'receipts', meta: 'meta', sales: 'sales', inboxSeen: 'inboxSeen' };
// 알림 입구(7절): hub/financeInbox/<비밀키>/<id> — 규칙 적용 · 휴대폰 설정은 q115 답과 승인 뒤. 여기서는 이름만 잡아 둔다.
export const INBOX_ROOT = 'hub/financeInbox';

const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));

export function openFinStore({ root = ROOT, onChange, onStatus } = {}) {
  const test = typeof window !== 'undefined' && window.__MMT_TEST_FIN__;
  let book = { entries: {}, sales: {}, meta: {} }, timer = 0, state = '';
  const status = s => { if (s !== state) { state = s; onStatus?.(s); } };
  const emit = () => onChange?.(clone(book));

  async function req(method, path, body) {
    if (test) {   // 메모리 시험: 같은 자리 규칙(줄 단위 쓰기)만 흉내 낸다
      const keys = path.split('/').filter(Boolean); let o = test;
      if (method === 'GET') { for (const k of keys) o = o?.[k]; return clone(o ?? null); }
      for (const k of keys.slice(0, -1)) o = o[k] = o[k] || {};
      const last = keys.at(-1);
      if (method === 'PUT') o[last] = clone(body); else if (method === 'PATCH') o[last] = { ...(o[last] || {}), ...clone(body) }; else if (method === 'DELETE') delete o[last];
      return clone(o[last] ?? null);
    }
    return reqAbs(method, `${root}/${path}`.replace(/\/$/, ''), body);
  }
  async function reqAbs(method, fullPath, body) {
    const url = await dbUrl(fullPath);
    const r = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 || r.status === 403) { status('denied'); throw Error('공용 장부를 열 권한이 없습니다. 사장님 구글 계정으로 로그인해 주세요.'); }
    if (!r.ok) throw Error('공용 장부 ' + (method === 'GET' ? '읽기' : '저장') + ' 실패 (' + r.status + ')');
    return r.status === 204 ? null : r.json();
  }

  async function load() {
    try {
      status('loading');
      const [entries, sales, meta] = await Promise.all([req('GET', PATHS.entries), req('GET', PATHS.sales), req('GET', PATHS.meta)]);
      book = { entries: entries || {}, sales: sales || {}, meta: meta || {} };
      status('ok'); emit(); return clone(book);
    } catch (err) { if (state !== 'denied') status('offline'); throw err; }
  }
  return {
    load,
    book: () => clone(book),
    // 한 줄 넣기(새 id) — 다시 읽어 서버 값으로 확인한 줄을 돌려준다(완료 = 바뀐 상태를 다시 읽어 판정)
    async add(entry) {
      await req('PUT', `${PATHS.entries}/${entry.id}`, entry);
      const saved = await req('GET', `${PATHS.entries}/${entry.id}`);
      if (!saved || saved.amount !== entry.amount || saved.date !== entry.date) throw Error('저장했지만 다시 읽은 값이 다릅니다. 새로고침 뒤 확인해 주세요.');
      book.entries[entry.id] = saved; emit(); return saved;
    },
    // 칸 몇 개만 고치기(분류 정하기 · 취소)
    async patch(id, fields) {
      const saved = await req('PATCH', `${PATHS.entries}/${id}`, { ...fields, updatedAt: new Date().toISOString() });
      const back = await req('GET', `${PATHS.entries}/${id}`);
      book.entries[id] = back || saved; emit(); return book.entries[id];
    },
    async saveReceipt(id, dataUrl) {
      if (String(dataUrl).length > 420000) throw Error('사진이 너무 큽니다(줄인 뒤에도 300KB 초과).');
      await req('PUT', `${PATHS.receipts}/${id}`, { data: dataUrl, at: new Date().toISOString() });
      return id;
    },
    // 알림 입구(hub/financeInbox/<키>/<id>)의 새 글 → 초안 줄(확인 필요, 규칙표에 있으면 바로 분류) → 처리 표시(inboxSeen).
    // 입구 규칙 · 휴대폰 설정 전에는 입구가 비어 있어 아무 일도 하지 않는다. PC AI도 같은 순서로 처리한다(fin_hub.py, 2단계).
    async processInbox() {
      const F = window.FinCore;
      const inbox = test ? (test.__inbox || null) : await reqAbs('GET', INBOX_ROOT);
      if (!inbox) return 0;
      const seen = (await req('GET', PATHS.inboxSeen)) || {};
      let made = 0;
      for (const items of Object.values(inbox)) for (const [id, item] of Object.entries(items || {})) {
        if (seen[id]) continue;
        const draft = F.draftFromAlert({ ...item, id }, book.meta.rules);
        // 같은 결제가 두 번 오면(카드사 알림 + 지갑 앱 알림 등) 같은 금액 · 같은 분이면 하나만 — 먼저 들어온 줄을 둔다
        const dup = draft && Object.values(book.entries || {}).find(e => F.sameMoment(e, draft));
        if (draft && !dup) { F.validateEntry(draft); await this.add(draft); made++; }
        await req('PUT', `${PATHS.inboxSeen}/${id}`, { entryId: dup ? dup.id : (draft?.id || ''), skipped: !draft || !!dup, dup: !!dup, at: new Date().toISOString() });
      }
      return made;
    },
    async addRule(rule) {
      const rules = [...(book.meta.rules || []).filter(r => r.match !== rule.match), rule];
      await req('PUT', `${PATHS.meta}/rules`, rules);
      book.meta.rules = rules; emit(); return rules;
    },
    watch(ms = 60000) {   // 1단계: 1분마다 + 화면으로 돌아올 때 다시 읽기(실시간 연결은 알림 입구와 함께)
      clearInterval(timer); timer = setInterval(() => load().catch(() => {}), ms);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) load().catch(() => {}); });
    },
    close() { clearInterval(timer); }
  };
}

// 영수증 사진 줄이기: 긴 변 1280px, JPEG 품질을 낮춰 가며 300KB 이하로
export async function shrinkPhoto(file, maxBytes = 300000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(Error('사진을 읽지 못했습니다.')); i.src = url; });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.65, 0.5, 0.4]) { const d = c.toDataURL('image/jpeg', q); if (d.length * 0.75 <= maxBytes) return d; }
    throw Error('사진을 300KB 아래로 줄이지 못했습니다.');
  } finally { URL.revokeObjectURL(url); }
}
