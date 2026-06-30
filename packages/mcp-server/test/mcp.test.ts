import { describe, expect, it } from 'vitest';
import { TOOL_NAMES } from '../src/index.js';

describe('MCP surface', () => {
  it('keeps the official MCP tools and attribution tool', () => {
    expect(TOOL_NAMES).toContain('monitor.status');
    expect(TOOL_NAMES).toContain('monitor.review_before_commit');
    expect(TOOL_NAMES).toContain('monitor.scan_secrets');
    expect(TOOL_NAMES).toContain('monitor.get_attribution');
    expect(TOOL_NAMES).toContain('monitor.node_servers');
    expect(TOOL_NAMES).toContain('monitor.node_stop_process');
    expect(TOOL_NAMES).toContain('monitor.node_kill_process');
    expect(TOOL_NAMES).toContain('monitor.update_status');
    expect(TOOL_NAMES).toContain('monitor.backup_restore');
    expect(TOOL_NAMES).toContain('monitor.health_doctor');
    expect(TOOL_NAMES).toHaveLength(66);
  });
});
