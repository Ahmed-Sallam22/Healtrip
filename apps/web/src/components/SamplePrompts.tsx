import type { Locale } from '@healtrip/shared';
import type { Dictionary } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

/** Prompt text is fixed (demo scenarios); only the button labels are localized. */
const SAMPLES: { key: keyof Dictionary['empty']['samples']; text: string; locale: Locale }[] = [
  {
    key: 'chestPain',
    locale: 'en',
    text: "I have chest pain and I'm not sure whether I should see a cardiologist, go to the ER, or seek a second opinion.",
  },
  {
    key: 'kneeSecondOpinion',
    locale: 'ar',
    text: 'نصحني طبيب بإجراء عملية في الركبة، وأريد رأيًا طبيًا ثانيًا قبل أن أقرر. أنا في الجيزة.',
  },
  {
    key: 'istanbulCheckup',
    locale: 'en',
    text: "I'm travelling to Istanbul next month and need a cardiologist check-up. My budget is under $80 and I speak English.",
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
    <section className="py-8 text-center">
      <h2 className="text-lg font-semibold">{t.empty.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{t.empty.subtitle}</p>
      <ul className="mx-auto mt-4 grid max-w-xl gap-2">
        {SAMPLES.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s.text, s.locale)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-start text-sm hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              <span className="block font-medium">{t.empty.samples[s.key]}</span>
              <span className="mt-0.5 block text-xs text-slate-500" lang={s.locale} dir="auto">
                {s.text}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
