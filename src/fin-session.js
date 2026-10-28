// A successful server read, not login alone, opens shared financial screens.
export function createFinSession({open,onBook,onState,processInbox=false}){
 let identity,epoch=0,store=null,allowed=false;
 const notify=s=>onState?.(s,allowed);
 const deny=s=>{allowed=false;onBook?.(null);notify(s);};
 return {
  get allowed(){return allowed;},
  setUser(user,test=false){
   const next=user?.uid||(test?'synthetic-session':null);
   if(next===identity)return store;
   identity=next;const mine=++epoch;store?.close();store=null;allowed=false;onBook?.(null);notify(next?'loading':'signed-out');
   if(!next)return null;
   const local=open({onChange:book=>{if(mine!==epoch)return;allowed=true;onBook?.(book);notify('ok');},onStatus:s=>{if(mine!==epoch)return;if(s==='denied')deny(s);else notify(s);}});
   store=local;
   local.load().then(()=>{if(mine===epoch&&processInbox)return local.processInbox?.();}).catch(()=>{if(mine===epoch&&!allowed)deny('denied');});
   local.watch();return local;
  }
 };
}
