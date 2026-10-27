// Date boundaries, duplicated reports and missing evidence must not inflate the public table.
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 let source=fs.readFileSync('src/project-progress.js','utf8').replace(/const \{PROJECT_FEED:data\}=await import\([^\n]+\);/, 'const data=null;');
 global.document={addEventListener(){}};
 const {learningCounts,renderLearning,koreaDate}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const event=(date,kind,taskId,eventId=taskId)=>({date,kind,taskId,eventId});
 const records=[event('2026-10-21','completed','outside'),event('2026-10-22','completed','first'),event('2026-10-28','completed','last'),event('2026-10-28','completed','last'),event('2026-10-29','completed','future'),event('2026-10-28','rework','last'),event('2026-10-28','rework','last','other-report'),event('2026-10-28','correction','last','correction-1'),event('2026-10-28','correction','last','correction-2')];
 assert.deepEqual(learningCounts(records,'2026-10-28'),[2,1,2]);
 assert.deepEqual(learningCounts([],'2026-10-28'),[null,null,null]);
 assert.deepEqual(learningCounts(records,'2026-11-05'),[null,null,null]);
 assert.equal(koreaDate(new Date('2026-10-27T15:00:00Z')),'2026-10-28');
 const html=renderLearning({checkedAt:'2026-10-28T08:00:00+09:00',basis:'확인된 기록',roles:[{id:'video',name:'영상분석',records:[]}]},'2026-10-28');
 assert.equal((html.match(/<td>-<\/td>/g)||[]).length,3);
 assert(html.includes('10-22 ~ 10-28'));
 assert(renderLearning({checkedAt:'2026-10-20T08:00:00+09:00',basis:'이전 기록',roles:[]},'2026-10-28').includes('최근 기록 재확인 필요'));
 console.log('PASS learning window/KST boundary; unique work and correction events; missing evidence; stale warning');
})().catch(e=>{console.error(e);process.exit(1)});
