import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { normalizeCity } from '@healtrip/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProvidersRepository } from './providers.repository';

const ProvidersQuerySchema = z.object({
  specialty: z.string().regex(/^[A-Z_]{2,40}$/).default('CARDIOLOGY'),
  city: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

/** Plain, deterministic search — useful for debugging data; the agent never calls this endpoint. */
@ApiTags('providers')
@Controller('providers')
export class ProvidersController {
  constructor(private readonly repo: ProvidersRepository) {}

  @Get()
  @ApiOperation({ summary: 'Search doctors by specialty and city (debug endpoint, not used by the agent)' })
  @ApiQuery({ name: 'specialty', required: false, example: 'CARDIOLOGY' })
  @ApiQuery({ name: 'city', required: false, example: 'Cairo' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  async search(@Query(new ZodValidationPipe(ProvidersQuerySchema)) q: z.infer<typeof ProvidersQuerySchema>) {
    const city = q.city ? normalizeCity(q.city)?.code ?? q.city : undefined;
    const doctors = await this.repo.searchDoctors({ specialtyCode: q.specialty, city, limit: q.limit });
    return { count: doctors.length, doctors };
  }
}
