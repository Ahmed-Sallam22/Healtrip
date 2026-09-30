import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** OpenAPI schema generated from the shared Zod schema — docs can't drift from validation. */
export function openApi(schema: ZodTypeAny): SchemaObject {
  const { $schema: _s, ...rest } = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>;
  return rest as SchemaObject;
}
