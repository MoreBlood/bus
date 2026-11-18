import { RepairWizard } from '@features/repair-wizard/RepairWizard';
import { createRepair, deleteRepair, errorText, updateRepair } from '@shared/api/client';
import { queries, useRefresh, useSettled } from '@shared/api/queries';
import type { RepairInput } from '@shared/api/types';
import { longDate } from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@widgets/topbar/Topbar';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function RepairPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { members, viewer, loading } = useSession();
  const refresh = useRefresh();
  const repairQ = useQuery({ ...queries.repair(id ?? ''), enabled: !!id });
  const loaded = useSettled(repairQ);
  const repair = id ? loaded : null;
  // последнее показание одометра — только для новой записи; не загрузилось — поле пустое
  const journalQ = useQuery({ ...queries.journal(), enabled: !id });
  const journal = useSettled(journalQ);
  const lastOdo = id
    ? null
    : journal !== undefined || (journalQ.isError && !journalQ.data)
      ? (journal?.lastOdometer?.km ?? null)
      : undefined;
  // сколько в резерве — для подсказки «за чей счёт»; не загрузилось — просто без цифры
  const reserveLeft = useQuery(queries.money()).data?.reserve.left ?? null;
  const [step, setStep] = useState<0 | 1>(id ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? (repairQ.error && !repairQ.data ? errorText(repairQ.error) : null);

  const done = () => {
    refresh();
    navigate('/money#repairs-title');
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
  const submit = (input: RepairInput) =>
    run(() => (repair ? updateRepair(repair.id, input) : createRepair(input)));

  const onBack = step === 0 || id ? () => navigate(-1) : () => setStep(0);
  const ready = !loading && repair !== undefined && lastOdo !== undefined;
  return (
    <>
      <Topbar section={repair ? `Ремонт ${longDate(repair.date)}` : 'Ремонт и ТО'} back={onBack} />
      <div className="page">
        {id && repair === undefined && error ? (
          <div className="notice notice--error" role="alert" style={{ marginTop: 20 }}>
            <span>{error}</span>
          </div>
        ) : ready ? (
          <RepairWizard
            repair={repair ?? undefined}
            step={step}
            setStep={setStep}
            lastOdometer={lastOdo ?? null}
            reserveLeft={reserveLeft}
            members={members}
            meId={viewer?.memberId ?? null}
            busy={busy}
            error={error}
            onSubmit={submit}
            onDelete={repair ? () => run(() => deleteRepair(repair.id)) : undefined}
          />
        ) : (
          <div
            aria-busy
            aria-label="Загрузка"
            className="skeleton"
            style={{ height: 320, marginTop: 20 }}
          />
        )}
      </div>
    </>
  );
}
