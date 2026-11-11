import { z } from 'zod';

/** Minimal Zod -> JSON Schema converter covering the types our tool inputs use. */
export function zodToJsonSchema(t: z.ZodTypeAny): Record<string, unknown> {
  const d: any = t._def;
  switch (d.typeName) {
    case 'ZodObject': {
      const shape = d.shape();
      const props: Record<string, unknown> = {}, required: string[] = [];
      for (const [k, v] of Object.entries<z.ZodTypeAny>(shape)) {
        props[k] = zodToJsonSchema(v);
        if (!v.isOptional() && (v._def as any).typeName !== 'ZodDefault') required.push(k);
      }
      return { type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false };
    }
    case 'ZodString': return { type: 'string' };
    case 'ZodNumber': return { type: d.checks?.some((c: any) => c.kind === 'int') ? 'integer' : 'number' };
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodEnum': return { type: 'string', enum: d.values };
    case 'ZodLiteral': return { const: d.value };
    case 'ZodArray': return { type: 'array', items: zodToJsonSchema(d.type) };
    case 'ZodOptional': case 'ZodNullable': return zodToJsonSchema(d.innerType);
    case 'ZodDefault': return { ...zodToJsonSchema(d.innerType), default: d.defaultValue() };
    case 'ZodEffects': return zodToJsonSchema(d.schema);
    case 'ZodUnion': return { anyOf: d.options.map(zodToJsonSchema) };
    case 'ZodDiscriminatedUnion': return { anyOf: [...d.options.values()].map(zodToJsonSchema) };
    case 'ZodRecord': return { type: 'object', additionalProperties: zodToJsonSchema(d.valueType) };
    default: return {};
  }
}
