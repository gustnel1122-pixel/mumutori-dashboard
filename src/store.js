// All departments share this persistence boundary; replace it for a future database adapter.
export function createStore(C,storage=localStorage){
  let savedRaw=null,data;
  return {
    async load(){
      savedRaw=storage.getItem(C.STORAGE_KEY);let raw=savedRaw,warning='';
      if(!raw)for(const key of ['mumutori-dashboard-v1','mumutori-dashboard-preview-v2']){const value=storage.getItem(key);if(value){raw=value;break;}}
      let input;
      if(raw)input=JSON.parse(raw);
      else{const response=await fetch(new URL('../data/seed.json.gz',import.meta.url));if(!response.ok)throw Error('초기 자료를 불러오지 못했습니다.');input=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();}
      data=C.migrate(input);
      if(raw&&!data.erp.migratedAt){try{if(!storage.getItem('mumutori-before-erp'))storage.setItem('mumutori-before-erp',raw);}catch(e){warning='이전 상태의 자동 복사 공간이 부족합니다. 전체 백업을 내려받아 보관하세요.';}}
      return {data,raw:savedRaw,warning};
    },
    save(next){
      if(storage.getItem(C.STORAGE_KEY)!==savedRaw)throw Error('다른 창에서 자료가 변경되었습니다. 입력 내용을 복사한 뒤 새로고침하고 다시 저장하세요.');
      next.erp.revision=(data.erp.revision||0)+1;next.erp.updatedAt=new Date().toISOString();next.erp.migratedAt=next.erp.migratedAt||next.erp.updatedAt;
      const text=JSON.stringify(next);
      try{storage.setItem(C.STORAGE_KEY,text);}catch(e){throw Error('저장하지 못했습니다. 저장 공간 또는 브라우저 설정을 확인하세요. 입력창을 유지했습니다.');}
      savedRaw=text;data=next;return {data,raw:savedRaw};
    },
    accept(raw){const next=C.migrate(JSON.parse(raw));data=next;savedRaw=raw;return {data,raw};}
  };
}
