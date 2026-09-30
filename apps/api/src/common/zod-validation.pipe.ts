import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/** Validates a request part with a shared Zod schema; errors become VALIDATION_ERROR via the global filter. */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return parsed.data;
  }
}
