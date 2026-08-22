import { create } from 'zustand';
import type { Locale } from '@/lib/i18n';

const STORAGE_KEY = 'standby.locale';

function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'ko';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'ko' || stored === 'en') return stored;
  return window.navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

type LanguageStore = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useLanguageStore = create<LanguageStore>((set) => ({
  locale: initialLocale(),
  setLocale: (locale) => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    set({ locale });
  },
}));
