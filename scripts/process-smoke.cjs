const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const pg = require('pg');
const root = require('node:path').resolve(__dirname, '..');
const pause = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let api, worker, incidentId;
  const received = [];
  const db = new pg.Client({host:process.env.DB_HOST ?? 'localhost',port:Number(process.env.DB_PORT ?? 5432),user:process.env.DB_USER ?? 'incidenthub',password:process.env.DB_PASSWORD ?? 'incidenthub',database:process.env.DB_NAME ?? 'incidenthub'});
  await db.connect();
  const receiver = createServer((req,res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => { received.push({body,id:req.headers['x-incidenthub-event-id']}); res.writeHead(received.length === 1 ? 503 : 200); res.end(); });
  });
  const existing = await db.query('SELECT id FROM webhook_outbox LIMIT 1');
  if(existing.rows.length) { await db.end(); throw new Error('Use an isolated test database with an empty outbox and no other worker'); }
  receiver.listen(0,'127.0.0.1'); await once(receiver,'listening');
  const env = {...process.env, PORT:'3101', INCIDENT_WEBHOOK_URL:`http://127.0.0.1:${receiver.address().port}/hook`, OUTBOX_POLL_MS:'500'};
  try {
    api = spawn(process.execPath,['apps/api/dist/main.js'],{cwd:root,env,stdio:['ignore','ignore','pipe']});
    api.stderr.on('data', c=>process.stderr.write(c));
    let healthy = false;
    for(let i=0;i<50;i++) { try { if((await fetch('http://127.0.0.1:3101/api/health')).ok) {healthy=true;break;} } catch {} await pause(100); }
    assert(healthy,'compiled API startup');
    worker = spawn(process.execPath,['apps/api/dist/worker.js'],{cwd:root,env,stdio:['ignore','ignore','pipe']});
    worker.stderr.on('data', c=>process.stderr.write(c));
    const response = await fetch('http://127.0.0.1:3101/api/incidents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Process smoke',description:'Compiled processes',severity:'low',owner:'QA'})});
    assert.equal(response.status,201); incidentId=(await response.json()).id;
    let delivered;
    for(let i=0;i<60;i++) { const rows=await db.query("SELECT status, attempts FROM webhook_outbox WHERE (payload->>'incident'::text)->>'id'::text=$1",[incidentId]); if(rows.rows[0]?.status==='delivered') {delivered=rows.rows[0];break;} await pause(100); }
    assert(delivered,'compiled worker delivery'); assert.equal(delivered.attempts,2);
    assert.equal(received.length,2); assert.deepEqual(received[0],received[1]);
    console.log('PASS compiled API + standalone worker process smoke: HTTP 503 -> retry -> HTTP 200, stable ID and body, delivered after 2 attempts');
  } finally {
    for(const child of [worker,api]) if(child && child.exitCode === null && child.signalCode === null) { const exit=once(child,'exit'); child.kill('SIGTERM'); await exit; }
    if(incidentId) {await db.query("DELETE FROM webhook_outbox WHERE (payload->>'incident'::text)->>'id'::text=$1",[incidentId]);await db.query('DELETE FROM incidents WHERE id=$1',[incidentId]);}
    await db.end(); await new Promise(r=>receiver.close(r));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
