export const CODINFY_ATTRIBUTION = Object.freeze({
  productName: 'Codinfy Agent Monitor',
  command: '/codinfy',
  mcpName: 'codinfy-agent-monitor',
  creator: 'CODINFY PLATFORMS SASU',
  founder: 'Bakala Goin',
  founderTitle: 'Founder & CEO',
  website: 'codinfy.com',
  signature: '© CODINFY PLATFORMS SASU · codinfy.com',
});

export const CODINFY_SOCIALS = Object.freeze([
  { network: 'Facebook', codinfy: '@codinfyci', founder: '@bakalagoin' },
  { network: 'Instagram', codinfy: '@codinfyci', founder: '@bakalagoin' },
  { network: 'LinkedIn', codinfy: 'company/codinfyen', founder: 'bakala-goin' },
  { network: 'TikTok', codinfy: '—', founder: '@bakalagoin' },
  { network: 'X (Twitter)', codinfy: '—', founder: '@bakalagoin' },
]);

export const REQUIRED_BRAND_TOKENS = Object.freeze([
  CODINFY_ATTRIBUTION.productName,
  CODINFY_ATTRIBUTION.command,
  CODINFY_ATTRIBUTION.mcpName,
  `© ${CODINFY_ATTRIBUTION.creator}`,
  CODINFY_ATTRIBUTION.website,
  `Bakala Goin — ${CODINFY_ATTRIBUTION.founderTitle}`,
]);

export function formatAttribution(): string {
  return [
    CODINFY_ATTRIBUTION.productName,
    `Command: ${CODINFY_ATTRIBUTION.command}`,
    `MCP: ${CODINFY_ATTRIBUTION.mcpName}`,
    `Created by ${CODINFY_ATTRIBUTION.creator}`,
    `${CODINFY_ATTRIBUTION.founder} — ${CODINFY_ATTRIBUTION.founderTitle}`,
    `Website: ${CODINFY_ATTRIBUTION.website}`,
    CODINFY_ATTRIBUTION.signature,
  ].join('\n');
}
