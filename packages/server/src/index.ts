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
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#071018;color:#d8eef6}body{margin:0}.shell{display:grid;grid-template-columns:220px 1fr;min-height:100vh}nav{padding:24px;background:#0b1822;border-right:1px solid #173546;position:sticky;top:0;height:100vh;box-sizing:border-box}nav h1{font-size:18px;color:#5dd7ff}nav a{display:block;color:#9ab8c4;text-decoration:none;padding:6px 0}.main{padding:28px;max-width:1100px}.brand{color:#5dd7ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card{background:#0d1e29;border:1px solid #1b4255;border-radius:14px;padding:18px;box-shadow:0 12px 40px #0005}.value{font-size:28px;font-weight:700}.bar{height:10px;background:#16313e;border-radius:8px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#27d9a1,#5dd7ff)}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #173546}.muted{color:#809aa6}footer{margin-top:28px;color:#5dd7ff}@media(max-width:700px){.shell{display:block}nav{height:auto;position:static}.main{padding:18px}}
</style></head><body><div class="shell"><nav><h1>Codinfy Agent Monitor</h1><div>/codinfy</div><div class="muted">codinfy-agent-monitor</div><hr>${PAGES.map((page) => `<a href="/${page}">/${page}</a>`).join('')}</nav><main class="main"><h2>Real-time mission dashboard</h2><p id="mode" class="muted">Connecting…</p><section id="metrics" class="grid"></section><h2>AI Credit Saver</h2><section id="advice" class="card"></section><h2>Agents</h2><section class="card"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Task</th></tr></thead><tbody id="agents"></tbody></table></section><h2>Timeline</h2><section id="timeline" class="card"></section><footer>© CODINFY PLATFORMS SASU · codinfy.com<br>Created by CODINFY PLATFORMS SASU · Founder & CEO: Bakala Goin<br>Facebook/Instagram: @codinfyci · @bakalagoin · LinkedIn: company/codinfyen · bakala-goin · TikTok/X: @bakalagoin</footer></main></div><script>
const safe=(value)=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function draw(s){document.getElementById('mode').textContent=s.estimateMode?'Mode estimation enabled':'Official metrics';document.getElementById('metrics').innerHTML=Object.values(s.metrics).map(m=>'<article class="card"><div class="muted">'+safe(m.name)+'</div><div class="value">'+safe(Math.round(m.value))+'%</div><div class="bar"><div class="fill" style="width:'+Number(m.value)+'%"></div></div><small>'+safe(m.source)+'</small></article>').join('');document.getElementById('advice').innerHTML='<div class="value">'+safe(s.advice.recommendedCategory)+'</div><p>Model Need Score: '+safe(s.advice.score)+'/100 · Estimated saving: '+safe(s.advice.estimatedCostSavingPercent)+'% · Confirmation required</p>';document.getElementById('agents').innerHTML=s.agents.map(a=>'<tr><td>'+safe(a.name)+'</td><td>'+safe(a.role)+'</td><td>'+safe(a.status)+'</td><td>'+safe(a.task)+'</td></tr>').join('')||'<tr><td colspan="4">No agents registered.</td></tr>';document.getElementById('timeline').innerHTML=s.timeline.map(e=>'<p><small>'+safe(e.createdAt)+'</small><br><b>'+safe(e.type)+'</b> '+safe(e.message)+'</p>').join('')||'No activity recorded.'}
fetch('/api/status').then(r=>r.json()).then(draw);const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');ws.onmessage=e=>draw(JSON.parse(e.data));
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
