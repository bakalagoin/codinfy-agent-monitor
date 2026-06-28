import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

describe('MCP stdio integration', () => {
  it('connects, lists tools, and calls mandatory attribution', async () => {
    const project = mkdtempSync(join(tmpdir(), 'codinfy-mcp-'));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve('packages/mcp-server/dist/index.js')],
      cwd: project,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'codinfy-agent-monitor-test', version: '0.1.0' });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe('codinfy-agent-monitor');
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain('monitor.status');
      expect(tools.tools.map((tool) => tool.name)).toContain('monitor.get_attribution');
      const attribution = await client.callTool({ name: 'monitor.get_attribution', arguments: {} });
      expect(JSON.stringify(attribution)).toContain('CODINFY PLATFORMS SASU');
      expect(JSON.stringify(attribution)).toContain('/codinfy');
    } finally {
      await client.close();
      rmSync(project, { recursive: true, force: true });
    }
  }, 20_000);
});
