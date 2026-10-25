/**
 * Bangla/English strings (§13.3: "can land late, but structure strings for it
 * from the start").  English is complete; Bangla covers the navigation and
 * headline vocabulary and falls back to English key-by-key.  Add keys here
 * rather than hard-coding new user-facing strings in components.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const en = {
  'app.name': 'HishebNama',
  'app.tagline': 'Who owes whom — and nothing changes without your agreement.',
  'auth.google': 'Continue with Google',
  'auth.signOut': 'Sign out',
  'nav.groups': 'Groups',
  'nav.inbox': 'Inbox',
  'nav.me': 'Me',
  'groups.title': 'Your groups',
  'groups.new': 'New group',
  'groups.haveInvite': 'I have an invite link',
  'groups.empty.title': 'No groups yet',
  'groups.empty.body': 'A group is a shared ledger for friends who spend together — a hall, a flat, a trip crew.',
  'balance.allSettled': 'All settled',
  'balance.youOwe': 'You owe',
  'balance.youreOwed': "You're owed",
  'balance.why': 'Why?',
  'action.addExpense': 'Add expense',
  'action.settleUp': 'Settle up',
  'action.transfer': 'Transfer a debt',
  'action.history': 'History',
  'action.trips': 'Trips',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.approve': 'Approve',
  'action.decline': 'Decline',
  'inbox.title': 'Needs your decision',
  'inbox.empty': 'Nothing needs you right now.',
  'trip.leader': 'Trip leader',
  'offline.banner': 'Showing saved data — you’re offline.',
} as const;

export type StringKey = keyof typeof en;

const bn: Partial<Record<StringKey, string>> = {
  'app.tagline': 'কে কার কাছে কত পাবে — আপনার সম্মতি ছাড়া কিছুই বদলায় না।',
  'auth.google': 'Google দিয়ে চালিয়ে যান',
  'auth.signOut': 'সাইন আউট',
  'nav.groups': 'গ্রুপ',
  'nav.inbox': 'ইনবক্স',
  'nav.me': 'আমি',
  'groups.title': 'আপনার গ্রুপগুলো',
  'groups.new': 'নতুন গ্রুপ',
  'groups.haveInvite': 'আমার কাছে আমন্ত্রণ লিংক আছে',
  'groups.empty.title': 'এখনো কোনো গ্রুপ নেই',
  'balance.allSettled': 'সব মিটে গেছে',
  'balance.youOwe': 'আপনি দেবেন',
  'balance.youreOwed': 'আপনি পাবেন',
  'balance.why': 'কেন?',
  'action.addExpense': 'খরচ যোগ করুন',
  'action.settleUp': 'হিসাব মেটান',
  'action.transfer': 'দেনা স্থানান্তর',
  'action.history': 'ইতিহাস',
  'action.trips': 'ট্রিপ',
  'action.save': 'সংরক্ষণ',
  'action.cancel': 'বাতিল',
  'action.approve': 'অনুমোদন',
  'action.decline': 'প্রত্যাখ্যান',
  'inbox.title': 'আপনার সিদ্ধান্ত দরকার',
  'inbox.empty': 'এখন আপনার কিছু করার নেই।',
  'trip.leader': 'ট্রিপ লিডার',
  'offline.banner': 'সংরক্ষিত তথ্য দেখানো হচ্ছে — আপনি অফলাইনে।',
};

export type Lang = 'en' | 'bn';

const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey) => string }>({
  lang: 'en',
  setLang: () => {},
  t: (k) => en[k],
});

function readLang(): Lang {
  try {
    return localStorage.getItem('hn.lang') === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('hn.lang', l); } catch { /* private mode */ }
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((k: StringKey) => (lang === 'bn' ? bn[k] ?? en[k] : en[k]), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;
