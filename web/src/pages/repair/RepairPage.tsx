import { RepairWizard } from '@features/repair-wizard/RepairWizard';
import {
  createRepair,
  deleteRepair,
  errorText,
  fetchJournal,
  fetchMoney,
  fetchRepair,
  updateRepair,
} from '@shared/api/client';
import type { Repair, RepairInput } from '@shared/api/types';
import { longDate } from '@shared/lib/format';
import { useSession } from '@shared/model/session';
import { Topbar } from '@widgets/topbar/Topbar';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function RepairPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { members, viewer, loading } = useSession();
  const [repair, setRepair] = useState<Repair | null | undefined>(id ? undefined : null);
  const [lastOdo, setLastOdo] = useState<number | null | undefined>(id ? null : undefined);
  const [reserveLeft, setReserveLeft] = useState<number | null>(null);
  const [step, setStep] = useState<0 | 1>(id ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id)
      fetchRepair(id)
        .then(setRepair)
        .catch((e) => setError(errorText(e)));
    else
      fetchJournal()
        .then((j) => setLastOdo(j.lastOdometer?.km ?? null))
        .catch(() => setLastOdo(null));
    // сколько в резерве — для подсказки «за чей счёт»; не загрузилось — просто без цифры
    fetchMoney()
      .then((m) => setReserveLeft(m.reserve.left))
      .catch(() => {});
  }, [id]);

  const done = () => navigate('/money#repairs-title');
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
