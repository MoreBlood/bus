import { TripForm } from '@features/trip-form/TripForm';
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

export function TripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { members, viewer, loading } = useSession();
  const [trip, setTrip] = useState<Trip | null | undefined>(id ? undefined : null);
  const [last, setLast] = useState<Journal['lastOdometer'] | undefined>(id ? null : undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id)
      fetchTrip(id)
        .then(setTrip)
        .catch((e) => setError(errorText(e)));
    else
      fetchJournal()
        .then((j) => setLast(j.lastOdometer))
        .catch(() => setLast(null));
  }, [id]);

  const back = (fresh?: string, year?: string) =>
    navigate(year && year !== String(new Date().getFullYear()) ? `/?year=${year}` : '/', {
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

  const ready = !loading && trip !== undefined && last !== undefined;
  return (
    <>
      <Topbar
        section={id ? (trip ? `Поездка ${longDate(trip.date)}` : 'Поездка') : 'Новая поездка'}
        back="/"
      />
      <div className="page">
        {id && trip === undefined && error ? (
          <div className="notice notice--error" role="alert" style={{ marginTop: 20 }}>
            <span>{error}</span>
          </div>
        ) : ready ? (
          <TripForm
            trip={trip ?? undefined}
            last={last ?? null}
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
