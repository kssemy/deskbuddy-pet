const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./main.js'),'utf8');
const code=source.slice(source.indexOf('let sessionRecovery;'),source.indexOf('const scheduleFields'));
function setup(pin='123456') {
 let requests=0,saved=0;
 const session={id:'self',name:'Tester',token:'expired',...(pin?{pin}:{})};
 const context=vm.createContext({remoteSession:session,REMOTE_URL:'https://example.test',REMOTE_KEY:'public',AbortSignal,Error,remoteChecked:true,remoteError:'',saveRemoteSession(){saved++},broadcast(){},fetch:async(url,options)=>{
  requests++;
  if(url.endsWith('/rpc/pet_login')) {assert.equal(JSON.parse(options.body).p_pin,'123456');return new Response(JSON.stringify({member_id:'self',session_token:'renewed'}));}
  return options.headers['x-pet-session']==='renewed'?new Response('[]'):new Response('',{status:401});
 }});
 vm.runInContext(code,context);
 return {context,session,counts:()=>({requests,saved})};
}
test('expired session logs in once and retries original request',async()=>{
 const {context,session,counts}=setup();await context.remoteApi('/pet_presence');
 assert.equal(session.token,'renewed');assert.deepEqual(counts(),{requests:3,saved:1});
});
test('legacy session without saved PIN exposes sign-in instead of looping',async()=>{
 const {context,counts}=setup(null);await assert.rejects(context.remoteApi('/pet_presence'),/PIN/);
 assert.equal(context.remoteSession,null);assert.equal(counts().requests,1);
});
test('network failure preserves encrypted login for later retry',async()=>{
 const {context,session}=setup();const original=context.fetch;
 context.fetch=async(url,options)=>url.endsWith('/rpc/pet_login')?Promise.reject(Error('offline')):original(url,options);
 await assert.rejects(context.remoteApi('/pet_presence'),/offline/);assert.equal(context.remoteSession,session);
});
