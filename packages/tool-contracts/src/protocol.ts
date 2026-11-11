import { z } from 'zod';

/** Typed WebSocket contract between the bridge, the Tableau extension and MCP/API clients. */
export const BRIDGE_VERSION = 1;
export const BRIDGE_METHODS = [
  'ping',
  'listWorksheets',
  'getWorksheetData',
  'getFilters',
  'applyFilter',
  'getParameters',
  'setParameter',
] as const;
export type BridgeMethod = (typeof BRIDGE_METHODS)[number];

export const BridgeError = z.object({ code: z.string().max(64), message: z.string().max(500) });

export const BridgeMessage = z.discriminatedUnion('kind', [
  z.object({
    v: z.literal(BRIDGE_VERSION),
    kind: z.literal('hello'),
    role: z.enum(['extension', 'client']),
    token: z.string().max(256).optional(),
  }),
  z.object({
    v: z.literal(BRIDGE_VERSION),
    kind: z.literal('hello-ack'),
    role: z.enum(['extension', 'client']),
    extensionConnected: z.boolean(),
  }),
  z.object({
    v: z.literal(BRIDGE_VERSION),
    kind: z.literal('request'),
    id: z.string().min(1).max(64),
    method: z.enum(BRIDGE_METHODS),
    payload: z.unknown().optional(),
  }),
  z.object({
    v: z.literal(BRIDGE_VERSION),
    kind: z.literal('response'),
    id: z.string().min(1).max(64),
    ok: z.boolean(),
    payload: z.unknown().optional(),
    error: BridgeError.optional(),
  }),
  z.object({
    v: z.literal(BRIDGE_VERSION),
    kind: z.literal('event'),
    name: z.enum(['filterChanged', 'parameterChanged', 'extensionStatus']),
    payload: z.unknown().optional(),
  }),
  z.object({ v: z.literal(BRIDGE_VERSION), kind: z.literal('ping'), t: z.number() }),
  z.object({ v: z.literal(BRIDGE_VERSION), kind: z.literal('pong'), t: z.number() }),
]);
export type BridgeMessage = z.infer<typeof BridgeMessage>;

export interface BridgeLike {
  isConnected(): boolean;
  request<T = unknown>(method: BridgeMethod, payload?: unknown, timeoutMs?: number): Promise<T>;
}

/** Message size cap (bytes) enforced by every bridge endpoint. */
export const MAX_BRIDGE_MESSAGE_BYTES = 8 * 1024 * 1024;
