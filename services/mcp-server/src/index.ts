#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listTools, callTool, SessionState, type ToolContext } from '@blindspot/tool-contracts';
import { parseCsv } from '@blindspot/analytics';
import { readFileSync } from 'node:fs';
import { BridgeClient } from './bridge-client';

// stdout is the MCP channel: all logs go to stderr.
const log = (m: string) => process.stderr.write(`[blindspot-mcp] ${m}\n`);

const state = new SessionState();
if (process.env.BLINDSPOT_CSV) state.setDataset(parseCsv(readFileSync(process.env.BLINDSPOT_CSV, 'utf8'), process.env.BLINDSPOT_CSV));
const bridge = process.env.BRIDGE_URL ? new BridgeClient(process.env.BRIDGE_URL, process.env.BRIDGE_TOKEN, log) : undefined;
const ctx: ToolContext = { state, bridge, rest: { serverUrl: process.env.TABLEAU_SERVER_URL, site: process.env.TABLEAU_SITE, patName: process.env.TABLEAU_PAT_NAME, patSecret: process.env.TABLEAU_PAT_SECRET } };

const server = new McpServer({ name: 'blindspot', version: '0.1.0' });

for (const tool of listTools()) {
  // MCP wants an object shape; the strict schema (including unions) is enforced again inside callTool.
  const shape = tool.input instanceof z.ZodObject ? (tool.input as z.ZodObject<any>).shape : { component: z.string(), props: z.record(z.string(), z.unknown()) };
  server.registerTool(tool.name, { title: tool.name, description: `[${tool.category}] ${tool.description}`, inputSchema: shape }, async (args: unknown) => {
    const r = await callTool(ctx, tool.name, args);
    return { isError: !r.ok, content: [{ type: 'text' as const, text: JSON.stringify(r.ok ? r.data : r.error, null, 1) }] };
  });
}

await server.connect(new StdioServerTransport());
log(`ready with ${listTools().length} tools; bridge=${process.env.BRIDGE_URL ?? 'disabled'}; data=${state.dataset.label}`);
