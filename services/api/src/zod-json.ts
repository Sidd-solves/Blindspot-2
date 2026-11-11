import { z } from 'zod';

/** JSON Schema for tool inputs (used for the Claude tool definitions and the tool catalog). */
export function zodToJsonSchema(t: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(t, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  return schema;
}
