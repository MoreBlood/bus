// Все операции сервиса в одном месте — их зовут HTTP-API (дашборд) и MCP (агенты).
import type { Db } from '../db/index.ts';
import * as assistantSvc from './assistant.ts';
import * as membersSvc from './members.ts';
import type { Viewer } from './members.ts';
import * as tripsSvc from './trips.ts';

export function createService(db: Db) {
  return {
    // доступ
    canSignIn: (login: string) => membersSvc.canSignIn(db, login),
    resolveViewer: (login: string) => membersSvc.resolveViewer(db, login),
    loginByUserId: (userId: string) => membersSvc.loginByUserId(db, userId),

    // участники
    members: () => membersSvc.listMembers(db),
    createMember: (v: Viewer, b: unknown) => membersSvc.createMember(db, v, b),
    updateMember: (v: Viewer, b: unknown) => membersSvc.updateMember(db, v, b),
    deleteMember: (v: Viewer, id: unknown) => membersSvc.deleteMember(db, v, id),

    // бортжурнал
    journal: (year?: string) => tripsSvc.journal(db, year),
    trip: (id: string) => tripsSvc.getTrip(db, id),
    createTrip: (v: Viewer, b: unknown) => tripsSvc.createTrip(db, v, b),
    updateTrip: (v: Viewer, b: unknown) => tripsSvc.updateTrip(db, v, b),
    deleteTrip: (v: Viewer, id: unknown) => tripsSvc.deleteTrip(db, v, id),

    exportData: () => tripsSvc.exportData(db),
    assistantConnections: (v: Viewer) => assistantSvc.connections(db, v),
  };
}

export type Service = ReturnType<typeof createService>;
export type { Viewer } from './members.ts';
