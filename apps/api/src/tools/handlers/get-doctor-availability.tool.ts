import { GetDoctorAvailabilityArgsSchema, TOOL_NAMES } from '@healtrip/shared';
import type { ProvidersRepository } from '../../providers/providers.repository';
import { fail, ok, type ToolDefinition } from '../tool.types';

const MAX_DAYS = 14;
const MAX_SLOTS = 10;

export function getDoctorAvailabilityTool(repo: ProvidersRepository): ToolDefinition<typeof GetDoctorAvailabilityArgsSchema> {
  return {
    name: TOOL_NAMES.getDoctorAvailability,
    description: 'Get open appointment slots for a doctor id returned by search_providers (next 14 days max).',
    schema: GetDoctorAvailabilityArgsSchema,
    terminal: false,
    handler: async ({ doctorId, fromDate, days }) => {
      if (!(await repo.doctorExists(doctorId))) return fail('NOT_FOUND', `No doctor with id "${doctorId}".`);
      const now = new Date();
      const requested = fromDate ? new Date(`${fromDate}T00:00:00Z`) : now;
      const from = requested < now ? now : requested; // never return past slots
      const window = Math.min(days ?? MAX_DAYS, MAX_DAYS);
      const to = new Date(from.getTime() + window * 86_400_000);
      const slots = await repo.findOpenSlots(doctorId, from, to, MAX_SLOTS);
      return ok({
        doctorId,
        slots: slots.map((s) => ({ slotId: s.id, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
        note: slots.length ? undefined : `No open slots in the next ${window} days.`,
      });
    },
  };
}
