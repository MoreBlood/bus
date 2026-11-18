import { type TripPrefill, TripWizard } from '@features/trip-wizard/TripWizard';
import { createTrip, deleteTrip, errorText, updateTrip } from '@shared/api/client';
import { queries, useRefresh, useSettled } from '@shared/api/queries';
import type { TripInput } from '@shared/api/types';
import { longDate } from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@widgets/topbar/Topbar';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

type Step = 0 | 1 | 2 | 3;

export function TripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // «Записать эти км» из разрыва одометра: /trips/new?from=…&to=…&date=…
  const [params] = useSearchParams();
  const [prefill] = useState<TripPrefill | undefined>(() => {
    const from = Number(params.get('from'));
    const to = Number(params.get('to'));
    const date = params.get('date') ?? undefined;
    return !id && from > 0 && to > from
      ? {
          odoStart: from,
          odoEnd: to,
          date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
        }
      : undefined;
  });
  const { members, viewer, loading } = useSession();
  const refresh = useRefresh();
  const tripQ = useQuery({ ...queries.trip(id ?? ''), enabled: !!id });
  const loaded = useSettled(tripQ);
  const trip = id ? loaded : null;
  // ставки и последнее показание одометра — из журнала года поездки
  const year = trip?.date.slice(0, 4) ?? prefill?.date?.slice(0, 4);
  const journalQ = useQuery({ ...queries.journal(year), enabled: !id || !!year });
  const journal = useSettled(journalQ);
  const [step, setStep] = useState<Step>(id ? 3 : 0);
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const failed = [tripQ, journalQ].find((x) => x.error && !x.data)?.error;
  const error = actionError ?? (failed ? errorText(failed) : null);

  const back = (fresh?: string, y?: string) => {
    refresh();
    navigate(y && y !== String(new Date().getFullYear()) ? `/?year=${y}` : '/', {
      state: fresh ? { fresh } : null,
    });
  };

  const submit = async (input: TripInput) => {
    setBusy(true);
    setError(null);
    try {
      if (trip) {
        await updateTrip(trip.id, input);
        back(trip.id, input.date.slice(0, 4));
      } else {
        const r = await createTrip(input);
        back(r.id, input.date.slice(0, 4));
      }
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!trip) return;
    setBusy(true);
    try {
      await deleteTrip(trip.id);
      back(undefined, trip.date.slice(0, 4));
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  // «назад» в полосе: на первом шаге (или из проверки готовой поездки) — в журнал, иначе — на шаг назад
  const onBack = id
    ? step === 3
      ? () => navigate(-1)
      : () => setStep(3)
    : step === 0
      ? () => navigate(-1)
      : () => setStep((step - 1) as Step);
  const ready = !loading && trip !== undefined && journal;
  return (
    <>
      <Topbar
        section={id ? (trip ? `Поездка ${longDate(trip.date)}` : 'Поездка') : 'Новая поездка'}
        back={onBack}
      />
      <div className="page">
        {!ready && error ? (
          <div className="notice notice--error" role="alert" style={{ marginTop: 20 }}>
            <span>{error}</span>
          </div>
        ) : ready ? (
          <TripWizard
            trip={trip ?? undefined}
            step={step}
            setStep={setStep}
            last={trip ? null : journal.lastOdometer}
            costs={journal}
            prefill={prefill}
            members={members}
            meId={viewer?.memberId ?? null}
            busy={busy}
            error={error}
            onSubmit={submit}
            onDelete={trip ? remove : undefined}
          />
        ) : (
          <div aria-busy aria-label="Загрузка" style={{ paddingTop: 20 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 96, marginTop: 16 }} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
