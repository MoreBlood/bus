// Ремонт и ТО: записи о том, что сделали с бусом, сколько стоило и кто заплатил.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import { members, repairs } from '../db/schema.ts';
import { badRequest, notFound } from './errors.ts';
import { DATE } from './journal.ts';
import { parse, type Viewer } from './members.ts';

export const repairInput = z
  .object({
    date: z.string().regex(DATE, 'Дата в формате ГГГГ-ММ-ДД'),
    odometer: z.number().int().min(0).max(9_999_999).nullish(),
    kind: z.enum(['service', 'repair', 'tires', 'other', 'upgrade']).default('repair'),
    title: z.string().trim().min(1, 'Напишите, что сделали').max(120, 'Коротко — до 120 символов'),
    amount: z
      .number()
      .positive('Сумма больше нуля')
      .max(200_000, 'Слишком большая сумма — проверьте')
      .transform((v) => Math.round(v * 100)),
    /** null — заплатили из общей кассы */
    paidBy: z.string().min(1).nullable(),
    /** поломка по вине участника — вся сумма на нём */
    chargedTo: z.string().min(1).nullish(),
    note: z.string().trim().max(300).default(''),
  })
  .transform((r) => ({ ...r, odometer: r.odometer ?? null, chargedTo: r.chargedTo ?? null }));

async function assertMembers(db: Db, ids: (string | null)[]) {
  for (const id of ids)
    if (id && !(await db.select({ id: members.id }).from(members).where(eq(members.id, id)).get()))
      throw badRequest('Нет такого участника');
}

export async function getRepair(db: Db, id: string) {
  const r = await db.select().from(repairs).where(eq(repairs.id, id)).get();
  if (!r) throw notFound('Запись о ремонте не найдена (возможно, её уже удалили)');
  return { ...r, amount: r.amount / 100 };
}

export async function createRepair(db: Db, v: Viewer, body: unknown) {
  const r = parse(repairInput, body);
  await assertMembers(db, [r.paidBy, r.chargedTo]);
  const id = randomUUID();
  await db.insert(repairs).values({ id, ...r, createdBy: v.login });
  return { id };
}

export async function updateRepair(db: Db, v: Viewer, body: unknown) {
  const { id, ...rest } = parse(z.object({ id: z.string().min(1) }).passthrough(), body);
  const old = await getRepair(db, id);
  const r = parse(repairInput, { ...old, ...rest });
  await assertMembers(db, [r.paidBy, r.chargedTo]);
  await db
    .update(repairs)
    .set({ ...r, updatedBy: v.login, updatedAt: new Date().toISOString() })
    .where(eq(repairs.id, id));
  return { ok: true };
}

export async function deleteRepair(db: Db, _v: Viewer, id: unknown) {
  if (typeof id !== 'string' || !id) throw badRequest('Нужен id');
  const r = await db.delete(repairs).where(eq(repairs.id, id)).returning({ id: repairs.id });
  if (!r.length) throw notFound('Запись о ремонте не найдена');
  return { ok: true };
}
