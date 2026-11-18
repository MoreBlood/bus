// Список участников; админ правит строку на месте: имя, GitHub-логин, админ, активен.
import { Switch, TextField } from '@radix-ui/themes';
import { createMember, deleteMember, errorText, updateMember } from '@shared/api/client';
import type { Member, MemberInput, Viewer } from '@shared/api/types';
import { plural, shortDate, today } from '@shared/lib/format';
import { Pictogram } from '@shared/ui/Pictogram';
import { SignButton } from '@shared/ui/SignButton';
import { type FormEvent, useId, useState } from 'react';

function Tags({ m, meId }: { m: Member; meId: string | null }) {
  return (
    <>
      {m.id === meId && <span className="tag tag--yellow">вы</span>}
      {m.envAdmin ? (
        <span className="tag">главный админ</span>
      ) : (
        m.isAdmin && <span className="tag">админ</span>
      )}
      {!m.active && (
        <span className="tag tag--muted">
          {m.leftOn ? `выбыл с ${shortDate(m.leftOn)} ${m.leftOn.slice(0, 4)}` : 'выбыл'}
        </span>
      )}
    </>
  );
}

function Editor({
  member,
  viewer,
  onDone,
  onCancel,
}: {
  member?: Member;
  viewer: Viewer;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const ids = { name: useId(), login: useId(), left: useId(), joined: useId() };
  const self = !!member && member.id === viewer.memberId;
  const [name, setName] = useState(member?.name ?? '');
  const [login, setLogin] = useState(member?.githubLogin ?? '');
  const [isAdmin, setIsAdmin] = useState(member?.isAdmin ?? false);
  const [active, setActive] = useState(member?.active ?? true);
  const [leftOn, setLeftOn] = useState(member?.leftOn ?? today());
  const [joinedOn, setJoinedOn] = useState(member?.joinedOn ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const body: MemberInput = {
      name: name.trim(),
      githubLogin: login.trim().replace(/^@/, '') || null,
      isAdmin,
    };
    const left = { joinedOn: joinedOn || null, ...(active ? {} : { leftOn: leftOn || today() }) };
    if (member) run(() => updateMember(member.id, { ...body, active, ...left }));
    else run(() => createMember({ ...body, active, ...left }));
  };

  return (
    <form className="person__editor" onSubmit={save}>
      <div>
        <label className="field__label" htmlFor={ids.name}>
          Имя
        </label>
        <TextField.Root
          id={ids.name}
          className="text-input"
          size="3"
          value={name}
          maxLength={60}
          autoFocus={!member}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="field__label" htmlFor={ids.login}>
          GitHub-логин
        </label>
        <TextField.Root
          id={ids.login}
          className="text-input"
          size="3"
          value={login}
          placeholder="Пусто — без входа в приложение"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={self}
          onChange={(e) => setLogin(e.target.value)}
        >
          <TextField.Slot>@</TextField.Slot>
        </TextField.Root>
        <p className="field__hint">
          {self
            ? 'Свой логин меняет другой админ — иначе вы потеряете вход.'
            : 'С логином участник входит через GitHub и может подключить ассистента. Без логина за него записывают другие.'}
        </p>
      </div>
      <label className="switch-row">
        <span>
          Админ
          <small>
            {member?.envAdmin
              ? 'Главный админ — задан в настройках сервера'
              : 'Добавляет участников и выдаёт доступ'}
          </small>
        </span>
        <Switch
          size="3"
          color="gray"
          highContrast
          aria-label="Админ"
          checked={isAdmin || !!member?.envAdmin}
          disabled={self || member?.envAdmin}
          onCheckedChange={setIsAdmin}
        />
      </label>
      <div>
        <label className="field__label" htmlFor={ids.joined}>
          Совладелец с <span className="optional">— необязательно</span>
        </label>
        <TextField.Root
          id={ids.joined}
          className="date-input"
          type="date"
          size="3"
          max={today()}
          value={joinedOn}
          onChange={(e) => setJoinedOn(e.target.value)}
        />
        <p className="field__hint">
          Пусто — с самого начала. Раньше этой даты его не записать в поездки, и старые ремонты он
          не делит.
        </p>
      </div>
      <label className="switch-row">
        <span>
          Участвует
          <small>
            {member
              ? 'Выбывший не входит и не предлагается в новых поездках; история остаётся'
              : 'Выключите, если добавляете бывшего совладельца — для истории'}
          </small>
        </span>
        <Switch
          size="3"
          color="gray"
          highContrast
          aria-label="Участвует"
          checked={active}
          disabled={self}
          onCheckedChange={setActive}
        />
      </label>
      {!active && (
        <div>
          <label className="field__label" htmlFor={ids.left}>
            Не совладелец с
          </label>
          <TextField.Root
            id={ids.left}
            className="date-input"
            type="date"
            size="3"
            max={today()}
            value={leftOn}
            onChange={(e) => setLeftOn(e.target.value)}
          />
          <p className="field__hint">
            В поездки до этой даты его можно записывать — так заполняется история.
          </p>
        </div>
      )}

      {error && (
        <div className="notice notice--error" role="alert">
          <Pictogram name="warning" size={32} />
          <span>{error}</span>
        </div>
      )}
      <SignButton type="submit" size="md" loading={busy} disabled={!name.trim()}>
        {member ? 'Сохранить' : 'Добавить участника'}
      </SignButton>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="text-button" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
        {member && !self && member.trips === 0 && (
          <button
            type="button"
            className="text-button danger-link"
            disabled={busy}
            onClick={() => run(() => deleteMember(member.id))}
          >
            Удалить участника
          </button>
        )}
      </div>
    </form>
  );
}

export function MemberList({
  members,
  viewer,
  reload,
}: {
  members: Member[];
  viewer: Viewer;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const done = async () => {
    await reload();
    setEditing(null);
  };
  return (
    <>
      {viewer.isAdmin && (
        <div style={{ margin: '0 0 20px' }}>
          {editing === 'new' ? (
            <Editor viewer={viewer} onDone={done} onCancel={() => setEditing(null)} />
          ) : (
            <SignButton size="md" icon="plus" onClick={() => setEditing('new')}>
              Добавить участника
            </SignButton>
          )}
        </div>
      )}
      <ul className="people">
        {members.map((m) => (
          <li key={m.id} className={`person${m.active ? '' : ' is-inactive'}`}>
            <div className="person__row">
              <Pictogram
                name="person"
                size={40}
                tone={m.id === viewer.memberId ? 'yellow' : 'black'}
              />
              <div style={{ minWidth: 0 }}>
                <div className="person__name">{m.name}</div>
                <div className="person__meta">
                  <span>{m.githubLogin ? `@${m.githubLogin}` : 'без входа'}</span>
                  <span>
                    {m.trips} {plural(m.trips, 'поездка', 'поездки', 'поездок')}
                  </span>
                  <Tags m={m} meId={viewer.memberId} />
                </div>
              </div>
              {viewer.isAdmin && editing !== m.id && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditing(m.id)}
                  aria-label={`Изменить: ${m.name}`}
                >
                  Изменить
                </button>
              )}
            </div>
            {editing === m.id && (
              <Editor member={m} viewer={viewer} onDone={done} onCancel={() => setEditing(null)} />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
