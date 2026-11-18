// MCP-сервер: те же операции, что в приложении, — для Claude, ChatGPT и других агентов.
import { createMcpHandler, McpServer, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Service, Viewer } from './service/index.ts';

const INSTRUCTIONS = `Бус — общий бортжурнал буса, которым совместно владеют друзья.
- Поездка личная (member_id участника) или общая (member_id = null, по общим делам). Каждый отрезок пути записывается один раз.
- Пробег — по одометру (odometer_start/odometer_end, км считаются сами) или километрами (km), если показаний нет.
- Перед записью вызови get_journal: в last_odometer — последнее показание, его разумно взять как odometer_start. Разрывы одометра (issues) — км, которые никто не записал.
- Имена участников сопоставляй через list_members; если непонятно, на кого записать, — спроси пользователя.
- Дата — YYYY-MM-DD; многодневная поездка — date (выезд) + end_date (возвращение): личные дни считаются по каждому дню.`;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD');
const read = { readOnlyHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const out = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

const tripFields = {
  date,
  end_date: date.optional().describe('День возвращения, если поездка на несколько дней'),
  member_id: z.string().nullable().describe('Участник (id из list_members); null — общая поездка'),
  odometer_start: z.number().int().optional(),
  odometer_end: z.number().int().optional(),
  km: z.number().int().positive().optional().describe('Пробег, если показаний одометра нет'),
  note: z.string().max(300).optional().describe('Маршрут или цель поездки'),
};

const toInput = (a: Partial<Record<keyof typeof tripFields, unknown>>) => {
  const r: Record<string, unknown> = {};
  if (a.date !== undefined) r.date = a.date;
  if (a.end_date !== undefined) r.endDate = a.end_date;
  if (a.member_id !== undefined) r.memberId = a.member_id;
  if (a.odometer_start !== undefined) r.odoStart = a.odometer_start;
  if (a.odometer_end !== undefined) r.odoEnd = a.odometer_end;
  if (a.km !== undefined) r.km = a.km;
  if (a.note !== undefined) r.note = a.note;
  return r;
};

function buildServer(s: Service, v: Viewer) {
  const server = new McpServer({ name: 'bus', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  const tool = <T extends StandardSchemaWithJSON>(
    name: string,
    description: string,
    inputSchema: T,
    annotations: object,
    fn: (args: StandardSchemaWithJSON.InferOutput<T>) => Promise<unknown>,
  ) =>
    // колбэк SDK для дженерика T не выводится (условный тип) — аргументы уже типизированы через InferOutput<T>
    server.registerTool(name, { description, inputSchema, annotations }, (async (
      args: StandardSchemaWithJSON.InferOutput<T>,
    ) => out(await fn(args))) as never);

  tool(
    'get_journal',
    'Бортжурнал за год: поездки (новые сверху), итоги (общий/личный/общий пробег, км и дни по участникам), разрывы одометра, последнее показание.',
    z.object({ year: z.string().regex(/^\d{4}$/).optional().describe('По умолчанию — текущий') }),
    read,
    async ({ year }) => {
      const j = await s.journal(year);
      return { ...j, last_odometer: j.lastOdometer };
    },
  );

  tool('list_members', 'Участники (совладельцы): id, имя, GitHub-логин, админ, активен.', z.object({}), read, async () =>
    (await s.members()).map(({ id, name, githubLogin, isAdmin, active }) => ({ id, name, githubLogin, isAdmin, active })),
  );

  tool('whoami', 'Кто подключён: логин GitHub, id участника, админ ли.', z.object({}), read, async () => v);

  tool('add_trip', 'Записать поездку в бортжурнал.', z.object(tripFields), write, (a) => s.createTrip(v, toInput(a)));

  tool(
    'update_trip',
    'Изменить поездку: переданные поля заменяют старые (чтобы перейти с одометра на км, передай km и null в показания).',
    z.object({
      trip_id: z.string(),
      ...Object.fromEntries(Object.entries(tripFields).map(([k, f]) => [k, f.optional()])),
      odometer_start: z.number().int().nullable().optional(),
      odometer_end: z.number().int().nullable().optional(),
    }),
    write,
    ({ trip_id, ...rest }) => s.updateTrip(v, { id: trip_id, ...toInput(rest) }),
  );

  tool('delete_trip', 'Удалить поездку.', z.object({ trip_id: z.string() }), { ...write, destructiveHint: true }, ({ trip_id }) =>
    s.deleteTrip(v, trip_id),
  );
  return server;
}

/** Web-обработчик MCP (Streamable HTTP; клиенты 2025 и 2026 годов) от имени участника. */
export const createMcp = (s: Service, v: Viewer) => createMcpHandler(() => buildServer(s, v));
