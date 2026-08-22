import { Waypoints } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useI18n } from '@/lib/i18n';
import { useReviewFlowStore } from '@/store';

export function ReviewModeScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const setMode = useReviewFlowStore((state) => state.setMode);
  const factsCount = useReviewFlowStore((state) => state.facts.length);
  const hasContext = useReviewFlowStore((state) =>
    Boolean(state.caseId) && state.facts.length > 0,
  );

  if (!hasContext) {
    return (
      <main className="mx-auto mt-16 max-w-5xl p-6 text-sm">
        <p>{t('input.error.noCase')}</p>
      </main>
    );
  }

  const goToReview = (mode: 'RECOMMENDED' | 'CUSTOM') => {
    setMode(mode);
    void navigate({ to: '/review' });
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header>
          <p className="mono text-[10px] text-muted-foreground">FACT REVIEW MODE</p>
          <h1 className="mt-2 text-2xl font-medium">{t('review.modePageTitle')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t('review.modePageDescription', { count: factsCount })}
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            className="border border-border bg-surface p-6 text-left transition hover:bg-muted"
            onClick={() => goToReview('RECOMMENDED')}
          >
            <div className="mb-4 inline-flex items-center gap-2 border border-review bg-review-bg px-2 py-1 text-xs text-review">
              <Waypoints className="h-3.5 w-3.5" /> {t('review.recommended')}
            </div>
            <p className="text-base font-medium">{t('review.recommendedTitle')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t('review.recommendedDescription')}</p>
          </button>

          <button
            type="button"
            className="border border-border bg-surface p-6 text-left transition hover:bg-muted"
            onClick={() => goToReview('CUSTOM')}
          >
            <div className="mb-4 inline-flex items-center gap-2 border border-consistent bg-consistent-bg px-2 py-1 text-xs text-consistent">
              <Waypoints className="h-3.5 w-3.5" /> {t('review.custom')}
            </div>
            <p className="text-base font-medium">{t('review.customTitle')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t('review.customDescription')}</p>
          </button>
        </section>
      </div>
    </main>
  );
}
