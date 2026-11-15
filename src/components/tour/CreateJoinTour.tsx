import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input } from '@/components/ui';
import { tourErrorMessage, tourRpc } from '@/lib/tourRpc';

type Mode = 'menu' | 'create' | 'join';

export function CreateJoinTour() {
  const [mode, setMode] = useState<Mode>('menu');

  if (mode === 'create') return <CreateForm onBack={() => setMode('menu')} />;
  if (mode === 'join') return <JoinForm onBack={() => setMode('menu')} />;

  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => setMode('create')}
        className="pressable min-h-[72px] rounded-2xl border border-night-line/70 bg-paper px-5 py-4 text-left text-base font-semibold text-ink shadow-soft"
      >
        Create a Tour
        <span className="mt-1 block text-sm font-normal text-ink-soft">
          Start a new tour and get a join PIN to share.
        </span>
      </button>
      <button
        type="button"
        onClick={() => setMode('join')}
        className="pressable min-h-[72px] rounded-2xl border border-brand/30 bg-brand-muted px-5 py-4 text-left text-base font-semibold text-ink"
      >
        Join a Tour
        <span className="mt-1 block text-sm font-normal text-ink-soft">
          Enter the 8-digit PIN a friend shared with you.
        </span>
      </button>
    </div>
  );
}

function CreateForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const tourId = await tourRpc.create(name.trim(), pin);
      void qc.invalidateQueries({ queryKey: ['tours'] });
      navigate(`/tours/${tourId}/manage`);
    } catch (err) {
      setError(tourErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-night-line/70 bg-paper p-4 shadow-soft">
      <button type="button" onClick={onBack} className="justify-self-start text-sm font-semibold text-brand">
        ← Back
      </button>
      <Field label="Tour name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Cox's Bazar Tour"
          required
        />
      </Field>
      <Field label="Join PIN (8 digits)">
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          pattern="[0-9]{8}"
          placeholder="12345678"
          className="text-center text-2xl tracking-[0.3em]"
          required
        />
      </Field>
      {error && <p className="text-sm text-owe">{error}</p>}
      <Button type="submit" block size="lg" disabled={busy || pin.length !== 8 || name.trim() === ''}>
        {busy ? 'Creating…' : 'Create Tour'}
      </Button>
    </form>
  );
}

function JoinForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const tourId = await tourRpc.join(pin);
      void qc.invalidateQueries({ queryKey: ['tours'] });
      navigate(`/tours/${tourId}`);
    } catch (err) {
      setError(tourErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-night-line/70 bg-paper p-4 shadow-soft">
      <button type="button" onClick={onBack} className="justify-self-start text-sm font-semibold text-brand">
        ← Back
      </button>
      <Field label="Join PIN">
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          pattern="[0-9]{8}"
          autoFocus
          placeholder="12345678"
          className="text-center text-2xl tracking-[0.3em]"
          required
        />
      </Field>
      {error && <p className="text-sm text-owe">{error}</p>}
      <Button type="submit" block size="lg" disabled={busy || pin.length !== 8}>
        {busy ? 'Joining…' : 'Join Tour'}
      </Button>
    </form>
  );
}
