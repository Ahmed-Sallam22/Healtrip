import { type DoctorCard, type HospitalCard, type Locale, normalizeCity, type ProviderCard } from '@healtrip/shared';
import { format, intlLocale } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

function Badge({ children, tone }: { children: React.ReactNode; tone: 'blue' | 'green' | 'red' | 'slate' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-800 ring-blue-200',
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}

function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function formatSlot(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function DoctorView({ card }: { card: DoctorCard }) {
  const { locale, t } = useI18n();
  const loc = intlLocale(locale);
  const fee = new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    card.consultationFeeUsd,
  );
  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">{t.provider.doctor}</p>
        <h4 className="font-semibold">{card.name}</h4>
        <p className="text-sm text-slate-600">
          {card.specialty.name} · {card.hospital.name}, {cityName(card.hospital.city, locale)}
        </p>
      </header>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">{t.provider.fee}</dt>
        <dd>{fee}</dd>
        <dt className="text-slate-500">{t.provider.rating}</dt>
        <dd>{new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(card.rating)} / 5</dd>
        <dt className="text-slate-500">{t.provider.languages}</dt>
        <dd>{card.languages.map((l) => languageName(l, loc)).join(', ')}</dd>
        <dt className="text-slate-500">{t.provider.nextSlot}</dt>
        <dd>{card.nextAvailableSlot ? formatSlot(card.nextAvailableSlot, loc) : t.provider.noSlot}</dd>
      </dl>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone="slate">{format(t.provider.experience, { years: card.yearsExperience })}</Badge>
        {card.offersSecondOpinion && <Badge tone="blue">{t.provider.secondOpinion}</Badge>}
        {card.offersTelemedicine && <Badge tone="green">{t.provider.telemedicine}</Badge>}
      </div>
    </>
  );
}

function HospitalView({ card }: { card: HospitalCard }) {
  const { locale, t } = useI18n();
  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">{t.provider.hospital}</p>
        <h4 className="font-semibold">{card.name}</h4>
        <p className="text-sm text-slate-600">{cityName(card.city, locale)}</p>
      </header>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {card.accreditation && (
          <>
            <dt className="text-slate-500">{t.provider.accreditation}</dt>
            <dd>{card.accreditation}</dd>
          </>
        )}
        <dt className="text-slate-500">{t.provider.phone}</dt>
        <dd>
          <a href={`tel:${card.phone.replace(/[^\d+]/g, '')}`} className="text-blue-700 underline" dir="ltr">
            {card.phone}
          </a>
        </dd>
      </dl>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {card.hasEmergency && <Badge tone="red">{t.provider.emergency}</Badge>}
        {card.is24h && <Badge tone="slate">{t.provider.open24h}</Badge>}
      </div>
    </>
  );
}

export function ProviderCardView({ card }: { card: ProviderCard }) {
  const { t } = useI18n();
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 text-start">
      {card.kind === 'doctor' ? <DoctorView card={card} /> : <HospitalView card={card} />}
      <p className="mt-2 text-sm text-slate-700">
        <span className="font-medium">{t.provider.matchReason}</span> {card.matchReason}
      </p>
    </article>
  );
}

/** DB stores canonical English city codes; show the localized name from the shared city table. */
function cityName(code: string, locale: Locale): string {
  const city = normalizeCity(code);
  return city ? (locale === 'ar' ? city.nameAr : city.nameEn) : code;
}
