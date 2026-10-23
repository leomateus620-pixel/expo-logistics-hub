import { z } from 'zod';

/** The schemas here use only these Zod primitives; unsupported kinds fail closed. */
export function workerJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodOptional) return workerJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault) return { ...workerJsonSchema(schema._def.innerType), default: schema._def.defaultValue() };
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    for (const check of schema._def.checks) {
      if (check.kind === 'uuid') result.format = 'uuid';
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
      if (check.kind === 'regex') result.pattern = check.regex.source;
      if (check.kind === 'datetime') result.format = 'date-time';
    }
    if (schema.description) result.description = schema.description;
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    for (const check of schema._def.checks) {
      if (check.kind === 'int') result.type = 'integer';
      if (check.kind === 'min') result.minimum = check.value;
      if (check.kind === 'max') result.maximum = check.value;
    }
    return result;
  }
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodLiteral && ['string','number','boolean'].includes(typeof schema.value)) return {type:typeof schema.value,enum:[schema.value]};
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodArray) return { type: 'array', items: workerJsonSchema(schema.element), maxItems: schema._def.maxLength?.value ?? 100 };
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(schema.shape) as Array<[string, z.ZodTypeAny]>) {
      properties[key] = workerJsonSchema(field);
      if (!field.isOptional()) required.push(key);
    }
    return { type: 'object', properties, additionalProperties: false, ...(required.length ? { required } : {}) };
  }
  throw new Error('Unsupported worker input schema');
}

export const uuid = () => z.string().uuid();
export const date = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timestamp = () => z.string().datetime({ offset: true });
export const limit = () => z.number().int().min(1).max(100).default(20);
export const listEventsInput = z.object({
  from_date: date().optional().describe('Data inicial (YYYY-MM-DD).'),
  to_date: date().optional().describe('Data final (YYYY-MM-DD).'),
  status: z.string().max(60).optional(), search: z.string().max(120).optional(), limit: limit(),
}).strict();
export const getEventInput = z.object({ event_id: uuid().describe('ID do evento.') }).strict();
export const listTransportsInput = z.object({
  status: z.string().max(60).optional(),
  from_datetime: timestamp().optional(), to_datetime: timestamp().optional(), limit: limit(),
}).strict();
