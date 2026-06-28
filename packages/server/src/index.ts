import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { AgentMonitor, CODINFY_ATTRIBUTION, redactSecrets } from '@codinfy/agent-monitor-core';

const PAGES = [
  'dashboard',
  'agents',
  'workflow',
  'tasks',
  'context',
  'limits',
  'models',
  'budget',
  'timeline',
  'files',
  'git',
  'tests',
  'build',
  'environment',
  'health',
  'security',
  'performance',
  'reports',
  'settings',
  'about',
];

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Codinfy Agent Monitor</title><style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#071018;color:#d8eef6}body{margin:0}.shell{display:grid;grid-template-columns:220px 1fr;min-height:100vh}nav{padding:24px;background:#0b1822;border-right:1px solid #173546;position:sticky;top:0;height:100vh;box-sizing:border-box}nav h1{font-size:18px;color:#5dd7ff}nav a{display:block;color:#9ab8c4;text-decoration:none;padding:6px 0}nav a.active{color:#5dd7ff;font-weight:600}.main{padding:28px;max-width:1100px}.brand{color:#5dd7ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card{background:#0d1e29;border:1px solid #1b4255;border-radius:14px;padding:18px;box-shadow:0 12px 40px #0005}.value{font-size:28px;font-weight:700}.bar{height:10px;background:#16313e;border-radius:8px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#27d9a1,#5dd7ff)}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #173546}.muted{color:#809aa6}.page-block{margin-bottom:10px}footer{margin-top:28px;color:#5dd7ff}@media(max-width:700px){.shell{display:block}nav{height:auto;position:static}.main{padding:18px}}
</style></head><body><div class="shell"><nav><h1>Codinfy Agent Monitor</h1><div>/codinfy</div><div class="muted">codinfy-agent-monitor</div><hr>${PAGES.map((page) => `<a href="/${page}">/${page}</a>`).join('')}</nav><main class="main"><h2 id="pageTitle" class="brand">/dashboard</h2><p id="mode" class="muted">Connecting…</p><div class="page-block" data-pages="context limits models budget"><h3>Usage</h3><section id="metrics" class="grid"></section></div><div class="page-block" data-pages="models budget saver"><h3>AI Credit Saver</h3><section id="advice" class="card"></section></div><div class="page-block" data-pages="agents"><h3>Agents</h3><section class="card"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Task</th></tr></thead><tbody id="agents"></tbody></table></section></div><div class="page-block" data-pages="tasks workflow"><h3>Tasks &amp; workflow</h3><section class="card"><p id="workflow" class="muted"></p><table><thead><tr><th>Task</th><th>Status</th><th>Progress</th></tr></thead><tbody id="tasks"></tbody></table></section></div><div class="page-block" data-pages="git files"><h3>Git status</h3><section id="git" class="card"></section></div><div class="page-block" data-pages="health tests build security performance"><h3>Pre-commit health</h3><section id="health" class="grid"></section></div><div class="page-block" data-pages="environment"><h3>Environment</h3><section id="environment" class="card"></section></div><div class="page-block" data-pages="timeline reports"><h3>Timeline</h3><section id="timeline" class="card"></section></div><div class="page-block" data-pages="about settings reports"><h3>About</h3><section class="card"><p><b>Codinfy Agent Monitor</b> · Command: /codinfy · MCP: codinfy-agent-monitor</p><p>Created by CODINFY PLATFORMS SASU · Founder &amp; CEO: Bakala Goin · codinfy.com</p><p class="muted">Export a local report with: codinfy-agent-monitor export</p></section></div><footer>© CODINFY PLATFORMS SASU · codinfy.com<br>Created by CODINFY PLATFORMS SASU · Founder & CEO: Bakala Goin<br>Facebook/Instagram: @codinfyci · @bakalagoin · LinkedIn: company/codinfyen · bakala-goin · TikTok/X: @bakalagoin</footer></main></div><script>
const safe=(value)=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function draw(s){document.getElementById('mode').textContent=s.estimateMode?'Mode estimation enabled':'Official metrics';document.getElementById('metrics').innerHTML=Object.values(s.metrics).map(m=>'<article class="card"><div class="muted">'+safe(m.name)+'</div><div class="value">'+safe(Math.round(m.value))+'%</div><div class="bar"><div class="fill" style="width:'+Number(m.value)+'%"></div></div><small>'+safe(m.source)+'</small></article>').join('');document.getElementById('advice').innerHTML='<div class="value">'+safe(s.advice.recommendedCategory)+'</div><p>Model Need Score: '+safe(s.advice.score)+'/100 · Estimated saving: '+safe(s.advice.estimatedCostSavingPercent)+'% · Confirmation required</p>';document.getElementById('agents').innerHTML=s.agents.map(a=>'<tr><td>'+safe(a.name)+'</td><td>'+safe(a.role)+'</td><td>'+safe(a.status)+'</td><td>'+safe(a.task)+'</td></tr>').join('')||'<tr><td colspan="4">No agents registered.</td></tr>';document.getElementById('workflow').textContent='Workflow progress: '+safe(s.workflowProgress)+'%';document.getElementById('tasks').innerHTML=s.tasks.map(t=>'<tr><td>'+safe(t.title)+'</td><td>'+safe(t.status)+'</td><td>'+safe(t.progress)+'%</td></tr>').join('')||'<tr><td colspan="3">No tasks.</td></tr>';document.getElementById('timeline').innerHTML=s.timeline.map(e=>'<p><small>'+safe(e.createdAt)+'</small><br><b>'+safe(e.type)+'</b> '+safe(e.message)+'</p>').join('')||'No activity recorded.';if(s.git){document.getElementById('git').innerHTML='<p>Branch: <b>'+safe(s.git.branch)+'</b> · Changed files: '+safe(s.git.files.length)+'</p><p class="muted">'+safe(s.git.remote)+'</p><p class="muted">'+safe(s.git.lastCommit)+'</p>'}}
const light=v=>v==='passed'||v==='green'||v===true?'🟢':v==='not_run'||v==='yellow'?'🟡':'🔴';
function routePage(){const path=(location.pathname.replace(/^\\//,'')||'dashboard');document.getElementById('pageTitle').textContent='/'+path;const all=path==='dashboard';document.querySelectorAll('.page-block').forEach(b=>{const pages=(b.getAttribute('data-pages')||'').split(' ');b.style.display=all||pages.includes(path)?'':'none'});document.querySelectorAll('nav a').forEach(a=>{a.classList.toggle('active',a.getAttribute('href')==='/'+path)})}
routePage();
fetch('/api/status').then(r=>r.json()).then(draw);
fetch('/api/review').then(r=>r.json()).then(rv=>{document.getElementById('health').innerHTML=[['Public ready',rv.ready],['Tests',rv.tests],['Build',rv.build],['Secrets',rv.secretFindings.length?'red':'green']].map(x=>'<article class="card"><div class="muted">'+safe(x[0])+'</div><div class="value">'+light(x[1])+'</div><small>'+safe(x[1])+'</small></article>').join('')}).catch(()=>{});
fetch('/api/environment').then(r=>r.json()).then(env=>{document.getElementById('environment').innerHTML='<p>Type: <b>'+safe(env.type)+'</b> · OS: '+safe(env.os)+'</p><p class="muted">Stacks: '+safe((env.detectedStacks||[]).join(', '))+'</p>'}).catch(()=>{});
const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');ws.onmessage=e=>draw(JSON.parse(e.data));
</script></body></html>`;
}

export async function createLocalServer(monitor = new AgentMonitor()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  app.get('/healthz', async () => ({
    ok: true,
    name: CODINFY_ATTRIBUTION.mcpName,
    signature: CODINFY_ATTRIBUTION.signature,
  }));
  app.get('/api/status', async () => JSON.parse(redactSecrets(JSON.stringify(monitor.snapshot()))));
  app.get('/api/environment', async () => monitor.environment());
  app.get('/api/git', async () => monitor.snapshot().git);
  app.get('/api/agents', async () => monitor.store.listAgents());
  app.get('/api/timeline', async () => monitor.store.timeline(50));
  app.get('/api/review', async () => JSON.parse(redactSecrets(JSON.stringify(monitor.review()))));
  app.get('/ws', { websocket: true }, (socket) => {
    const send = () => {
      if (socket.readyState === socket.OPEN)
        socket.send(redactSecrets(JSON.stringify(monitor.snapshot())));
    };
    send();
    const timer = setInterval(send, 1_000);
    socket.on('close', () => clearInterval(timer));
  });
  for (const page of ['/', ...PAGES.map((page) => `/${page}`)])
    app.get(page, async (_request, reply) =>
      reply.type('text/html; charset=utf-8').send(dashboardHtml()),
    );
  return app;
}

export async function startLocalServer(
  options: { monitor?: AgentMonitor; host?: string; port?: number } = {},
): Promise<FastifyInstance> {
  const app = await createLocalServer(options.monitor);
  await app.listen({ host: options.host ?? '127.0.0.1', port: options.port ?? 3579 });
  return app;
}
