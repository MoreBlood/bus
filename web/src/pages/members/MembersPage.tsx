import { useSession } from '@shared/model/session';
import { MemberList } from '@widgets/member-list/MemberList';
import { Topbar } from '@widgets/topbar/Topbar';

export function MembersPage() {
  const { members, viewer, reloadMembers, loading } = useSession();
  const active = members.filter((m) => m.active).length;
  const admins = members.filter((m) => m.active && (m.isAdmin || m.envAdmin)).map((m) => m.name);
  return (
    <>
      <Topbar section="Участники" />
      <div className="page">
        <div className="narrow">
          <div className="section__head" style={{ marginTop: 24 }}>
            <h1 className="section__title" style={{ fontSize: 26 }}>
              Совладельцы буса
            </h1>
            {!loading && <span className="section__aside">{active} участвуют</span>}
          </div>
          {viewer && !viewer.isAdmin && (
            <p className="prose">
              Список ведут админы{admins.length ? `: ${admins.join(', ')}` : ''}. Чтобы добавить
              человека или выдать доступ, напишите им.
            </p>
          )}
          {loading || !viewer ? (
            <div
              aria-busy
              aria-label="Загрузка"
              className="skeleton"
              style={{ height: 240, marginTop: 16 }}
            />
          ) : (
            <MemberList members={members} viewer={viewer} reload={reloadMembers} />
          )}
        </div>
      </div>
    </>
  );
}
