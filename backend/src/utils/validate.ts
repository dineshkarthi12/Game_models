import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors.js';
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw badRequest(first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', r.error.flatten());
  }
  return r.data;
}
export const uuid = z.string().uuid();
export const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), page_size: z.coerce.number().int().min(1).max(100).default(20) });
