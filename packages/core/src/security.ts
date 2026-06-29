import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { execTrustedFileSync } from './execution.js';
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
  return output
    .replace(/(https?:\/\/)[^/@\s:]+:[^/@\s]+@/gi, '$1[REDACTED]@')
    .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}

export function sanitizeTerminalText(value: string, preserveNewlines = false): string {
  let output = '';
  for (const character of redactSecrets(value)) {
    const code = character.codePointAt(0) ?? 0;
    const allowedNewline = preserveNewlines && code === 10;
    const control = code < 32 || (code >= 0x7f && code <= 0x9f);
    const bidiOverride = (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    output +=
      control && !allowedNewline
        ? `\\u${code.toString(16).padStart(4, '0')}`
        : bidiOverride
          ? `[U+${code.toString(16).toUpperCase()}]`
          : character;
  }
  return output;
}

function isWithinRoot(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function fallbackProjectFiles(root: string): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  const queue = [resolve(root)];
  let truncated = false;
  while (queue.length && files.length < 20_000) {
    const directory = queue.pop()!;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_PARTS.includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) queue.push(absolute);
      else files.push(absolute);
      if (files.length >= 20_000) {
        truncated = true;
        break;
      }
    }
  }
  return { files, truncated };
}

function listProjectFiles(root: string): { files: string[]; truncated: boolean } {
  try {
    const output = execTrustedFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: root, timeout: 10_000 },
    );
    return {
      files: output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((file) => resolve(root, file))
        .filter((file) => isWithinRoot(root, file)),
      truncated: false,
    };
  } catch {
    return fallbackProjectFiles(root);
  }
}

export function scanSecrets(root: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const inventory = listProjectFiles(root);
  if (inventory.truncated)
    findings.push({
      file: '.',
      line: 1,
      rule: 'Secret scan inventory exceeded 20,000 files',
      preview: '[SCAN INCOMPLETE]',
      severity: 'high',
    });
  for (const absolute of inventory.files) {
    const file = relative(root, absolute).replaceAll('\\', '/');
    if (SKIP_PARTS.some((part) => file.split('/').includes(part))) continue;
    try {
      const info = lstatSync(absolute);
      if (info.isSymbolicLink()) {
        findings.push({
          file,
          line: 1,
          rule: 'Symbolic link was not followed by the secret scanner',
          preview: '[SYMLINK NOT SCANNED]',
          severity: 'high',
        });
        continue;
      }
      if (!info.isFile()) continue;
      if (info.size > 5_000_000) {
        findings.push({
          file,
          line: 1,
          rule: 'File exceeds the 5 MB secret scanner limit',
          preview: '[FILE NOT SCANNED]',
          severity: 'medium',
        });
        continue;
      }
    } catch {
      findings.push({
        file,
        line: 1,
        rule: 'File metadata could not be inspected',
        preview: '[FILE NOT SCANNED]',
        severity: 'medium',
      });
      continue;
    }
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
      if (content.includes('\0')) {
        findings.push({
          file,
          line: 1,
          rule: 'Binary file was not inspected for secrets',
          preview: '[BINARY FILE NOT SCANNED]',
          severity: 'medium',
        });
        continue;
      }
    } catch {
      findings.push({
        file,
        line: 1,
        rule: 'File could not be read by the secret scanner',
        preview: '[FILE NOT SCANNED]',
        severity: 'medium',
      });
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
            preview: '[REDACTED MATCH]',
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
