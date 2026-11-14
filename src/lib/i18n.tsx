/**
 * Bangla/English strings (§13.3: "can land late, but structure strings for it
 * from the start").  English is complete; Bangla covers the navigation and
 * headline vocabulary and falls back to English key-by-key.  Add keys here
 * rather than hard-coding new user-facing strings in components.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const en = {
  'app.name': 'দেনা পাওনা',
  'app.nameRoman': 'Dena Pauna',
  'app.tagline': 'Shared spending, settled fairly. Nothing changes without your OK.',
  'auth.google': 'Continue with Google',
  'auth.signOut': 'Sign out',
  'nav.groups': 'Groups',
  'nav.inbox': 'Inbox',
  'nav.me': 'Me',
  'groups.title': 'Groups',
  'groups.new': 'New group',
  'groups.yours': 'Your groups',
  'groups.haveInvite': 'Join with an invite link',
  'groups.empty.title': 'No groups yet',
  'groups.empty.body': 'A group is a shared ledger for a flat, a hall or a trip crew.',
  'groups.subtitle.give': 'You need to give',
  'groups.subtitle.get': "You're supposed to get",
  'groups.subtitle.none': 'All square',
  'balance.allSettled': 'All settled',
  'balance.youNeedToGive': 'You need to give',
  'balance.youAreSupposedToGet': "You're supposed to get",
  'balance.nobody': 'Nobody needs to give or get anything here.',
  'balance.history': 'History',
  'balance.why': 'History',
  // Kept as aliases so older call sites keep working until fully migrated.
  'balance.youOwe': 'You need to give',
  'balance.youreOwed': "You're supposed to get",
  'action.addExpense': 'Add expense',
  'action.settleUp': 'Settle up',
  'action.transfer': 'Transfer',
  'action.history': 'History',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.approve': 'Approve',
  'action.decline': 'Decline',
  'settle.title': 'Settle up',
  'settle.full': 'Settle all',
  'settle.partial': 'Partial amount',
  'settle.send': 'Send for approval',
  'settle.hintGive': 'They confirm they got this from you.',
  'settle.hintGet': 'They confirm they gave you this.',
  'transfer.pickGive': 'Who should get this instead?',
  'transfer.pickGet': 'Who can take this over?',
  'transfer.empty': 'No one else fits for a transfer right now.',
  'transfer.send': 'Send for approval',
  'inbox.title': 'Inbox',
  'inbox.forYou': 'For you',
  'inbox.sent': 'Sent',
  'inbox.empty': 'Nothing needs you right now.',
  'offline.banner': 'You’re offline. Showing saved data.',
  'me.account': 'Account',
  'me.help': 'Help',
  'me.name': 'Display name',
  'me.language': 'Language',
  'me.tour': 'Replay app tour',
  'me.notifications': 'Notifications',
} as const;

export type StringKey = keyof typeof en;

const bn: Partial<Record<StringKey, string>> = {
  'app.name': 'দেনা পাওনা',
  'app.nameRoman': 'Dena Pauna',
  'app.tagline': 'যৌথ খরচ, ন্যায্য হিসাব। আপনার সম্মতি ছাড়া কিছুই বদলায় না।',
  'auth.google': 'Google দিয়ে চালিয়ে যান',
  'auth.signOut': 'সাইন আউট',
  'nav.groups': 'গ্রুপ',
  'nav.inbox': 'ইনবক্স',
  'nav.me': 'আমি',
  'groups.title': 'গ্রুপ',
  'groups.new': 'নতুন গ্রুপ',
  'groups.yours': 'আপনার গ্রুপগুলো',
  'groups.haveInvite': 'আমন্ত্রণ লিংক দিয়ে যোগ দিন',
  'groups.empty.title': 'এখনো কোনো গ্রুপ নেই',
  'groups.subtitle.give': 'আপনাকে দিতে হবে',
  'groups.subtitle.get': 'আপনি পাবেন',
  'groups.subtitle.none': 'সব মিটে গেছে',
  'balance.allSettled': 'সব মিটে গেছে',
  'balance.youNeedToGive': 'আপনাকে দিতে হবে',
  'balance.youAreSupposedToGet': 'আপনি পাবেন',
  'balance.nobody': 'এখানে কাউকে দিতে বা পেতে হবে না।',
  'balance.history': 'ইতিহাস',
  'balance.why': 'ইতিহাস',
  'balance.youOwe': 'আপনাকে দিতে হবে',
  'balance.youreOwed': 'আপনি পাবেন',
  'action.addExpense': 'খরচ যোগ করুন',
  'action.settleUp': 'হিসাব মেটান',
  'action.transfer': 'স্থানান্তর',
  'action.history': 'ইতিহাস',
  'action.save': 'সংরক্ষণ',
  'action.cancel': 'বাতিল',
  'action.approve': 'অনুমোদন',
  'action.decline': 'প্রত্যাখ্যান',
  'settle.title': 'হিসাব মেটান',
  'settle.full': 'সব মেটান',
  'settle.partial': 'আংশিক পরিমাণ',
  'settle.send': 'অনুমোদনের জন্য পাঠান',
  'settle.hintGive': 'তারা নিশ্চিত করবে আপনি দিয়েছেন।',
  'settle.hintGet': 'তারা নিশ্চিত করবে তারা দিয়েছে।',
  'transfer.pickGive': 'এর বদলে কে পাবে?',
  'transfer.pickGet': 'কে এটা নিয়ে নিতে পারে?',
  'transfer.empty': 'এখন স্থানান্তরের মতো কেউ নেই।',
  'transfer.send': 'অনুমোদনের জন্য পাঠান',
  'inbox.title': 'ইনবক্স',
  'inbox.forYou': 'আপনার জন্য',
  'inbox.sent': 'পাঠানো',
  'inbox.empty': 'এখন আপনার কিছু করার নেই।',
  'offline.banner': 'আপনি অফলাইনে। সংরক্ষিত তথ্য দেখানো হচ্ছে।',
  'me.account': 'অ্যাকাউন্ট',
  'me.help': 'সাহায্য',
  'me.name': 'প্রদর্শিত নাম',
  'me.language': 'ভাষা',
  'me.tour': 'অ্যাপ ট্যুর আবার দেখুন',
  'me.notifications': 'নোটিফিকেশন',
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
