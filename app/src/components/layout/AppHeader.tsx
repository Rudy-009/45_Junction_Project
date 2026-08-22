import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { useI18n } from '@/lib/i18n';
import { useLanguageStore } from '@/store/languageStore';

export function AppHeader() {
  const { locale, t } = useI18n();
  const setLocale = useLanguageStore((state) => state.setLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <Link
        to="/"
        aria-label={t('nav.input')}
        className="brand-mono text-base tracking-[0.28em] hover:text-muted-foreground"
      >
        STANDBY
      </Link>

      <div className="flex items-center gap-2">
        <label className="flex h-8 items-center border border-border bg-background">
          <span className="sr-only">{t('nav.language')}</span>
          <select
            aria-label={t('nav.language')}
            value={locale}
            onChange={(event) => setLocale(event.target.value as 'ko' | 'en')}
            className="h-full bg-transparent px-2 text-xs"
          >
            <option value="ko">KOR</option>
            <option value="en">ENG</option>
          </select>
        </label>
        <nav className="flex h-8 items-stretch border border-border">
        <Link
          to="/"
          className="flex items-center px-4 text-xs text-foreground hover:bg-muted"
          activeOptions={{ exact: true }}
          activeProps={{ className: "!bg-foreground !text-background hover:!bg-foreground" }}
        >
          {t('nav.input')}
        </Link>
        <Link
          to="/workspace"
          className="flex items-center border-l border-border px-4 text-xs text-foreground hover:bg-muted"
          activeProps={{ className: "!bg-foreground !text-background hover:!bg-foreground" }}
        >
          {t('nav.workspace')}
        </Link>
        </nav>
      </div>
    </header>
  );
}
