import { TripWizard } from '@features/trip-wizard/TripWizard';
import {
  createTrip,
  deleteTrip,
  errorText,
  fetchJournal,
  fetchTrip,
  updateTrip,
} from '@shared/api/client';
import type { Journal, Trip, TripInput } from '@shared/api/types';
import { longDate } from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { Topbar } from '@widgets/topbar/Topbar';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

type Step = 0 | 1 | 2 | 3;

export function TripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { members, viewer, loading } = useSession();
  const [trip, setTrip] = useState<Trip | null | undefined>(id ? undefined : null);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [step, setStep] = useState<Step>(id ? 3 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id)
      fetchTrip(id)
        .then(setTrip)
        .catch((e) => setError(errorText(e)));
  }, [id]);
  // ставки и последнее показание одометра — из журнала года поездки
  const year = trip?.date.slice(0, 4);
  useEffect(() => {
    if (id && !year) return;
    fetchJournal(year)
      .then(setJournal)
      .catch((e) => setError(errorText(e)));
  }, [id, year]);

  const back = (fresh?: string, y?: string) =>
    navigate(y && y !== String(new Date().getFullYear()) ? `/?year=${y}` : '/', {
      state: fresh ? { fresh } : null,
    });

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
        {id && trip === undefined && error ? (
          <div className="notice notice--error" role="alert" style={{ marginTop: 20 }}>
            <span>{error}</span>
          </div>
        ) : ready ? (
          <TripWizard
            trip={trip ?? undefined}
            step={step}
            setStep={setStep}
            last={trip ? null : journal.lastOdometer}
            rates={journal.rates}
            fuelMode={journal.settings.fuelMode}
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
