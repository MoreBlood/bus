import { RefuelWizard } from '@features/refuel-wizard/RefuelWizard';
import { createRefuel, deleteRefuel, errorText, updateRefuel } from '@shared/api/client';
import { queries, useRefresh, useSettled } from '@shared/api/queries';
import type { RefuelInput } from '@shared/api/types';
import { longDate } from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@widgets/topbar/Topbar';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function RefuelPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { members, viewer, loading } = useSession();
  const refresh = useRefresh();
  const refuelQ = useQuery({ ...queries.refuel(id ?? ''), enabled: !!id });
  const loaded = useSettled(refuelQ);
  const refuel = id ? loaded : null;
  // последнее показание одометра и чем заправляем (литры или кВт·ч); не загрузилось — без подсказки
  const journalQ = useQuery(queries.journal());
  const journal = useSettled(journalQ);
  const journalDone = journal !== undefined || (journalQ.isError && !journalQ.data);
  const lastOdo = journalDone ? (id ? null : (journal?.lastOdometer?.km ?? null)) : undefined;
  const fuelType = journal?.settings.fuelType ?? 'diesel';
  const [step, setStep] = useState<0 | 1>(id ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? (refuelQ.error && !refuelQ.data ? errorText(refuelQ.error) : null);

  const done = () => {
    refresh();
    navigate('/money');
  };
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
            fuelType={fuelType}
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
