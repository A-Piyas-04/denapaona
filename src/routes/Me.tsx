import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Compass, Languages, LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Avatar, Button, Field, IconTile, Input, ListGroup, ListRow, Section, Segmented, Sheet, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth, useMe } from '@/hooks/useAuth';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { useTour } from '@/tour/TourProvider';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { useI18n, type Lang } from '@/lib/i18n';
import type { Profile } from '@/lib/types';

type Open = null | 'name' | 'language' | 'theme' | 'notifications' | 'signout';

export function Me() {
  const me = useMe();
  const { signOut } = useAuth();
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const tour = useTour();
  const [open, setOpen] = useState<Open>(null);
  const profile = useQuery({
    queryKey: ['profile', me],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', me).single();
      if (error) throw error;
      return data as Profile;
    },
  });
  const close = () => setOpen(null);

  return (
    <AppShell title={t('nav.me')}>
      {profile.data ? (
        <div className="flex items-center gap-4 rounded-3xl border border-night-line/60 bg-paper px-5 py-5 text-ink shadow-soft">
          <Avatar name={profile.data.display_name} url={profile.data.avatar_url} seed={me} size={60} />
          <div className="min-w-0">
            <p className="truncate font-display text-[20px] font-semibold text-ink">{profile.data.display_name}</p>
            <p className="mt-0.5 truncate text-[14px] text-ink-soft">{profile.data.email}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-3xl border border-night-line/60 bg-paper px-5 py-5 shadow-soft" aria-busy>
          <Skeleton className="h-[60px] w-[60px] rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
      )}

      <Section title={t('me.account')}>
        <ListGroup>
          <ListRow onClick={() => setOpen('name')} chevron leading={<IconTile><UserRound size={20} /></IconTile>}
                   title={t('me.name')} trailing={<span className="text-[15px] text-ink-soft">{profile.data?.display_name}</span>} />
          <ListRow onClick={() => setOpen('language')} chevron leading={<IconTile><Languages size={20} /></IconTile>}
                   title={t('me.language')} trailing={<span className="text-[15px] text-ink-soft">{lang === 'bn' ? 'বাংলা' : 'English'}</span>} />
          <ListRow
            onClick={() => setOpen('theme')}
            chevron
            leading={<IconTile tone="brand">{theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}</IconTile>}
            title={t('me.theme')}
            trailing={<span className="text-[15px] text-ink-soft">{theme === 'dark' ? t('me.theme.dark') : t('me.theme.light')}</span>}
          />
        </ListGroup>
      </Section>

      <Section title={t('me.help')}>
        <ListGroup>
          <ListRow onClick={() => tour.start()} chevron data-tour="replay-tour"
                   leading={<IconTile tone="brand"><Compass size={20} /></IconTile>} title={t('me.tour')} subtitle="A two-minute walkthrough" />
          <ListRow onClick={() => setOpen('notifications')} chevron leading={<IconTile><Bell size={20} /></IconTile>}
                   title={t('me.notifications')} subtitle="Inbox badge is on" />
        </ListGroup>
      </Section>

      <ListGroup>
        <ListRow onClick={() => setOpen('signout')} tone="danger" leading={<IconTile tone="owe"><LogOut size={20} /></IconTile>} title={t('auth.signOut')} />
      </ListGroup>

      <NameSheet open={open === 'name'} onClose={close} me={me} current={profile.data?.display_name ?? ''} />

      <Sheet open={open === 'language'} onClose={close} title={t('me.language')}
             footer={<Button block onClick={close}>Done</Button>}>
        <Segmented<Lang> label="Language" value={lang} onChange={setLang}
                         options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />
        <p className="mt-3 text-[13px] text-ink-soft">Bangla covers the main screens. The rest stays in English.</p>
      </Sheet>

      <Sheet open={open === 'theme'} onClose={close} title={t('me.theme')}
             footer={<Button block onClick={close}>Done</Button>}>
        <Segmented<Theme>
          label={t('me.theme')}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: t('me.theme.light') },
            { value: 'dark', label: t('me.theme.dark') },
          ]}
        />
        <p className="mt-3 text-[13px] text-ink-soft">Light and dark each use one surface family — no mixed cards.</p>
      </Sheet>

      <Sheet open={open === 'notifications'} onClose={close} title={t('me.notifications')}
             footer={<Button block variant="secondary" onClick={close}>Got it</Button>}>
        <div className="space-y-3 text-[15px] leading-relaxed text-ink-soft">
          <p>The Inbox badge shows what needs your decision. Each group shows what changed since your last visit.</p>
          <p>Push and email notifications aren’t on yet. On iPhone, push will need “Add to Home Screen” first.</p>
        </div>
      </Sheet>

      <Sheet open={open === 'signout'} onClose={close} title="Sign out?"
             footer={
               <div className="grid grid-cols-2 gap-2">
                 <Button variant="secondary" onClick={close}>Cancel</Button>
                 <Button variant="danger" onClick={signOut}>Sign out</Button>
               </div>
             }>
        <p className="text-[15px] text-ink-soft">Your groups and balances stay as they are.</p>
      </Sheet>
    </AppShell>
  );
}

function NameSheet({ open, onClose, me, current }: { open: boolean; onClose: () => void; me: string; current: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(current); }, [open, current]);
  return (
    <Sheet open={open} onClose={onClose} title="Display name">
      <form className="space-y-5" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', me);
        setBusy(false);
        if (error) toast(errorMessage(error), 'error');
        else { toast('Name saved'); void qc.invalidateQueries(); onClose(); }
      }}>
        <Field label="Shown to your groups" htmlFor="display-name">
          <Input id="display-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" block size="lg" busy={busy} disabled={!name.trim() || name === current}>Save name</Button>
      </form>
    </Sheet>
  );
}
