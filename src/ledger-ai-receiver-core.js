// Only the current authenticated phone may nominate itself. No token is stored.
export async function bindCurrentPhone(api){
  const started=api.session();
  if(!started?.uid||!Number.isSafeInteger(started.generation))throw Error('LOGIN_REQUIRED');
  const {uid,generation}=started;
  const check=()=>{const now=api.session();if(!now||now.uid!==uid||now.generation!==generation)throw Error('SESSION_CHANGED');};
  const roles=await Promise.all(['owner','partner'].map(async role=>({role,...await api.readRole(role)})));check();
  if(roles.some(x=>![200,401,403].includes(x.status)))throw Error('SERVER_UNAVAILABLE');
  const allowed=roles.filter(x=>x.status===200);
  if(allowed.length!==1||roles.filter(x=>x.status===401||x.status===403).length!==1)throw Error('ROLE_UNAVAILABLE');
  const selected=allowed[0];if(!selected.etag)throw Error('NO_CONDITIONAL_WRITE');
  const proof=await api.currentPhoneProof();check();
  if(proof?.uid!==uid||!/^d_[a-f0-9]{32}$/.test(String(proof?.id||''))||!/^[a-f0-9]{64}$/.test(String(proof?.tokenFingerprint||'')))throw Error('DEVICE_UNAVAILABLE');
  const registration=await api.readOwnDevice(uid,proof.id);check();
  if(registration?.status!==200||typeof registration.body?.token!=='string'||registration.body.token.length<20)throw Error('DEVICE_MISMATCH');
  const tokenFingerprint=await api.digest(registration.body.token);check();
  if(!/^[a-f0-9]{64}$/.test(String(tokenFingerprint||'')))throw Error('DIGEST_FAILED');
  if(tokenFingerprint!==proof.tokenFingerprint)throw Error('DEVICE_MISMATCH');
  const value={uid,deviceId:proof.id,tokenFingerprint};
  let written;try{written=await api.compareAndSet(selected.role,value,selected.etag)}catch(_){throw Error('WRITE_UNKNOWN_NO_RETRY')}
  check();if(written.status===412)throw Error('CONFLICT');if(written.status!==200)throw Error('WRITE_DENIED');
  const confirmed=await api.readRole(selected.role);check();
  if(confirmed.status!==200||confirmed.body?.uid!==uid||confirmed.body?.deviceId!==proof.id||confirmed.body?.tokenFingerprint!==tokenFingerprint)throw Error('VERIFY_FAILED');
  return 'BOUND';
}
