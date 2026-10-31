export const DEPARTMENTS=[
 {id:'overview',label:'운영 홈',owner:'운영실',english:'STUDIO OVERVIEW',number:'00',icon:'home',color:'green',description:'오늘의 흐름과 할 일',related:['finance','products','stock']},
 {id:'finance',label:'재무',owner:'재무팀',english:'FINANCE DESK',number:'01',icon:'chart',color:'green',description:'매출·비용·증빙 점검',related:['sales','purchases','bank']},
 // 자금은 재무 안의 '계좌별' 탭(검수 기준 5 · 총괄 #15: 재무 · 통장 하나로). bank.html 주소는 그대로 이 탭이다.
 {id:'bank',tabOf:'finance',label:'계좌별',owner:'재무팀 · 계좌별',english:'ACCOUNTS',number:'01·B',icon:'bank',color:'blue',description:'같은 장부에서 계좌마다 잔액 — 재무 안의 탭',related:['sales','finance','settings']},
 {id:'products',label:'상품',owner:'상품팀',english:'PRODUCT STUDIO',number:'03',icon:'product',color:'orange',description:'상품 정보와 판매 준비',related:['purchases','stock','sales']},
 {id:'branding',label:'브랜딩',owner:'브랜드팀',english:'BRAND TOOLS',number:'03·B',icon:'stamp',color:'pink',description:'도장·잉크·포장 도구와 재주문 정보',related:['products','purchases','sourcing']},
 {id:'characters',label:'캐릭터',owner:'브랜드팀',english:'CHARACTER BOARD',number:'03·C',icon:'face',color:'orange',description:'캐릭터 프로필·그림 만들기와 확정',related:['branding','products']},
 {id:'purchases',label:'구매·원가',owner:'구매팀',english:'BUYING & COST',number:'04',icon:'bag',color:'purple',description:'발주에서 원가 확정까지',related:['sourcing','products','stock','finance']},
 {id:'sourcing',label:'소싱',owner:'소싱팀',english:'SOURCING BOARD',number:'04·S',icon:'spark',color:'orange',description:'1688 후보 고르기와 발주 장바구니',related:['purchases','products','stock']},
 {id:'sales',label:'판매·정산',owner:'판매팀',english:'SALES & SETTLEMENT',number:'05',icon:'receipt',color:'pink',description:'주문·수금·출고 연결',related:['bank','stock','finance']},
 {id:'stock',label:'물류·재고',owner:'물류팀',english:'STOCK ROOM',number:'06',icon:'box',color:'green',description:'실사·입고·출고 관리',related:['products','purchases','sales']},
 {id:'partners',label:'거래처',owner:'협력관리',english:'OUR PARTNERS',number:'07',icon:'people',color:'blue',description:'함께 일하는 파트너',related:['purchases','sales']},
 {id:'audit',admin:true,label:'변경 이력',owner:'운영관리',english:'ACTIVITY LOG',number:'08',icon:'clock',color:'green',description:'기록의 발자취',related:['settings','overview']},
 {id:'agents',admin:true,label:'AI 조직도',owner:'총괄',english:'AI ORGANIZATION',number:'10',icon:'people',color:'green',description:'AI 담당과 연결 상태',related:['sourcing','overview']},
 {id:'settings',admin:true,label:'설정·백업',owner:'운영관리',english:'WORKSPACE SETTINGS',number:'09',icon:'settings',color:'green',description:'계좌·창고·자료 보관',related:['bank','stock','audit']}
];
// 메뉴: 매일 보는 다섯 개만 위에, 나머지는 '더보기'(검수 기준 5). 통장은 재무의 탭이라 메뉴에 따로 두지 않는다.
export const DAILY=['overview','finance','sales','stock','sourcing'];
// The approved product view is the protected v4 screen; old bookmarks continue to work.
export function hrefFor(id){return id==='products'?'products-preview.html':`${id==='overview'?'index':id}.html`;}
export function menuGroups(){
  const daily=DAILY.map(id=>DEPARTMENTS.find(d=>d.id===id));
  const more=DEPARTMENTS.filter(d=>!DAILY.includes(d.id)&&!d.tabOf);
  return {daily,more};
}
const paths={face:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0',stamp:'M9 3h6v5l2 4v3H7v-3l2-4V3ZM5 18h14v3H5z',home:'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',chart:'M4 4v16h17M8 15v-4m5 4V7m5 8v-6',bank:'m4 7 8-4 8 4M3 9h18M5 11v7m7-7v7m7-7v7M3 21h18',product:'m12 3 9 9-9 9-9-9Z M12 7v10M7 12h10',bag:'M5 7h14l2 14H3L5 7ZM8 8V6a4 4 0 0 1 8 0v2',receipt:'M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM8 8h8M8 12h8M8 16h4',box:'m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 5',people:'M16 21v-2a5 5 0 0 0-10 0v2M11 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM18 5a4 4 0 0 1 0 7m1 3a4 4 0 0 1 3 4v2',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',link:'m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',arrow:'M5 12h14m-6-6 6 6-6 6',spark:'m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z'};
export function icon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.spark}"/></svg>`;}
export function departmentCards(){return `<div class="department-grid">${['finance','sales','stock','sourcing','products','purchases'].map(id=>DEPARTMENTS.find(d=>d.id===id)).map(d=>`<a class="department-card tone-${d.color}" href="${hrefFor(d.id)}"><div class="dept-top"><span class="dept-icon">${icon(d.icon)}</span><span class="dept-number">${d.number} /</span><span class="dept-arrow">↗</span></div><h3>${d.owner}</h3><p>${d.description}</p></a>`).join('')}</div>`;}
export function workflowStrip(){return `<div class="workflow-strip"><span>하나로 이어지는 업무</span><div>${[['products','상품'],['purchases','구매'],['stock','입고·재고'],['sales','판매'],['bank','수금'],['finance','재무']].map(([id,label],i)=>`${i?'<span class="flow-arrow">→</span>':''}<a href="${hrefFor(id)}">${label}</a>`).join('')}</div><small>상품번호와 거래번호로 연결</small></div>`;}
