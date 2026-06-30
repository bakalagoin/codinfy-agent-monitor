import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import {
  AgentMonitor,
  CODINFY_ATTRIBUTION,
  getDependencyHealth,
  redactSecrets,
} from '@codinfy/agent-monitor-core';

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
] as const;

const NAVIGATION = [
  { page: 'dashboard', label: 'Mission control', icon: 'MC' },
  { page: 'agents', label: 'Agents radar', icon: 'AR' },
  { page: 'workflow', label: 'Workflow', icon: 'WF' },
  { page: 'tasks', label: 'Tasks', icon: 'TK' },
  { page: 'context', label: 'Context', icon: 'CX' },
  { page: 'limits', label: 'Usage limits', icon: 'UL' },
  { page: 'models', label: 'Smart Model Router', icon: 'MR' },
  { page: 'budget', label: 'AI Credit Saver', icon: 'CS' },
  { page: 'timeline', label: 'Timeline', icon: 'TL' },
  { page: 'files', label: 'Modified files', icon: 'FL' },
  { page: 'git', label: 'Git status', icon: 'GT' },
  { page: 'tests', label: 'Tests', icon: 'TS' },
  { page: 'build', label: 'Build', icon: 'BD' },
  { page: 'environment', label: 'Environment', icon: 'EN' },
  { page: 'health', label: 'Release health', icon: 'HL' },
  { page: 'security', label: 'Security', icon: 'SC' },
  { page: 'performance', label: 'Codix Observer', icon: 'OB' },
  { page: 'reports', label: 'Reports', icon: 'RP' },
  { page: 'settings', label: 'Settings', icon: 'ST' },
  { page: 'about', label: 'About Codinfy', icon: 'CO' },
] as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function normalizeHostname(value: string): string {
  const host = value.trim().toLowerCase();
  if (host.startsWith('[')) return host.slice(1, host.indexOf(']'));
  return host.split(':')[0]?.replace(/\.$/, '') ?? '';
}

function isLoopbackHost(value: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHostname(value));
}

function isAllowedWebSocketOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const requestHost = request.headers.host?.toLowerCase();
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      isLoopbackHost(parsed.hostname) &&
      Boolean(requestHost) &&
      parsed.host.toLowerCase() === requestHost
    );
  } catch {
    return false;
  }
}

function isAllowedMutationOrigin(request: FastifyRequest): boolean {
  return Boolean(request.headers.origin) && isAllowedWebSocketOrigin(request);
}

function listReports(monitor: AgentMonitor) {
  const directory = join(monitor.store.dataRoot, 'reports');
  if (!existsSync(directory) || lstatSync(directory).isSymbolicLink()) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => {
      const path = join(directory, entry.name);
      const stats = lstatSync(path);
      return { name: entry.name, size: stats.size, updatedAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
}

function dashboardHtml(): string {
  const navigation = NAVIGATION.map(
    ({ page, label, icon }) =>
      `<a class="nav-link" href="/${page}" data-route="${page}"><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${label}</span></a>`,
  ).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#050a13"><title>Codinfy Agent Monitor</title><style>
:root{color-scheme:dark;--bg:#050a13;--surface:rgba(10,22,37,.72);--surface-strong:rgba(12,27,45,.92);--line:rgba(118,174,218,.18);--line-hot:rgba(76,201,255,.54);--text:#eef8ff;--muted:#8198aa;--cyan:#42d5ff;--blue:#6388ff;--violet:#a678ff;--green:#38e6a1;--amber:#ffc96b;--red:#ff647c;--radius:18px;--shadow:0 24px 80px rgba(0,0,0,.42);font-family:Inter,"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--text)}
*{box-sizing:border-box}html{min-width:320px;background:var(--bg)}body{margin:0;min-height:100vh;background:radial-gradient(circle at 76% -10%,rgba(46,122,255,.16),transparent 32%),radial-gradient(circle at 15% 86%,rgba(126,64,255,.12),transparent 29%),#050a13;overflow-x:hidden}body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(82,145,190,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(82,145,190,.035) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,black,transparent 82%)}
.orb{position:fixed;border-radius:999px;filter:blur(80px);pointer-events:none;opacity:.17;animation:drift 14s ease-in-out infinite alternate}.orb.one{width:260px;height:260px;background:#007cff;top:8%;left:17%}.orb.two{width:320px;height:320px;background:#7f4dff;right:-80px;bottom:-100px;animation-delay:-5s}@keyframes drift{to{transform:translate3d(45px,-25px,0) scale(1.12)}}
.shell{display:grid;grid-template-columns:242px minmax(0,1fr);min-height:100vh;position:relative;z-index:1}.sidebar{position:sticky;top:0;height:100vh;padding:24px 16px 18px;background:linear-gradient(180deg,rgba(7,17,31,.94),rgba(5,12,23,.82));border-right:1px solid var(--line);backdrop-filter:blur(24px);display:flex;flex-direction:column;overflow:hidden}.brand-lockup{display:flex;align-items:center;gap:12px;padding:0 8px 24px}.brand-mark{width:48px;height:48px;flex:0 0 auto;border-radius:15px;box-shadow:0 0 30px rgba(66,213,255,.18)}.brand-name{font-size:17px;font-weight:760;letter-spacing:-.02em}.brand-sub{font:11px/1.4 "Cascadia Code",Consolas,monospace;color:var(--cyan);letter-spacing:.03em}.nav-caption{padding:0 12px 9px;font:600 10px/1 "Cascadia Code",Consolas,monospace;color:#536e82;letter-spacing:.16em;text-transform:uppercase}.nav-list{display:grid;gap:4px}.nav-link{display:flex;align-items:center;gap:11px;min-height:43px;padding:0 12px;border:1px solid transparent;border-radius:12px;color:#8da3b4;text-decoration:none;font-size:13px;transition:.22s ease}.nav-link:hover{color:#dff8ff;background:rgba(70,155,215,.07);border-color:rgba(100,187,240,.13)}.nav-link.active{color:#eafaff;background:linear-gradient(90deg,rgba(39,157,235,.2),rgba(70,107,255,.08));border-color:rgba(70,190,255,.45);box-shadow:inset 3px 0 var(--cyan),0 0 24px rgba(30,154,232,.1)}.nav-icon{width:23px;text-align:center;font-size:17px;color:currentColor}.nav-label{white-space:nowrap}.sidebar-spacer{flex:1}.workspace-card,.system-card{border:1px solid var(--line);background:rgba(10,25,42,.56);border-radius:14px;padding:14px;margin-top:10px}.workspace-command{font:700 14px/1.4 "Cascadia Code",Consolas,monospace}.workspace-mcp{font:10px/1.5 "Cascadia Code",Consolas,monospace;color:#688397}.system-line{display:flex;align-items:center;gap:8px;color:#b8cbd8;font-size:11px}.live-dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 5px rgba(56,230,161,.08),0 0 15px rgba(56,230,161,.55);animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{50%{opacity:.48;transform:scale(.82)}}
.main{min-width:0;padding:0 22px 34px}.topbar{height:72px;position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(5,10,19,.94),rgba(5,10,19,.72));backdrop-filter:blur(20px)}.route-crumb{display:flex;align-items:center;gap:10px;font:12px "Cascadia Code",Consolas,monospace;color:#7890a3}.terminal-glyph{display:grid;place-items:center;width:30px;height:30px;border:1px solid var(--line);border-radius:8px;color:var(--cyan);background:rgba(23,48,72,.55)}.top-actions{display:flex;align-items:center;gap:10px}.top-chip{display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:rgba(10,23,39,.62);font:11px "Cascadia Code",Consolas,monospace;color:#b6c9d7}.top-chip.live{color:var(--green)}.mobile-menu{display:none;border:1px solid var(--line);background:var(--surface);color:white;border-radius:9px;width:36px;height:36px}.content{max-width:1680px;margin:0 auto}.view-head{display:flex;align-items:end;justify-content:space-between;gap:18px;padding:24px 2px 18px}.view-title{margin:0;font-size:clamp(23px,2.3vw,34px);font-weight:720;letter-spacing:-.045em}.view-copy{margin:7px 0 0;color:var(--muted);font-size:13px}.identity-strip{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.identity-token{border:1px solid var(--line);background:rgba(12,27,45,.54);border-radius:9px;padding:7px 10px;color:#8fa9bb;font:10px "Cascadia Code",Consolas,monospace}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.metric{position:relative;overflow:hidden;min-height:120px;padding:17px;border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(135deg,rgba(14,31,51,.82),rgba(8,20,35,.62));box-shadow:inset 0 1px rgba(255,255,255,.025)}.metric:after{content:"";position:absolute;width:80px;height:80px;border-radius:50%;right:-30px;top:-36px;background:var(--metric-color,var(--cyan));filter:blur(35px);opacity:.17}.metric-head{display:flex;justify-content:space-between;align-items:center}.metric-name{display:flex;gap:8px;align-items:center;color:#c0d4e1;font-size:12px}.metric-symbol{color:var(--metric-color,var(--cyan));font-size:16px}.metric-value{font:700 18px "Cascadia Code",Consolas,monospace;color:var(--metric-color,var(--cyan))}.meter{height:7px;margin:22px 0 11px;border-radius:999px;background:#06111d;border:1px solid rgba(107,160,200,.15);overflow:hidden}.meter-fill{height:100%;width:0;background:linear-gradient(90deg,var(--metric-color,var(--cyan)),#e3fbff);border-radius:inherit;box-shadow:0 0 18px var(--metric-color,var(--cyan));transition:width 1s cubic-bezier(.2,.7,.2,1);position:relative}.meter-fill:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);transform:translateX(-100%);animation:sheen 2.8s ease-in-out infinite}@keyframes sheen{60%,100%{transform:translateX(160%)}}.metric-foot{display:flex;justify-content:space-between;color:#617b8e;font:10px "Cascadia Code",Consolas,monospace}.source{color:#8ab1c7}
.dashboard-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}.panel{border:1px solid var(--line);background:linear-gradient(145deg,rgba(12,29,48,.78),rgba(7,17,30,.68));border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;min-width:0}.panel.workflow-panel{grid-column:span 6}.panel.agents-panel{grid-column:span 3}.panel.timeline-panel{grid-column:span 3;grid-row:span 2}.panel.saver-panel{grid-column:span 4}.panel.health-panel{grid-column:span 5}.panel.git-panel{grid-column:span 3}.panel.environment-panel{grid-column:span 5}.panel.about-panel{grid-column:span 7}.panel-head{height:50px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.panel-title{display:flex;align-items:center;gap:9px;margin:0;font:650 11px "Cascadia Code",Consolas,monospace;letter-spacing:.09em;text-transform:uppercase;color:#c4d7e5}.panel-title b{color:var(--cyan)}.panel-meta{color:#617d91;font:9px "Cascadia Code",Consolas,monospace}.panel-body{padding:16px}
.workflow-list{display:grid;gap:8px}.workflow-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:11px;min-height:54px;padding:8px 11px;border:1px solid rgba(109,161,201,.17);border-radius:11px;background:rgba(4,13,23,.34);position:relative}.workflow-row:before{content:"";position:absolute;left:27px;top:-9px;height:9px;border-left:1px solid rgba(94,169,218,.35)}.workflow-row:first-child:before{display:none}.step-icon{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;border:1px solid rgba(89,180,237,.26);color:var(--cyan);background:rgba(29,91,130,.16)}.step-title{font-size:12px;font-weight:650}.step-sub{margin-top:3px;color:#637f93;font:9px "Cascadia Code",Consolas,monospace}.status{padding:5px 8px;border-radius:7px;font:650 8px "Cascadia Code",Consolas,monospace;text-transform:uppercase;border:1px solid}.status.completed,.status.done{color:var(--green);border-color:rgba(56,230,161,.24);background:rgba(56,230,161,.09)}.status.active,.status.in_progress,.status.running,.status.writing,.status.reading,.status.thinking{color:var(--cyan);border-color:rgba(66,213,255,.28);background:rgba(66,213,255,.09)}.status.error,.status.blocked{color:var(--red);border-color:rgba(255,100,124,.28);background:rgba(255,100,124,.09)}.status.idle,.status.pending{color:#8ca1b2;border-color:rgba(140,161,178,.2);background:rgba(140,161,178,.07)}
.radar{height:170px;position:relative;display:grid;place-items:center;margin-bottom:13px}.radar-ring{position:absolute;border:1px solid rgba(70,169,231,.17);border-radius:50%}.radar-ring:nth-child(1){width:150px;height:150px}.radar-ring:nth-child(2){width:108px;height:108px}.radar-ring:nth-child(3){width:64px;height:64px}.radar-axis{position:absolute;width:150px;border-top:1px solid rgba(70,169,231,.1)}.radar-axis.y{transform:rotate(90deg)}.radar-center{width:39px;height:39px;display:grid;place-items:center;border:1px solid var(--line-hot);border-radius:12px;background:#071420;box-shadow:0 0 28px rgba(66,213,255,.2);font-weight:800}.radar-dot{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 12px currentColor}.agent-list{display:grid}.agent-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 0;border-top:1px solid rgba(109,161,201,.1)}.agent-state{width:7px;height:7px;border-radius:50%;background:var(--green)}.agent-state.idle,.agent-state.done{background:#6f8ba0}.agent-state.error,.agent-state.blocked{background:var(--red)}.agent-name{font:10px "Cascadia Code",Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.agent-role{color:#617d91;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.timeline{position:relative;display:grid;gap:11px;padding-left:21px}.timeline:before{content:"";position:absolute;left:4px;top:4px;bottom:4px;border-left:1px solid rgba(94,166,218,.24)}.event{position:relative;padding:11px;border:1px solid rgba(103,160,202,.17);border-radius:10px;background:rgba(4,13,23,.32)}.event:before{content:"";position:absolute;left:-22px;top:15px;width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 4px #0a1929,0 0 12px rgba(66,213,255,.45)}.event-time{color:#607b8f;font:8px "Cascadia Code",Consolas,monospace}.event-type{margin:5px 0 3px;font:650 10px "Cascadia Code",Consolas,monospace;color:#b9d8e9}.event-message{font-size:10px;line-height:1.45;color:#7894a7;word-break:break-word}.empty{display:grid;place-items:center;min-height:90px;color:#5f7b90;font:10px "Cascadia Code",Consolas,monospace;text-align:center}
.saver-panel{border-color:rgba(156,112,255,.27);background:linear-gradient(145deg,rgba(36,22,68,.62),rgba(11,21,38,.76))}.saver-model{font:700 18px "Cascadia Code",Consolas,monospace;color:#c9b6ff;margin-bottom:6px}.score-line{display:flex;align-items:center;justify-content:space-between;color:#7e94a6;font-size:10px}.saving{margin:16px 0;display:flex;align-items:end;gap:8px}.saving strong{font:750 32px/1 "Cascadia Code",Consolas,monospace;color:var(--green)}.saving span{color:#7890a3;font-size:10px;padding-bottom:3px}.reason-list{margin:0;padding:0;list-style:none;display:grid;gap:7px}.reason-list li{font-size:10px;line-height:1.45;color:#91a7b7}.reason-list li:before{content:"✓";color:var(--green);margin-right:7px}.action-link{display:inline-flex;align-items:center;justify-content:center;margin-top:15px;height:34px;padding:0 13px;border:1px solid rgba(166,120,255,.38);border-radius:9px;color:#d6c5ff;background:rgba(128,77,242,.12);text-decoration:none;font-size:10px}
.health-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.health-item{min-height:82px;padding:13px;border:1px solid rgba(109,161,201,.15);border-radius:11px;background:rgba(4,13,23,.3)}.health-icon{font-size:20px;margin-bottom:8px}.health-name{font:600 9px "Cascadia Code",Consolas,monospace;color:#7891a4;text-transform:uppercase}.health-value{margin-top:4px;font-size:11px;font-weight:650}.healthy{color:var(--green)}.warning{color:var(--amber)}.danger{color:var(--red)}
.git-summary{display:grid;gap:12px}.git-branch{font:700 18px "Cascadia Code",Consolas,monospace}.git-stat{display:flex;gap:8px;flex-wrap:wrap}.mini-stat{padding:6px 8px;border:1px solid var(--line);border-radius:8px;color:#829daf;font:9px "Cascadia Code",Consolas,monospace}.code-line{padding:10px;border-radius:9px;background:#050d17;border:1px solid rgba(108,164,205,.12);color:#6e8799;font:9px/1.5 "Cascadia Code",Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.env-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.env-item{padding:11px;border-left:2px solid rgba(66,213,255,.45);background:rgba(4,13,23,.28)}.env-label{color:#607d91;font:8px "Cascadia Code",Consolas,monospace;text-transform:uppercase}.env-value{margin-top:4px;color:#bdd3df;font-size:11px;word-break:break-word}.about-copy{max-width:760px;color:#91a8b7;font-size:12px;line-height:1.7}.socials{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.social{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 10px;border:1px solid var(--line);border-radius:9px;color:#9cb4c4;text-decoration:none;font:9px "Cascadia Code",Consolas,monospace}.social:hover{border-color:var(--line-hot);color:white}.footer{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px;padding:20px 3px;color:#587386;font:9px "Cascadia Code",Consolas,monospace;border-top:1px solid var(--line)}.footer strong{color:#7794a9;font-weight:500}.page-block.is-hidden{display:none!important}
.nav-list{overflow-y:auto;min-height:0;padding-right:4px;scrollbar-width:thin;scrollbar-color:rgba(66,213,255,.28) transparent}.nav-link{min-height:36px;font-size:11px}.nav-icon{display:grid;place-items:center;width:24px;height:22px;border:1px solid rgba(118,174,218,.16);border-radius:7px;font:700 7px "Cascadia Code",Consolas,monospace}.sidebar-spacer{min-height:8px}.panel.wide-panel{grid-column:1/-1}.panel.split-panel{grid-column:span 6}.data-list{display:grid;gap:8px}.data-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:12px;border:1px solid rgba(109,161,201,.15);border-radius:11px;background:rgba(4,13,23,.3)}.data-main{min-width:0}.data-title{font:650 11px "Cascadia Code",Consolas,monospace;color:#c4dce9;overflow-wrap:anywhere}.data-copy{margin-top:5px;color:#6f899c;font-size:10px;line-height:1.5;overflow-wrap:anywhere}.data-meta{color:#7896aa;font:9px "Cascadia Code",Consolas,monospace;text-align:right}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.button{appearance:none;border:1px solid rgba(92,179,235,.3);border-radius:9px;background:rgba(31,88,126,.14);color:#b9d8e9;min-height:35px;padding:0 13px;font:650 9px "Cascadia Code",Consolas,monospace;cursor:pointer}.button:hover{border-color:var(--line-hot);color:white}.button.primary{background:linear-gradient(135deg,rgba(40,156,226,.24),rgba(103,93,255,.2));color:#e9faff}.button:disabled{opacity:.45;cursor:wait}.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field{display:grid;gap:7px;color:#7590a3;font:9px "Cascadia Code",Consolas,monospace}.field select,.field input{width:100%;min-height:40px;border:1px solid var(--line);border-radius:9px;background:#07121f;color:#d8edf7;padding:0 11px}.switch-field{display:flex;align-items:center;gap:9px;min-height:40px;padding:0 11px;border:1px solid var(--line);border-radius:9px;background:#07121f}.notice{padding:12px;border:1px solid rgba(66,213,255,.18);border-radius:10px;background:rgba(36,111,154,.08);color:#7f9bad;font-size:10px;line-height:1.55}.output{max-height:320px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:9px/1.55 "Cascadia Code",Consolas,monospace;color:#87a4b6;background:#050d17;border:1px solid rgba(108,164,205,.12);border-radius:10px;padding:13px}
@media(max-width:1250px){.metrics{grid-template-columns:repeat(2,1fr)}.panel.workflow-panel{grid-column:span 8}.panel.agents-panel{grid-column:span 4}.panel.timeline-panel{grid-column:span 4}.panel.saver-panel{grid-column:span 4}.panel.health-panel{grid-column:span 4}.panel.git-panel{grid-column:span 4}.panel.environment-panel,.panel.about-panel{grid-column:span 6}}
@media(max-width:860px){.shell{grid-template-columns:1fr}.sidebar{position:fixed;z-index:50;width:242px;transform:translateX(-105%);transition:transform .25s ease}.sidebar.open{transform:translateX(0)}.main{padding:0 14px 26px}.mobile-menu{display:grid;place-items:center}.top-chip.time{display:none}.metrics{grid-template-columns:1fr 1fr}.panel.workflow-panel,.panel.agents-panel,.panel.timeline-panel,.panel.saver-panel,.panel.health-panel,.panel.git-panel,.panel.environment-panel,.panel.about-panel,.panel.split-panel{grid-column:1/-1}.form-grid{grid-template-columns:1fr}.view-head{align-items:flex-start;flex-direction:column}.identity-strip{justify-content:flex-start}.footer{align-items:flex-start;flex-direction:column}}
@media(max-width:540px){.topbar{height:62px}.top-actions .top-chip:not(.live){display:none}.metrics{grid-template-columns:1fr}.metric{min-height:106px}.dashboard-grid{display:block}.panel{margin-bottom:12px}.identity-token:last-child{display:none}.main{padding-left:10px;padding-right:10px}.view-head{padding-top:18px}.footer{line-height:1.6}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
</style></head><body>
<div class="orb one"></div><div class="orb two"></div>
<div class="shell"><aside class="sidebar" id="sidebar"><div class="brand-lockup">
<svg class="brand-mark" viewBox="0 0 1828.27 1828.27" role="img" aria-label="Codinfy logo"><rect x=".5" y=".5" width="1827.27" height="1827.27" rx="176.62" fill="#07090d" stroke="#fff"/><path d="M1209.33 282.32h-590.4c-43.06 0-82.84 22.97-104.37 60.26l-295.2 511.3c-21.53 37.29-21.53 83.23 0 120.52l295.2 511.3c21.53 37.29 61.32 60.26 104.37 60.26h590.4c43.06 0 82.84-22.97 104.37-60.26l295.2-511.3c21.53-37.29 21.53-83.23 0-120.52l-295.2-511.3c-21.53-37.29-61.32-60.26-104.37-60.26Z" fill="none" stroke="#fff" stroke-width="57"/><path d="M1081.87 984.73l210.73 63.7c-14.16 59.1-36.45 108.47-66.88 148.1-30.44 39.64-68.21 69.54-113.33 89.71-45.12 20.17-102.54 30.26-172.25 30.26-84.58 0-153.67-12.29-207.28-36.87-53.61-24.57-99.88-67.8-138.81-129.69-38.93-61.89-58.39-141.11-58.39-237.66 0-128.72 34.24-227.65 102.71-296.79 68.48-69.14 165.35-103.71 290.62-103.71 98.02 0 175.07 19.82 231.17 59.45 56.08 39.64 97.75 100.51 125.01 182.6l-212.32 47.24c-7.43-23.7-15.22-41.05-23.36-52.02-13.45-18.39-29.91-32.55-49.37-42.46-19.47-9.9-41.23-14.86-65.29-14.86-54.5 0-96.26 21.92-125.27 65.75-21.95 32.52-32.91 83.59-32.91 153.21 0 86.25 13.09 145.37 39.28 177.35 26.18 31.99 62.98 47.98 110.41 47.98s80.76-12.91 104.3-38.75c23.53-25.83 40.61-63.34 51.22-112.53Z" fill="none" stroke="#fff" stroke-width="57"/></svg>
<div><div class="brand-name">Codinfy</div><div class="brand-sub">Agent Monitor</div></div></div>
<div class="nav-caption">Navigation</div><nav class="nav-list" aria-label="Dashboard navigation">${navigation}</nav><div class="sidebar-spacer"></div>
<div class="workspace-card"><div class="system-line"><span class="live-dot"></span><span>Workspace</span></div><div class="workspace-command">/codinfy</div><div class="workspace-mcp">codinfy-agent-monitor</div></div>
<div class="system-card"><div class="system-line"><span class="live-dot"></span><span id="systemStatus">Connecting locally…</span></div></div></aside>
<main class="main"><header class="topbar"><div style="display:flex;align-items:center;gap:10px"><button class="mobile-menu" id="menuButton" aria-label="Open navigation">☰</button><div class="route-crumb"><span class="terminal-glyph">›_</span><span>/codinfy</span><span style="color:#355167">·</span><span>codinfy-agent-monitor</span></div></div><div class="top-actions"><div class="top-chip live"><span class="live-dot"></span><span id="connectionLabel">Live</span></div><div class="top-chip time"><span>◷</span><span id="clock">--:--:-- UTC</span></div><a class="top-chip" href="/about" style="text-decoration:none">⌘ About</a></div></header>
<div class="content"><header class="view-head"><div><h1 class="view-title" id="pageTitle">Mission control</h1><p class="view-copy" id="pageCopy">Real-time agent operations, limits and release safety.</p></div><div class="identity-strip"><span class="identity-token" id="projectToken">Project: connecting…</span><span class="identity-token" id="sessionToken">Session: connecting…</span><span class="identity-token" id="toolToken">Tool: connecting…</span></div></header>
<section class="page-block" data-pages="dashboard context limits models budget performance"><div class="metrics" id="metrics"></div></section>
<div class="dashboard-grid">
<section class="panel workflow-panel page-block" data-pages="dashboard workflow tasks"><div class="panel-head"><h2 class="panel-title"><b>⌁</b> Workflow rail</h2><span class="panel-meta" id="workflowMeta">0% complete</span></div><div class="panel-body"><div class="workflow-list" id="workflow"></div></div></section>
<section class="panel agents-panel page-block" data-pages="dashboard agents"><div class="panel-head"><h2 class="panel-title"><b>◎</b> Agents radar</h2><span class="panel-meta" id="agentMeta">0 agents</span></div><div class="panel-body"><div class="radar" id="radar"><span class="radar-ring"></span><span class="radar-ring"></span><span class="radar-ring"></span><span class="radar-axis"></span><span class="radar-axis y"></span><span class="radar-center">C</span></div><div class="agent-list" id="agents"></div></div></section>
<section class="panel timeline-panel page-block" data-pages="dashboard timeline reports"><div class="panel-head"><h2 class="panel-title"><b>◷</b> Activity timeline</h2><span class="panel-meta">Live events</span></div><div class="panel-body"><div class="timeline" id="timeline"></div></div></section>
<section class="panel saver-panel page-block" data-pages="dashboard models budget"><div class="panel-head"><h2 class="panel-title"><b>✦</b> AI Credit Saver</h2><span class="panel-meta">Confirmation required</span></div><div class="panel-body" id="advice"></div></section>
<section class="panel health-panel page-block" data-pages="dashboard health tests build security performance"><div class="panel-head"><h2 class="panel-title"><b>⬡</b> Release health</h2><span class="panel-meta">Pre-commit gates</span></div><div class="panel-body"><div class="health-grid" id="health"><div class="empty">Running local release gates…</div></div></div></section>
<section class="panel git-panel page-block" data-pages="dashboard git files"><div class="panel-head"><h2 class="panel-title"><b>⑂</b> Git</h2><span class="panel-meta">Read-only</span></div><div class="panel-body" id="git"></div></section>
<section class="panel environment-panel page-block" data-pages="environment settings performance"><div class="panel-head"><h2 class="panel-title"><b>▤</b> Environment</h2><span class="panel-meta">Host / VPS / Shared / Other</span></div><div class="panel-body"><div class="env-grid" id="environment"><div class="empty">Detecting the local environment…</div></div></div></section>
<section class="panel about-panel page-block" data-pages="about reports settings"><div class="panel-head"><h2 class="panel-title"><b>ⓘ</b> Codinfy identity</h2><span class="panel-meta">Official attribution</span></div><div class="panel-body"><div class="about-copy"><strong>Codinfy Agent Monitor</strong> is the local-first mission control for Claude Code, Codex, Cursor, Windsurf and MCP workflows.<br>Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder &amp; CEO · codinfy.com</div><div class="socials"><a class="social" href="https://facebook.com/codinfyci">f @codinfyci</a><a class="social" href="https://instagram.com/codinfyci">◎ @codinfyci</a><a class="social" href="https://linkedin.com/company/codinfyen">in company/codinfyen</a><a class="social" href="https://tiktok.com/@bakalagoin">♪ @bakalagoin</a><a class="social" href="https://x.com/bakalagoin">𝕏 @bakalagoin</a></div></div></section>
</div><footer class="footer"><strong>© CODINFY PLATFORMS SASU · codinfy.com</strong><span>Codinfy Agent Monitor · /codinfy · codinfy-agent-monitor</span></footer></div></main></div>
<script>
const safe=(value)=>String(value??'—').replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const clamp=(value)=>Math.max(0,Math.min(100,Number(value)||0));
const routeMeta={dashboard:['Mission control','Real-time agent operations, limits and release safety.'],agents:['Agents radar','Active, idle, blocked and completed AI teammates.'],workflow:['Workflow rail','Task ownership, progress and blockers in one operational view.'],tasks:['Tasks','Every monitored task and its current progress.'],context:['Context usage','Official or estimated context pressure.'],limits:['Usage limits','Current rate, daily and weekly usage provenance.'],models:['AI Credit Saver','Model Need Score, recommendation and estimated economy.'],budget:['AI budget','Daily and weekly pressure with economical recommendations.'],timeline:['Activity timeline','A live, local history of monitored actions.'],files:['Modified files','Git-visible files changed in the current project.'],git:['Git status','Branch, remote, commit and working-tree state.'],tests:['Test monitor','Latest recorded test result and release readiness.'],build:['Build monitor','Latest recorded build result and release readiness.'],environment:['Environment','Host, operating system, tools and detected stacks.'],health:['Project health','Traffic-light status for the complete monitored project.'],security:['Security center','Secrets, attribution and pre-commit safety controls.'],performance:['Performance','Usage pressure, workflow progress and active workload.'],reports:['Reports','Redacted local exports and session history.'],settings:['Settings','Language, level, Safe Guard and local monitor identity.'],about:['About Codinfy','Official product, creator and social attribution.']};
const aliases={'codinfy':'dashboard','codinfy-agent-monitor':'dashboard'};
const metricMeta={context:['Context used','◫','#42d5ff'],rate:['Current rate','⌁','#a678ff'],daily:['Daily limit','▣','#38e6c0'],weekly:['Weekly limit','▦','#c489ff']};
function metricCards(metrics){return Object.entries(metrics).map(([key,metric])=>{const meta=metricMeta[key]||[key,'◫','#42d5ff'];const value=clamp(metric.value);return '<article class="metric" style="--metric-color:'+meta[2]+'"><div class="metric-head"><div class="metric-name"><span class="metric-symbol">'+meta[1]+'</span>'+safe(meta[0])+'</div><div class="metric-value">'+Math.round(value)+'%</div></div><div class="meter"><div class="meter-fill" style="width:'+value+'%"></div></div><div class="metric-foot"><span>'+safe(metric.source==='official'?'Official source':'Estimate mode')+'</span><span class="source">'+safe(metric.updatedAt?new Date(metric.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'live')+'</span></div></article>'}).join('')}
function statusClass(value){return String(value||'idle').replace(/[^a-z_]/gi,'_').toLowerCase()}
function workflowRows(tasks){if(!tasks.length)return '<div class="empty">No monitored task yet.<br>Use the MCP task tools to populate this rail.</div>';return tasks.slice(0,7).map((task,index)=>'<div class="workflow-row"><div class="step-icon">'+(index+1)+'</div><div><div class="step-title">'+safe(task.title)+'</div><div class="step-sub">Progress '+safe(task.progress)+'%'+(task.agentId?' · '+safe(task.agentId):'')+'</div></div><span class="status '+statusClass(task.status)+'">'+safe(task.status)+'</span></div>').join('')}
function agentRows(agents){document.querySelectorAll('.radar-dot').forEach((dot)=>dot.remove());agents.slice(0,9).forEach((agent,index)=>{const angle=(index/Math.max(1,agents.length))*Math.PI*2;const radius=34+(index%3)*19;const dot=document.createElement('span');dot.className='radar-dot';dot.style.left='calc(50% + '+Math.round(Math.cos(angle)*radius)+'px)';dot.style.top='calc(50% + '+Math.round(Math.sin(angle)*radius)+'px)';dot.style.background=['error','blocked'].includes(agent.status)?'var(--red)':agent.status==='idle'?'#71899b':'var(--green)';document.getElementById('radar').appendChild(dot)});if(!agents.length)return '<div class="empty">No agent registered.</div>';return agents.slice(0,7).map((agent)=>'<div class="agent-row"><span class="agent-state '+statusClass(agent.status)+'"></span><div style="min-width:0"><div class="agent-name">'+safe(agent.name)+'</div><div class="agent-role">'+safe(agent.role)+(agent.task?' · '+safe(agent.task):'')+'</div></div><span class="status '+statusClass(agent.status)+'">'+safe(agent.status)+'</span></div>').join('')}
function timelineRows(events){if(!events.length)return '<div class="empty">No activity recorded yet.</div>';return events.slice(0,8).map((event)=>'<article class="event"><div class="event-time">'+safe(new Date(event.createdAt).toLocaleTimeString())+'</div><div class="event-type">'+safe(event.type)+'</div><div class="event-message">'+safe(event.message)+'</div></article>').join('')}
function adviceCard(advice){const reasons=(advice.reasons||[]).slice(0,3).map((reason)=>'<li>'+safe(reason)+'</li>').join('');return '<div class="saver-model">'+safe(advice.recommendedCategory)+'</div><div class="score-line"><span>Model Need Score</span><strong>'+safe(advice.score)+'/100</strong></div><div class="saving"><strong>'+safe(advice.estimatedCostSavingPercent)+'%</strong><span>estimated cost saving</span></div><ul class="reason-list">'+reasons+'</ul><a class="action-link" href="/models">Review recommendation →</a>'}
function gitCard(git){return '<div class="git-summary"><div><div class="panel-meta">CURRENT BRANCH</div><div class="git-branch">'+safe(git.branch)+'</div></div><div class="git-stat"><span class="mini-stat">+'+safe(git.added)+' added</span><span class="mini-stat">~'+safe(git.modified)+' modified</span><span class="mini-stat">−'+safe(git.deleted)+' deleted</span><span class="mini-stat">?'+safe(git.untracked)+' untracked</span></div><div class="code-line">'+safe(git.lastCommit||'No commit recorded')+'</div><div class="code-line">'+safe(git.remote||'No remote configured')+'</div></div>'}
function draw(snapshot){document.getElementById('projectToken').textContent='Project: '+snapshot.project;document.getElementById('sessionToken').textContent='Session: '+snapshot.session;document.getElementById('toolToken').textContent='Tool: '+snapshot.tool;document.getElementById('metrics').innerHTML=metricCards(snapshot.metrics);document.getElementById('workflow').innerHTML=workflowRows(snapshot.tasks);document.getElementById('workflowMeta').textContent=snapshot.workflowProgress+'% complete';document.getElementById('agents').innerHTML=agentRows(snapshot.agents);document.getElementById('agentMeta').textContent=snapshot.agents.length+' agents';document.getElementById('timeline').innerHTML=timelineRows(snapshot.timeline);document.getElementById('advice').innerHTML=adviceCard(snapshot.advice);document.getElementById('git').innerHTML=gitCard(snapshot.git)}
function light(value){if(value===true||value==='passed'||value==='green')return ['●','healthy'];if(value==='not_run'||value==='yellow')return ['◆','warning'];return ['▲','danger']}
function drawHealth(review){const values=[['Public ready',review.ready],['Tests',review.tests],['Build',review.build],['Secrets',review.secretFindings.length?'red':'green']];document.getElementById('health').innerHTML=values.map((item)=>{const state=light(item[1]);return '<article class="health-item"><div class="health-icon '+state[1]+'">'+state[0]+'</div><div class="health-name">'+safe(item[0])+'</div><div class="health-value '+state[1]+'">'+safe(item[1])+'</div></article>'}).join('')}
function drawEnvironment(environment){const items=[['Type',environment.type],['Operating system',environment.os],['Shell',environment.shell],['Long-running processes',environment.longRunningProcesses?'available':'limited'],['Detected stacks',(environment.detectedStacks||[]).join(', ')||'None detected'],['Node',environment.tools?.node||'unavailable']];document.getElementById('environment').innerHTML=items.map((item)=>'<div class="env-item"><div class="env-label">'+safe(item[0])+'</div><div class="env-value">'+safe(item[1])+'</div></div>').join('')}
function routePage(){const raw=location.pathname.replace(/^\\//,'')||'dashboard';const page=aliases[raw]||raw;const meta=routeMeta[page]||routeMeta.dashboard;document.getElementById('pageTitle').textContent=meta[0];document.getElementById('pageCopy').textContent=meta[1];document.querySelectorAll('.page-block').forEach((block)=>{const pages=(block.getAttribute('data-pages')||'').split(' ');block.classList.toggle('is-hidden',page!=='dashboard'&&!pages.includes(page))});document.querySelectorAll('.nav-link').forEach((link)=>link.classList.toggle('active',link.dataset.route===page));document.getElementById('sidebar').classList.remove('open')}
async function requestJson(path){const response=await fetch(path,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(path+' returned '+response.status);return response.json()}
const extraPanels='<section id="taskPanel" class="panel wide-panel page-block" data-pages="tasks"><div class="panel-head"><h2 class="panel-title"><b>TK</b> Task registry</h2><span class="panel-meta" id="taskMeta">Live data</span></div><div class="panel-body"><div class="data-list" id="taskRows"></div></div></section>'+
'<section id="filesPanel" class="panel wide-panel page-block" data-pages="files"><div class="panel-head"><h2 class="panel-title"><b>FL</b> Modified files</h2><span class="panel-meta">Git working tree</span></div><div class="panel-body"><div class="data-list" id="fileRows"></div></div></section>'+
'<section id="checksPanel" class="panel wide-panel page-block" data-pages="tests build"><div class="panel-head"><h2 class="panel-title"><b>CI</b> Tests &amp; build</h2><span class="panel-meta">Explicit local execution</span></div><div class="panel-body"><div class="toolbar"><button class="button primary" id="runTests">Run tests</button><button class="button primary" id="runBuild">Run build</button><span class="panel-meta" id="checkStatus">Last recorded results</span></div><div class="data-list" id="checkRows"></div><pre class="output" id="checkOutput">Select a check to run it locally.</pre></div></section>'+
'<section id="securityPanel" class="panel wide-panel page-block" data-pages="security"><div class="panel-head"><h2 class="panel-title"><b>SC</b> Security center</h2><span class="panel-meta">Secrets + attribution + Safe Guard</span></div><div class="panel-body"><div class="data-list" id="securityRows"></div><div class="notice" style="margin-top:12px">No secret value is rendered by the dashboard. Review and scan results are redacted before transport.</div></div></section>'+
'<section id="observerPanel" class="panel split-panel page-block" data-pages="performance"><div class="panel-head"><h2 class="panel-title"><b>OB</b> Codix Observer</h2><span class="panel-meta">Blockers</span></div><div class="panel-body"><div class="data-list" id="observerRows"></div></div></section>'+
'<section id="performancePanel" class="panel split-panel page-block" data-pages="performance"><div class="panel-head"><h2 class="panel-title"><b>PF</b> Live performance</h2><span class="panel-meta">Estimated usage identified</span></div><div class="panel-body"><div class="env-grid" id="performanceRows"></div></div></section>'+
'<section id="dependenciesPanel" class="panel wide-panel page-block" data-pages="environment"><div class="panel-head"><h2 class="panel-title"><b>DP</b> Dependency adapter</h2><span class="panel-meta">Read-only inspection</span></div><div class="panel-body"><div class="data-list" id="dependencyRows"></div></div></section>'+
'<section id="reportsPanel" class="panel split-panel page-block" data-pages="reports"><div class="panel-head"><h2 class="panel-title"><b>RP</b> Redacted reports</h2><span class="panel-meta">Local exports</span></div><div class="panel-body"><div class="toolbar"><button class="button" data-report="md">Export MD</button><button class="button" data-report="json">Export JSON</button><button class="button" data-report="html">Export HTML</button></div><div class="data-list" id="reportRows"></div></div></section>'+
'<section id="historyPanel" class="panel split-panel page-block" data-pages="reports"><div class="panel-head"><h2 class="panel-title"><b>HX</b> Check history</h2><span class="panel-meta">Tests, builds, reports</span></div><div class="panel-body"><div class="data-list" id="historyRows"></div></div></section>'+
'<section id="settingsPanel" class="panel wide-panel page-block" data-pages="settings"><div class="panel-head"><h2 class="panel-title"><b>ST</b> Monitor settings</h2><span class="panel-meta">Stored locally</span></div><div class="panel-body"><div class="form-grid"><label class="field">Language<select id="settingLanguage"><option value="auto">Auto</option><option value="fr">Francais</option><option value="en">English</option></select></label><label class="field">Experience level<select id="settingLevel"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="expert">Expert</option></select></label><label class="field">Safe Guard<span class="switch-field"><input id="settingSafeGuard" type="checkbox"> Review before commit</span></label></div><div class="toolbar" style="margin-top:14px"><button class="button primary" id="saveSettings">Save settings</button><span class="panel-meta" id="settingsStatus">Local configuration</span></div></div></section>';
document.querySelector('.dashboard-grid').insertAdjacentHTML('beforeend',extraPanels);
document.querySelector('.socials').insertAdjacentHTML('beforeend','<a class="social" href="https://facebook.com/bakalagoin">f @bakalagoin</a><a class="social" href="https://instagram.com/bakalagoin">IG @bakalagoin</a><a class="social" href="https://linkedin.com/in/bakala-goin">in bakala-goin</a>');
let lastSnapshot=null;
let activeLanguage='en';
const routeMetaFr={dashboard:['Centre de mission','Opérations des agents, limites et sécurité de publication en temps réel.'],agents:['Radar des agents','Agents actifs, en veille, bloqués et terminés.'],workflow:['Workflow','Responsabilités, progression et blocages en une vue.'],tasks:['Tâches','Toutes les tâches surveillées et leur progression.'],context:['Contexte utilisé','Pression de contexte officielle ou estimée.'],limits:["Limites d'utilisation",'Débit actuel et limites journalières et hebdomadaires.'],models:['Smart Model Router','Score de besoin, recommandation et économie estimée.'],budget:['AI Credit Saver','Économisez tokens et crédits sans changement automatique.'],timeline:['Chronologie','Historique local et temps réel des actions.'],files:['Fichiers modifiés','Fichiers visibles par Git dans le projet courant.'],git:['État Git','Branche, remote, commit et arbre de travail.'],tests:['Tests','Dernier résultat et exécution locale explicite.'],build:['Build','Dernier résultat et exécution locale explicite.'],environment:['Environnement','Hôte, système, outils et stacks détectées.'],health:['Santé du projet','État complet avant commit.'],security:['Centre de sécurité','Secrets, attribution et Safe Guard.'],performance:['Performance','Observer, usage, workflow et charge active.'],reports:['Rapports','Exports locaux expurgés et historique.'],settings:['Réglages','Langue, niveau et Safe Guard.'],about:['À propos de Codinfy','Produit, créateur et réseaux officiels.']};
const navLabelsFr={dashboard:'Centre de mission',agents:'Radar des agents',workflow:'Workflow',tasks:'Tâches',context:'Contexte',limits:'Limites',models:'Smart Model Router',budget:'AI Credit Saver',timeline:'Chronologie',files:'Fichiers modifiés',git:'État Git',tests:'Tests',build:'Build',environment:'Environnement',health:'Santé publication',security:'Sécurité',performance:'Codix Observer',reports:'Rapports',settings:'Réglages',about:'À propos de Codinfy'};
const dedicatedPanels={tasks:['taskPanel'],files:['filesPanel'],tests:['checksPanel'],build:['checksPanel'],security:['securityPanel'],performance:['observerPanel','performancePanel'],reports:['reportsPanel','historyPanel'],settings:['settingsPanel']};
function dataRows(items,emptyMessage){if(!items.length)return '<div class="empty">'+safe(emptyMessage)+'</div>';return items.map((item)=>'<div class="data-row"><div class="data-main"><div class="data-title">'+safe(item.title)+'</div><div class="data-copy">'+safe(item.copy||'')+'</div></div><div class="data-meta">'+safe(item.meta||'')+'</div></div>').join('')}
function drawSnapshot(snapshot){lastSnapshot=snapshot;document.getElementById('projectToken').textContent=(activeLanguage==='fr'?'Projet: ':'Project: ')+snapshot.project;document.getElementById('sessionToken').textContent='Session: '+snapshot.session;document.getElementById('toolToken').textContent='Tool: '+snapshot.tool;document.getElementById('metrics').innerHTML=metricCards(snapshot.metrics);document.getElementById('workflow').innerHTML=workflowRows(snapshot.tasks);document.getElementById('workflowMeta').textContent=snapshot.workflowProgress+'% complete';document.getElementById('agents').innerHTML=agentRows(snapshot.agents);document.getElementById('agentMeta').textContent=snapshot.agents.length+' agents';document.getElementById('timeline').innerHTML=timelineRows(snapshot.timeline);document.getElementById('advice').innerHTML=adviceCard(snapshot.advice);document.getElementById('git').innerHTML=gitCard(snapshot.git);document.getElementById('taskRows').innerHTML=dataRows(snapshot.tasks.map((task)=>({title:task.title,copy:'Progress '+task.progress+'%'+(task.agentId?' - '+task.agentId:''),meta:task.status})),activeLanguage==='fr'?'Aucune tache surveillee.':'No monitored task.');document.getElementById('taskMeta').textContent=snapshot.tasks.length+' tasks';document.getElementById('fileRows').innerHTML=dataRows((snapshot.git.files||[]).map((file)=>({title:file,copy:'Git working tree',meta:'modified'})),activeLanguage==='fr'?'Aucun fichier modifie.':'No modified file.');const perf=[['Context',snapshot.metrics.context.value+'%'],['Current rate',snapshot.metrics.rate.value+'%'],['Workflow',snapshot.workflowProgress+'%'],['Active agents',snapshot.agents.filter((agent)=>!['idle','done'].includes(agent.status)).length],['Errors',snapshot.errors],['Blockers',snapshot.blockers]];document.getElementById('performanceRows').innerHTML=perf.map((item)=>'<div class="env-item"><div class="env-label">'+safe(item[0])+'</div><div class="env-value">'+safe(item[1])+'</div></div>').join('')}
function drawChecks(payload){drawHealth(payload.review);const rows=[['Tests',payload.review.tests,payload.tests?.createdAt],['Build',payload.review.build,payload.build?.createdAt],['Public ready',payload.review.ready?'ready':'blocked','pre-commit review']];document.getElementById('checkRows').innerHTML=dataRows(rows.map((row)=>({title:row[0],copy:row[2]?String(row[2]):'No recorded run',meta:row[1]})),'No check recorded.');const missing=Object.entries(payload.review.attributionMissing||{}).flatMap(([file,values])=>values.map((value)=>file+': '+value));const security=[{title:'Secret scanner',copy:payload.review.secretFindings.length?payload.review.secretFindings.length+' redacted finding(s)':'No secret finding',meta:payload.review.secretFindings.length?'review':'clear'},{title:'Attribution',copy:missing.length?missing.join(' | '):'Mandatory identity present',meta:missing.length?'review':'clear'},{title:'Sensitive files',copy:(payload.review.sensitiveFiles||[]).join(', ')||'No sensitive changed path',meta:(payload.review.sensitiveFiles||[]).length}];document.getElementById('securityRows').innerHTML=dataRows(security,'Security review unavailable.')}
function drawObserver(report){const blockers=(report.blockers||[]).map((blocker)=>({title:blocker.kind,copy:blocker.message,meta:blocker.severity}));const recommendations=(report.recommendations||[]).map((message)=>({title:'Recommendation',copy:message,meta:'advice'}));document.getElementById('observerRows').innerHTML=dataRows(blockers.concat(recommendations),'No blocker detected.')}
function drawDependencies(data){document.getElementById('dependencyRows').innerHTML=dataRows([{title:'Package manager',copy:data.lockfile||'No lockfile detected',meta:data.manager},{title:'Outdated command',copy:data.outdatedCommand,meta:'not executed'},{title:'Audit command',copy:data.auditCommand,meta:'not executed'}],'Dependency data unavailable.')}
function drawReports(reports){document.getElementById('reportRows').innerHTML=dataRows(reports.map((report)=>({title:report.name,copy:new Date(report.updatedAt).toLocaleString(),meta:Math.max(1,Math.round(report.size/1024))+' KB'})),'No report exported yet.')}
function drawHistory(events){document.getElementById('historyRows').innerHTML=dataRows(events.map((event)=>({title:event.type,copy:event.message,meta:new Date(event.createdAt).toLocaleTimeString()})),'No check history yet.')}
function drawSettings(settings){document.getElementById('settingLanguage').value=settings.language;document.getElementById('settingLevel').value=settings.level;document.getElementById('settingSafeGuard').checked=settings.safeGuard;activeLanguage=settings.language==='auto'?settings.detectedLanguage:settings.language;document.documentElement.lang=activeLanguage;metricMeta.context[0]=activeLanguage==='fr'?'Contexte utilisé':'Context used';metricMeta.rate[0]=activeLanguage==='fr'?'Débit actuel':'Current rate';metricMeta.daily[0]=activeLanguage==='fr'?'Limite journalière':'Daily limit';metricMeta.weekly[0]=activeLanguage==='fr'?'Limite hebdomadaire':'Weekly limit';document.querySelectorAll('.nav-link').forEach((link)=>{if(activeLanguage==='fr'&&navLabelsFr[link.dataset.route])link.querySelector('.nav-label').textContent=navLabelsFr[link.dataset.route]});routePage();if(lastSnapshot)drawSnapshot(lastSnapshot)}
function drawEnvironmentLive(environment){drawEnvironment(environment)}
function routePage(){const raw=location.pathname.replace(/^[/]/,'')||'dashboard';const page=aliases[raw]||raw;const meta=(activeLanguage==='fr'?routeMetaFr:routeMeta)[page]||(activeLanguage==='fr'?routeMetaFr.dashboard:routeMeta.dashboard);document.getElementById('pageTitle').textContent=meta[0];document.getElementById('pageCopy').textContent=meta[1];document.querySelectorAll('.page-block').forEach((block)=>{const dedicated=dedicatedPanels[page];const pages=(block.getAttribute('data-pages')||'').split(' ');const visible=dedicated?dedicated.includes(block.id):page==='dashboard'?pages.includes('dashboard'):pages.includes(page);block.classList.toggle('is-hidden',!visible)});document.querySelectorAll('.nav-link').forEach((link)=>link.classList.toggle('active',link.dataset.route===page));document.getElementById('sidebar').classList.remove('open')}
async function postJson(path,body){const response=await fetch(path,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(path+' returned '+response.status);return response.json()}
async function loadDetails(){const results=await Promise.allSettled([requestJson('/api/checks'),requestJson('/api/environment'),requestJson('/api/observer'),requestJson('/api/dependencies'),requestJson('/api/reports'),requestJson('/api/settings'),requestJson('/api/history')]);if(results[0].status==='fulfilled')drawChecks(results[0].value);if(results[1].status==='fulfilled')drawEnvironmentLive(results[1].value);if(results[2].status==='fulfilled')drawObserver(results[2].value);if(results[3].status==='fulfilled')drawDependencies(results[3].value);if(results[4].status==='fulfilled')drawReports(results[4].value);if(results[5].status==='fulfilled')drawSettings(results[5].value);if(results[6].status==='fulfilled')drawHistory(results[6].value)}
document.querySelectorAll('[data-report]').forEach((button)=>button.addEventListener('click',async()=>{button.disabled=true;try{const result=await postJson('/api/reports/export',{format:button.dataset.report});drawReports(result.reports);drawHistory(await requestJson('/api/history'))}catch(error){document.getElementById('reportRows').innerHTML='<div class="empty">'+safe(error.message)+'</div>'}finally{button.disabled=false}}));
document.getElementById('saveSettings').addEventListener('click',async()=>{const button=document.getElementById('saveSettings');button.disabled=true;document.getElementById('settingsStatus').textContent='Saving...';try{const settings=await postJson('/api/settings',{language:document.getElementById('settingLanguage').value,level:document.getElementById('settingLevel').value,safeGuard:document.getElementById('settingSafeGuard').checked});drawSettings(settings);document.getElementById('settingsStatus').textContent='Saved locally'}catch(error){document.getElementById('settingsStatus').textContent=error.message}finally{button.disabled=false}});
async function runCheck(kind){const button=document.getElementById(kind==='tests'?'runTests':'runBuild');button.disabled=true;document.getElementById('checkStatus').textContent='Running '+kind+'...';try{const result=await postJson('/api/checks/'+kind,{});document.getElementById('checkOutput').textContent=result.output||'No output.';drawChecks(await requestJson('/api/checks'));document.getElementById('checkStatus').textContent=result.success?'Passed':'Failed'}catch(error){document.getElementById('checkOutput').textContent=error.message;document.getElementById('checkStatus').textContent='Unavailable'}finally{button.disabled=false}}
document.getElementById('runTests').addEventListener('click',()=>runCheck('tests'));document.getElementById('runBuild').addEventListener('click',()=>runCheck('build'));
routePage();document.getElementById('menuButton').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));setInterval(()=>{document.getElementById('clock').textContent=new Date().toISOString().slice(11,19)+' UTC'},1000);
requestJson('/api/status').then((snapshot)=>{drawSnapshot(snapshot);document.getElementById('systemStatus').textContent='All systems connected';return loadDetails()}).catch(()=>{document.getElementById('systemStatus').textContent='Local API unavailable';document.getElementById('connectionLabel').textContent='Offline'});
let liveSocket;let reconnectAttempt=0;let reconnectTimer;function connectLive(){clearTimeout(reconnectTimer);liveSocket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');liveSocket.onopen=()=>{reconnectAttempt=0;document.getElementById('connectionLabel').textContent='Live';document.getElementById('systemStatus').textContent='All systems connected'};liveSocket.onmessage=(event)=>{try{drawSnapshot(JSON.parse(event.data))}catch{document.getElementById('systemStatus').textContent='Invalid live update ignored'}};liveSocket.onclose=()=>{document.getElementById('connectionLabel').textContent='Reconnecting';document.getElementById('systemStatus').textContent='Live stream disconnected';const delay=Math.min(10000,1000*Math.pow(2,reconnectAttempt++));reconnectTimer=setTimeout(connectLive,delay)};liveSocket.onerror=()=>{document.getElementById('connectionLabel').textContent='Offline'}}connectLive();
</script></body></html>`;
}

export async function createLocalServer(monitor = new AgentMonitor()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  let websocketClients = 0;
  await app.register(websocket);
  app.addHook('onRequest', async (request, reply) => {
    if (!isLoopbackHost(request.headers.host ?? ''))
      return reply.code(403).type('application/json').send({ error: 'Loopback host required.' });
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
  });
  app.get('/healthz', async () => ({
    ok: true,
    name: CODINFY_ATTRIBUTION.mcpName,
    command: CODINFY_ATTRIBUTION.command,
    signature: CODINFY_ATTRIBUTION.signature,
  }));
  app.get('/api/status', async () => JSON.parse(redactSecrets(JSON.stringify(monitor.snapshot()))));
  app.get('/api/environment', async () =>
    JSON.parse(redactSecrets(JSON.stringify(monitor.environment()))),
  );
  app.get('/api/git', async () =>
    JSON.parse(redactSecrets(JSON.stringify(monitor.snapshot().git))),
  );
  app.get('/api/agents', async () =>
    JSON.parse(redactSecrets(JSON.stringify(monitor.store.listAgents()))),
  );
  app.get('/api/timeline', async () =>
    JSON.parse(redactSecrets(JSON.stringify(monitor.store.timeline(50)))),
  );
  app.get('/api/review', async () => JSON.parse(redactSecrets(JSON.stringify(monitor.review()))));
  app.get('/api/tasks', async () =>
    JSON.parse(redactSecrets(JSON.stringify(monitor.snapshot().tasks))),
  );
  app.get('/api/files', async () =>
    JSON.parse(redactSecrets(JSON.stringify(monitor.snapshot().git.files))),
  );
  app.get('/api/observer', async () =>
    JSON.parse(redactSecrets(JSON.stringify(monitor.observer()))),
  );
  app.get('/api/dependencies', async () =>
    JSON.parse(
      redactSecrets(JSON.stringify(getDependencyHealth(monitor.store.projectRoot, false))),
    ),
  );
  app.get('/api/reports', async () =>
    JSON.parse(redactSecrets(JSON.stringify(listReports(monitor)))),
  );
  app.get('/api/settings', async () => {
    const config = monitor.store.getConfig();
    return JSON.parse(
      redactSecrets(
        JSON.stringify({
          language: config.language,
          detectedLanguage: monitor.language,
          level: config.level,
          safeGuard: config.safeGuard,
          tool: config.tool,
          currentModel: config.currentModel,
        }),
      ),
    );
  });
  app.get('/api/checks', async () =>
    JSON.parse(
      redactSecrets(
        JSON.stringify({
          review: monitor.review(),
          tests: monitor.store.latestEvent('check.tests'),
          build: monitor.store.latestEvent('check.build'),
        }),
      ),
    ),
  );
  app.get('/api/history', async () => {
    const events = monitor.store
      .timeline(200)
      .filter((event) => /(?:check|test|build|command|report)/i.test(event.type))
      .slice(0, 50);
    return JSON.parse(redactSecrets(JSON.stringify(events)));
  });
  app.post<{
    Body: { language?: string; level?: string; safeGuard?: boolean };
  }>('/api/settings', async (request, reply) => {
    if (!isAllowedMutationOrigin(request))
      return reply.code(403).send({ error: 'Same-origin browser request required.' });
    const language = request.body?.language;
    const level = request.body?.level;
    const safeGuard = request.body?.safeGuard;
    if (!language || !['auto', 'fr', 'en'].includes(language))
      return reply.code(400).send({ error: 'Invalid language.' });
    if (!level || !['beginner', 'intermediate', 'expert'].includes(level))
      return reply.code(400).send({ error: 'Invalid user level.' });
    if (typeof safeGuard !== 'boolean')
      return reply.code(400).send({ error: 'Invalid Safe Guard value.' });
    const config = monitor.store.updateConfig({
      language: language as 'auto' | 'fr' | 'en',
      level: level as 'beginner' | 'intermediate' | 'expert',
      safeGuard,
    });
    return { language: config.language, detectedLanguage: monitor.language, level, safeGuard };
  });
  app.post<{ Body: { format?: string } }>('/api/reports/export', async (request, reply) => {
    if (!isAllowedMutationOrigin(request))
      return reply.code(403).send({ error: 'Same-origin browser request required.' });
    const format = request.body?.format;
    if (!format || !['md', 'json', 'html'].includes(format))
      return reply.code(400).send({ error: 'Invalid report format.' });
    const path = monitor.exportReport(true, format as 'md' | 'json' | 'html');
    return { name: basename(path), reports: listReports(monitor) };
  });
  app.post<{ Params: { kind: string } }>('/api/checks/:kind', async (request, reply) => {
    if (!isAllowedMutationOrigin(request))
      return reply.code(403).send({ error: 'Same-origin browser request required.' });
    if (!['tests', 'build'].includes(request.params.kind))
      return reply.code(400).send({ error: 'Invalid check kind.' });
    const result = monitor.runProjectScript(request.params.kind as 'tests' | 'build');
    return JSON.parse(redactSecrets(JSON.stringify(result)));
  });
  app.get('/ws', { websocket: true }, (socket, request) => {
    if (!isAllowedWebSocketOrigin(request)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }
    if (websocketClients >= 8) {
      socket.close(1013, 'Local connection limit reached');
      return;
    }
    websocketClients += 1;
    let closed = false;
    const send = () => {
      if (socket.readyState === socket.OPEN)
        socket.send(redactSecrets(JSON.stringify(monitor.snapshot())));
    };
    const cleanup = () => {
      if (closed) return;
      closed = true;
      websocketClients = Math.max(0, websocketClients - 1);
      clearInterval(timer);
    };
    send();
    const timer = setInterval(send, 1_500);
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
  const routes = ['/', '/codinfy', '/codinfy-agent-monitor', ...PAGES.map((page) => `/${page}`)];
  for (const route of routes)
    app.get(route, async (_request, reply) =>
      reply.type('text/html; charset=utf-8').send(dashboardHtml()),
    );
  return app;
}

export async function startLocalServer(
  options: { monitor?: AgentMonitor; host?: string; port?: number } = {},
): Promise<FastifyInstance> {
  const host = options.host ?? '127.0.0.1';
  if (!isLoopbackHost(host)) throw new Error('Codinfy dashboard only supports loopback hosts.');
  const app = await createLocalServer(options.monitor);
  await app.listen({ host, port: options.port ?? 3579 });
  return app;
}
