import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui';
import { ErrorState, ScreenSkeleton } from '@/components/States';
import { Taka } from '@/components/Money';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { useMe } from '@/hooks/useAuth';

/** Accept a claim invite link created from Home → Record a balance. */
export function ClaimInvite() {
  const { code = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['claimInvite', code],
    enabled: !!code,
    queryFn: () => rpc.previewClaimInvite(code),
  });

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await rpc.acceptClaimInvite(code);
      void qc.invalidateQueries({ queryKey: ['globalPairs'] });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      navigate('/home', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Balance invite" back="/home">
      {preview.isLoading ? (
        <ScreenSkeleton variant="form" />
      ) : preview.error ? (
        <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
      ) : preview.data ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-night-line/70 bg-paper p-5 shadow-soft">
            <p className="text-sm text-ink-soft">From</p>
            <p className="mt-1 text-lg font-semibold text-ink">{preview.data.proposer_name}</p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink">
              {preview.data.direction === 'get' ? (
                <>
                  They say you’re supposed to give them{' '}
                  <Taka poisha={preview.data.amount_poisha} className="font-semibold text-owe" />.
                </>
              ) : (
                <>
                  They say they’re supposed to give you{' '}
                  <Taka poisha={preview.data.amount_poisha} className="font-semibold text-owed" />.
                </>
              )}
            </p>
            {preview.data.note && (
              <p className="mt-2 text-sm text-ink-soft">“{preview.data.note}”</p>
            )}
          </div>

          {preview.data.proposer_id === me ? (
            <p className="text-sm text-ink-soft">This is your own invite. Share it with the other person.</p>
          ) : preview.data.already_redeemed ? (
            <p className="text-sm text-owe">This invite was already used or has expired.</p>
          ) : (
            <>
              {error && <p className="text-sm text-owe">{error}</p>}
              <Button block size="lg" busy={busy} onClick={() => void accept()}>
                Confirm and add to ledger
              </Button>
              <Button block variant="ghost" onClick={() => navigate('/home')}>
                Cancel
              </Button>
            </>
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
