// Graph and cards share one AI-maintained public JSON feed.
const {PROJECT_FEED,resolveProjectId}=await import(`./project-feed.js?v=${document.body.dataset.build||'project-groups-20261027'}`);
export {resolveProjectId};
export const OPENING_DATE=PROJECT_FEED?.openingDate||'2026-11-10';
export const OPENING_LABEL='11/10(화)';
export const PROJECT_UPDATED_AT=PROJECT_FEED?.checkedAt||'2026-10-27';
export const PROJECT_CHECK_NOTE='큰 프로젝트 11개 · '+PROJECT_UPDATED_AT.slice(5).replace('-','/')+' 점검';
export const PALSIBO_SHOPPING={href:'https://gustnel1122-pixel.github.io/mumutori-offline-pages/#preparation',counts:{total:52}};
const links={
offline:[['공동 매장 작업판','https://gustnel1122-pixel.github.io/mumutori-offline-pages/']],
letter:[['레터 운영 허브','letter-hub.html'],['인쇄 편지 작성','https://letter.mumutori.com/print.html'],['대필 편지 작성','https://letter.mumutori.com/ghost.html']],
mall:[['자사몰','https://mumutori.com']],smartstore:[['스마트스토어','https://smartstore.naver.com/mumutori_market']],
coupang:[['판매·정산','sales.html'],['물류·재고','stock.html']],
product:[['소싱 보드','sourcing.html'],['상품','products.html'],['재고','stock.html']],
marketing:[['카카오 채널','https://pf.kakao.com/_lqpZX'],['자사몰','https://mumutori.com']],
finance:[['공용 재무 장부','finance.html'],['빠른 장부','quick.html']],
brand:[['캐릭터 보드','characters.html'],['브랜딩 도구','branding.html']],
support:[['전체 프로젝트 그래프','index.html#progress']],ops:[['운영 홈','index.html#progress'],['AI 조직도','agents.html']]
};
export const PROJECTS=(PROJECT_FEED?.projects||[]).map(p=>({id:p.id,title:p.name,kicker:'큰 프로젝트',includes:p.includes,includesLabel:p.includesLabel,status:[p.status,p.blocked?'확인 · '+p.blocked:'기록된 막힘 없음'],next:p.next,href:'project-hub.html?project='+p.id,links:links[p.id].map(([label,href])=>({label,href}))}));
