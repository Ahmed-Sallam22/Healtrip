import { type DoctorCard, type HospitalCard, type Locale, normalizeCity, type ProviderCard } from '@healtrip/shared';
import { format, intlLocale } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { BuildingIcon, PhoneIcon, StarIcon } from './icons';

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
  // Template rather than Intl currency: ar locales render "US$", which garbles inside RTL text.
  const fee = format(t.provider.feeAmount, { amount: new Intl.NumberFormat(loc).format(card.consultationFeeUsd) });
  return (
    <>
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 text-sm font-semibold text-blue-700"
        >
          {initials(card.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t.provider.doctor}</p>
          <h4 className="font-semibold leading-snug" dir="auto">{card.name}</h4>
          <p className="text-sm text-slate-500" dir="auto">
            {card.specialty.name} · {card.hospital.name}
            {locale === 'ar' ? '، ' : ', '}
            {cityName(card.hospital.city, locale)}
          </p>
        </div>
      </header>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
        <div>
          <p className="text-[11px] text-slate-500">{t.provider.fee}</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{fee}</p>
        </div>
        <div className="text-end">
          <p className="text-[11px] text-slate-500">{t.provider.rating}</p>
          <p className="inline-flex items-center gap-1 font-semibold tabular-nums">
            <StarIcon className="text-amber-400" />
            {new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(card.rating)}
            <span className="text-xs font-normal text-slate-400">/ {new Intl.NumberFormat(loc).format(5)}</span>
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">{t.provider.languages}</dt>
        <dd>{card.languages.map((l) => languageName(l, loc)).join(locale === 'ar' ? '، ' : ', ')}</dd>
        <dt className="text-slate-500">{t.provider.nextSlot}</dt>
        <dd>{card.nextAvailableSlot ? formatSlot(card.nextAvailableSlot, loc) : t.provider.noSlot}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
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
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-100 to-orange-100 text-xl text-rose-600"
        >
          <BuildingIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t.provider.hospital}</p>
          <h4 className="font-semibold leading-snug" dir="auto">{card.name}</h4>
          <p className="text-sm text-slate-500">{cityName(card.city, locale)}</p>
        </div>
      </header>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {card.accreditation && (
          <>
            <dt className="text-slate-500">{t.provider.accreditation}</dt>
            <dd>{card.accreditation}</dd>
          </>
        )}
        <dt className="text-slate-500">{t.provider.phone}</dt>
        <dd>
          <a
            href={`tel:${card.phone.replace(/[^\d+]/g, '')}`}
            className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
            dir="ltr"
          >
            <PhoneIcon />
            {card.phone}
          </a>
        </dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.hasEmergency && <Badge tone="red">{t.provider.emergency}</Badge>}
        {card.is24h && <Badge tone="slate">{t.provider.open24h}</Badge>}
      </div>
    </>
  );
}

export function ProviderCardView({ card }: { card: ProviderCard }) {
  const { t } = useI18n();
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition hover:border-slate-300 hover:shadow-md">
      {card.kind === 'doctor' ? <DoctorView card={card} /> : <HospitalView card={card} />}
      {card.matchReason && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">{t.provider.matchReason}</span>{' '}
          <span dir="auto">{card.matchReason}</span>
        </p>
      )}
    </article>
  );
}

/** DB stores canonical English city codes; show the localized name from the shared city table. */
function cityName(code: string, locale: Locale): string {
  const city = normalizeCity(code);
  return city ? (locale === 'ar' ? city.nameAr : city.nameEn) : code;
}

function initials(name: string): string {
  const parts = name.replace(/^(Dr\.?|د\.)\s*/i, '').trim().split(/\s+/);
  return parts.slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();
}
