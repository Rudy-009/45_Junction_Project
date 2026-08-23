import { useNavigate } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useReviewFlowStore } from '@/store';

export function ReviewModeScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const setMode = useReviewFlowStore((state) => state.setMode);
  const normalizerStatus = useReviewFlowStore((state) => state.normalizerStatus);
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
          <h1 className="text-2xl font-medium">{t('review.modePageTitle')}</h1>
          {normalizerStatus === 'LOADING' && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {t('review.normalizerBackground')}
            </p>
          )}
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            className="border border-border bg-surface p-6 text-left transition hover:bg-muted"
            onClick={() => goToReview('RECOMMENDED')}
          >
            <span className="inline-flex border border-review bg-review-bg px-3 py-2 text-base text-review">
              {t('review.recommended')}
            </span>
          </button>

          <button
            type="button"
            className="border border-border bg-surface p-6 text-left transition hover:bg-muted"
            onClick={() => goToReview('CUSTOM')}
          >
            <span className="inline-flex border border-consistent bg-consistent-bg px-3 py-2 text-base text-consistent">
              {t('review.custom')}
            </span>
          </button>
        </section>
      </div>
    </main>
  );
}
