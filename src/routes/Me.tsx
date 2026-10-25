import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, SectionTitle } from '@/components/AppShell';
import { Avatar, Button, Card, Field, Input, Segmented } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth, useMe } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { useI18n, type Lang } from '@/lib/i18n';
import type { Profile } from '@/lib/types';

export function Me() {
  const me = useMe();
  const { signOut } = useAuth();
  const { lang, setLang, t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ['profile', me],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', me).single();
      if (error) throw error;
      return data as Profile;
    },
  });
  const [name, setName] = useState('');
  useEffect(() => { if (profile.data) setName(profile.data.display_name); }, [profile.data]);
  const [busy, setBusy] = useState(false);

  return (
    <AppShell title={t('nav.me')}>
      {profile.data && (
        <Card className="flex items-center gap-3">
          <Avatar name={profile.data.display_name} url={profile.data.avatar_url} size={48} />
          <div className="min-w-0">
            <p className="truncate font-medium">{profile.data.display_name}</p>
            <p className="truncate text-sm text-slate-500">{profile.data.email}</p>
          </div>
        </Card>
      )}

      <SectionTitle>Your name</SectionTitle>
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        // profiles_update_own: a user may rename only themselves (§12.4).
        const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', me);
        setBusy(false);
        if (error) toast(errorMessage(error), 'error');
        else { toast('Saved'); void qc.invalidateQueries(); }
      }}>
        <Field label="Shown to your groups" htmlFor="display-name">
          <Input id="display-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button size="sm" type="submit" busy={busy} disabled={!name.trim() || name === profile.data?.display_name}>Save</Button>
      </form>

      <SectionTitle>Language</SectionTitle>
      <Segmented<Lang> label="Language" value={lang} onChange={setLang}
                       options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />

      <SectionTitle>Notifications</SectionTitle>
      <Card className="text-sm text-slate-600">
        The <strong>Inbox</strong> badge always shows what needs your decision, and each group shows what changed since
        your last visit. Push and email notifications aren’t switched on yet. On iPhone, push will need “Add to Home Screen” first.
      </Card>

      <div className="mt-8"><Button variant="outline" block onClick={signOut}>{t('auth.signOut')}</Button></div>
    </AppShell>
  );
}
