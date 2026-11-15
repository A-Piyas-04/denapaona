import { coercePaisa, formatTourTaka } from './tourMoney';

export type HistoryKind = 'tour_created' | 'member_joined' | 'expense_added';

export interface HistoryEvent {
  at: string;
  actor: string;
  kind: HistoryKind;
  summary: string;
  detail?: string;
}

export interface TourHistoryRaw {
  tourName: string;
  createdBy: string;
  createdAt: string;
  members: {
    userId: string;
    name: string;
    role: 'owner' | 'leader' | 'member';
    joinedAt: string;
  }[];
  expenses: {
    title: string;
    amount_paisa: number | string;
    participant_ids: string[];
    contributions: { user_id: string; amount_paisa: number | string }[];
    created_by: string;
    created_at: string;
    split_mode?: 'equal' | 'individual' | null;
    shares?: { user_id: string; amount_paisa: number | string }[] | null;
  }[];
}

export function buildTourHistory(raw: TourHistoryRaw): {
  tourName: string;
  events: HistoryEvent[];
} {
  const nameById = new Map(raw.members.map((m) => [m.userId, m.name]));
  const roleById = new Map(raw.members.map((m) => [m.userId, m.role]));
  const nameOf = (id: string) => nameById.get(id) ?? 'Former member';

  const events: HistoryEvent[] = [];

  events.push({
    at: raw.createdAt,
    actor: nameOf(raw.createdBy),
    kind: 'tour_created',
    summary: `Created the tour "${raw.tourName}"`,
    detail: 'Became the owner',
  });

  for (const m of raw.members) {
    if (m.userId === raw.createdBy) continue;
    const role = roleById.get(m.userId) ?? 'member';
    events.push({
      at: m.joinedAt,
      actor: m.name,
      kind: 'member_joined',
      summary: `${m.name} joined the tour`,
      detail: role === 'leader' ? 'Currently a secondary leader' : 'Currently a member',
    });
  }

  for (const e of raw.expenses) {
    const amount = coercePaisa(e.amount_paisa);
    const payerSummary = (e.contributions ?? [])
      .map((c) => `${nameOf(c.user_id)} (${formatTourTaka(coercePaisa(c.amount_paisa))})`)
      .join(', ');
    const individual = e.split_mode === 'individual';
    const sharedPart = individual
      ? `Individual bills: ${(e.shares ?? [])
          .map((s) => `${nameOf(s.user_id)} ${formatTourTaka(coercePaisa(s.amount_paisa))}`)
          .sort()
          .join(', ')}`
      : `${e.participant_ids.length} shared equally`;
    events.push({
      at: e.created_at,
      actor: nameOf(e.created_by),
      kind: 'expense_added',
      summary: `Recorded "${e.title}" — ${formatTourTaka(amount)}`,
      detail: `${sharedPart} · paid by ${payerSummary}`,
    });
  }

  events.sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : a.summary < b.summary ? -1 : a.summary > b.summary ? 1 : 0,
  );

  return { tourName: raw.tourName, events };
}
