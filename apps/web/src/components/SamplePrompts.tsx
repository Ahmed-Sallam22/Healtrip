import type { Locale } from '@healtrip/shared';
import type { Dictionary } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { ArrowIcon, HeartPulseIcon, LogoIcon, PlaneIcon, StethoscopeIcon } from './icons';

/** Prompt text is fixed (demo scenarios); only the button labels are localized. */
const SAMPLES: {
  key: keyof Dictionary['empty']['samples'];
  text: string;
  locale: Locale;
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  tone: string;
}[] = [
  {
    key: 'chestPain',
    locale: 'en',
    text: "I have chest pain and I'm not sure whether I should see a cardiologist, go to the ER, or seek a second opinion.",
    Icon: HeartPulseIcon,
    tone: 'bg-rose-50 text-rose-600 ring-rose-100',
  },
  {
    key: 'kneeSecondOpinion',
    locale: 'ar',
    text: 'نصحني طبيب بإجراء عملية في الركبة، وأريد رأيًا طبيًا ثانيًا قبل أن أقرر. أنا في الجيزة.',
    Icon: StethoscopeIcon,
    tone: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  },
  {
    key: 'istanbulCheckup',
    locale: 'en',
    text: "I'm travelling to Istanbul next month and need a cardiologist check-up. My budget is under $80 and I speak English.",
    Icon: PlaneIcon,
    tone: 'bg-sky-50 text-sky-600 ring-sky-100',
  },
];

export function SamplePrompts({
  onPick,
  disabled,
}: {
  onPick: (text: string, locale: Locale) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <section className="animate-fade-up py-8 text-center sm:py-12">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-3xl text-white shadow-lg shadow-blue-600/25">
        <LogoIcon />
      </span>
      <p className="mt-4 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
        {t.header.prototypeBadge}
      </p>
      <h2 className="mx-auto mt-3 max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">{t.empty.title}</h2>
      <p className="mt-2 text-sm text-slate-600">{t.empty.subtitle}</p>
      <ul className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
        {SAMPLES.map(({ key, text, locale, Icon, tone }) => (
          <li key={key} className="flex">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(text, locale)}
              className="group flex w-full flex-col rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ring-1 ${tone}`}>
                <Icon />
              </span>
              <span className="mt-3 block text-sm font-semibold leading-snug">{t.empty.samples[key]}</span>
              <span className="mt-1 line-clamp-3 block text-xs text-slate-500" lang={locale} dir="auto">
                {text}
              </span>
              <ArrowIcon className="mt-auto self-end pt-2 text-2xl text-slate-300 transition group-hover:text-blue-500 rtl:-scale-x-100" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-slate-400">{t.empty.autoLanguage}</p>
    </section>
  );
}
