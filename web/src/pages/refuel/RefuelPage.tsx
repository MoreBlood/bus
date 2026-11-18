import { RefuelWizard } from '@features/refuel-wizard/RefuelWizard';
import {
  createRefuel,
  deleteRefuel,
  errorText,
  fetchJournal,
  fetchRefuel,
  updateRefuel,
} from '@shared/api/client';
import type { Refuel, RefuelInput } from '@shared/api/types';
import { longDate } from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { Topbar } from '@widgets/topbar/Topbar';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function RefuelPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { members, viewer, loading } = useSession();
  const [refuel, setRefuel] = useState<Refuel | null | undefined>(id ? undefined : null);
  const [lastOdo, setLastOdo] = useState<number | null | undefined>(id ? null : undefined);
  const [step, setStep] = useState<0 | 1>(id ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id)
      fetchRefuel(id)
        .then(setRefuel)
        .catch((e) => setError(errorText(e)));
    else
      fetchJournal()
        .then((j) => setLastOdo(j.lastOdometer?.km ?? null))
        .catch(() => setLastOdo(null));
  }, [id]);

  const done = () => navigate('/money');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      done();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const submit = (input: RefuelInput) =>
    run(() => (refuel ? updateRefuel(refuel.id, input) : createRefuel(input)));

  const onBack = step === 0 || id ? () => navigate(-1) : () => setStep(0);
  const ready = !loading && refuel !== undefined && lastOdo !== undefined;
  return (
    <>
      <Topbar section={refuel ? `Заправка ${longDate(refuel.date)}` : 'Заправка'} back={onBack} />
      <div className="page">
        {id && refuel === undefined && error ? (
          <div className="notice notice--error" role="alert" style={{ marginTop: 20 }}>
            <span>{error}</span>
          </div>
        ) : ready ? (
          <RefuelWizard
            refuel={refuel ?? undefined}
            step={step}
            setStep={setStep}
            lastOdometer={lastOdo ?? null}
            members={members}
            meId={viewer?.memberId ?? null}
            busy={busy}
            error={error}
            onSubmit={submit}
            onDelete={refuel ? () => run(() => deleteRefuel(refuel.id)) : undefined}
          />
        ) : (
          <div
            aria-busy
            aria-label="Загрузка"
            className="skeleton"
            style={{ height: 240, marginTop: 20 }}
          />
        )}
      </div>
    </>
  );
}
