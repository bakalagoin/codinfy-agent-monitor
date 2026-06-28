import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { SecretFinding } from './types.js';

const SECRET_PATTERNS = [
  {
    name: 'OpenAI-style API key',
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    severity: 'critical' as const,
  },
  {
    name: 'GitHub classic token',
    regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    severity: 'critical' as const,
  },
  {
    name: 'GitHub fine-grained token',
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    severity: 'critical' as const,
  },
  {
    name: 'Private key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    severity: 'critical' as const,
  },
  {
    name: 'Credential assignment',
    regex:
      /\b(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET|PRIVATE_KEY|DATABASE_URL|REDIS_PASSWORD|CPANEL_PASSWORD)\b\s*[:=]\s*["']?[^\s"'`]{12,}/gi,
    severity: 'high' as const,
  },
  { name: 'Bearer token', regex: /\bBearer\s+[A-Za-z0-9._~-]{20,}\b/g, severity: 'high' as const },
];

const SKIP_PARTS = ['node_modules', '.git', 'dist', 'coverage', '.codinfy-agent-monitor'];
const SENSITIVE_FILE =
  /(?:^|[/\\])(?:\.env(?:\..+)?|id_rsa|id_ed25519|credentials(?:\.json)?|.*\.(?:pem|p12|pfx|key))$/i;

export function redactSecrets(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern.regex, '[REDACTED]');
  return output;
}

function listProjectFiles(root: string): string[] {
  try {
    const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => resolve(root, file));
  } catch {
    return [];
  }
}

export function scanSecrets(root: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const absolute of listProjectFiles(root)) {
    const file = relative(root, absolute).replaceAll('\\', '/');
    if (SKIP_PARTS.some((part) => file.split('/').includes(part))) continue;
    if (SENSITIVE_FILE.test(file) && file !== '.env.example') {
      findings.push({
        file,
        line: 1,
        rule: 'Sensitive file must not be published',
        preview: '[SENSITIVE FILE]',
        severity: 'critical',
      });
      continue;
    }
    let content: string;
    try {
      content = readFileSync(absolute, 'utf8');
      if (content.includes('\0') || content.length > 1_000_000) continue;
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((lineText, index) => {
      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(lineText)) {
          findings.push({
            file,
            line: index + 1,
            rule: pattern.name,
            preview: redactSecrets(lineText.trim()).slice(0, 160),
            severity: pattern.severity,
          });
        }
      }
    });
  }
  return findings;
}

const DANGEROUS_COMMAND_PATTERNS: { name: string; regex: RegExp }[] = [
  {
    name: 'Recursive force delete (rm -rf)',
    regex: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r\b/i,
  },
  { name: 'Hard Git reset', regex: /\bgit\s+reset\s+--hard\b/i },
  { name: 'Force push', regex: /\bgit\s+push\s+.*--force\b|\bgit\s+push\s+-f\b/i },
  { name: 'Drop database', regex: /\bDROP\s+DATABASE\b/i },
  {
    name: 'Destructive migration refresh',
    regex: /\bartisan\s+migrate:fresh\b|\bmigrate:reset\b/i,
  },
  { name: 'Windows recursive delete (del /s)', regex: /\bdel\s+\/s\b|\brmdir\s+\/s\b/i },
  { name: 'Disk format', regex: /\bformat\s+[a-z]:|\bmkfs\b/i },
  { name: 'Recursive chmod 777', regex: /\bchmod\s+-R\s+777\b/i },
];

export function detectDangerousCommand(text: string): { dangerous: boolean; matches: string[] } {
  const matches = DANGEROUS_COMMAND_PATTERNS.filter((pattern) => pattern.regex.test(text)).map(
    (pattern) => pattern.name,
  );
  return { dangerous: matches.length > 0, matches };
}

export function isSensitivePath(file: string): boolean {
  return (
    SENSITIVE_FILE.test(file) ||
    /(?:auth|secret|credential|payment|migration|\.github\/workflows)/i.test(file)
  );
}
