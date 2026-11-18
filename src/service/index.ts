// Все операции сервиса в одном месте — их зовут HTTP-API (дашборд) и MCP (агенты).
import type { Db } from '../db/index.ts';
import * as assistantSvc from './assistant.ts';
import * as moneySvc from './money.ts';
import * as oauthClientsSvc from './oauth-clients.ts';
import * as repairsSvc from './repairs.ts';
import * as settingsSvc from './settings.ts';
import * as membersSvc from './members.ts';
import type { Viewer } from './members.ts';
import * as tripsSvc from './trips.ts';

export function createService(db: Db) {
  return {
    // доступ
    canSignIn: (login: string, githubId: string) => membersSvc.admitGithubUser(db, login, githubId),
    resolveViewer: (userId: string) => membersSvc.resolveViewer(db, userId),
    guardClientRegistration: () => oauthClientsSvc.guardClientRegistration(db),

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

    // деньги: ставки, заправки, ремонт и ТО, переводы
    money: (year?: string) => moneySvc.money(db, year),
    settings: () => settingsSvc.getSettings(db),
    saveSettings: (v: Viewer, b: unknown) => settingsSvc.saveSettings(db, v, b),
    savePeriod: (v: Viewer, b: unknown) => settingsSvc.savePeriod(db, v, b),
    deletePeriod: (v: Viewer, id: unknown) => settingsSvc.deletePeriod(db, v, id),
    refuel: (id: string) => moneySvc.getRefuel(db, id),
    createRefuel: (v: Viewer, b: unknown) => moneySvc.createRefuel(db, v, b),
    updateRefuel: (v: Viewer, b: unknown) => moneySvc.updateRefuel(db, v, b),
    deleteRefuel: (v: Viewer, id: unknown) => moneySvc.deleteRefuel(db, v, id),
    repair: (id: string) => repairsSvc.getRepair(db, id),
    createRepair: (v: Viewer, b: unknown) => repairsSvc.createRepair(db, v, b),
    updateRepair: (v: Viewer, b: unknown) => repairsSvc.updateRepair(db, v, b),
    deleteRepair: (v: Viewer, id: unknown) => repairsSvc.deleteRepair(db, v, id),
    createTransfer: (v: Viewer, b: unknown) => moneySvc.createTransfer(db, v, b),
    deleteTransfer: (v: Viewer, id: unknown) => moneySvc.deleteTransfer(db, v, id),

    exportData: () => tripsSvc.exportData(db),
    assistantConnections: (v: Viewer) => assistantSvc.connections(db, v),
  };
}

export type Service = ReturnType<typeof createService>;
export type { Viewer } from './members.ts';
