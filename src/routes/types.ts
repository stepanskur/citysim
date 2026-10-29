// Маршруты и согласование (mechanics/09-routes.md). Чистые типы, без рендера.
export type OwnerId = number;           // -1 = свободная земля
export type GameDay = number;
export type RouteMode = 'bus' | 'tram' | 'metro' | 'rail' | 'cargoTruck' | 'cargoRail';
export const MODE_INFO: Record<RouteMode, { name: string; lineType: number; cargo: boolean }> = {
  bus: { name: 'Автобус', lineType: 0, cargo: false },
  tram: { name: 'Трамвай', lineType: 1, cargo: false },
  metro: { name: 'Метро', lineType: 2, cargo: false },
  rail: { name: 'Поезд', lineType: 3, cargo: false },
  cargoTruck: { name: 'Грузовой (авто)', lineType: 0, cargo: true },
  cargoRail: { name: 'Грузовой (ж/д)', lineType: 3, cargo: true },
};
export type RouteScope = 'intraCity' | 'intraRegion' | 'interRegion';
export type RouteStatus = 'draft' | 'submitted' | 'review' | 'partial' | 'active' | 'disputed' | 'suspended' | 'withdrawn' | 'expired' | 'rejected';
export const FINAL: RouteStatus[] = ['withdrawn', 'expired', 'rejected'];
export const STATUS_RU: Record<RouteStatus, string> = {
  draft: 'Черновик', submitted: 'Отправлена', review: 'На рассмотрении', partial: 'Согласована частично', active: 'Активна',
  disputed: 'Оспорена', suspended: 'Приостановлена', withdrawn: 'Отозвана', expired: 'Истекла', rejected: 'Отклонена',
};
export type ApproverStatus = 'pending' | 'approved' | 'rejected' | 'countered' | 'revoked';
export interface Terms { tollPerVehKm: number; tollPerTonKm: number; revenueShare: number; termMonths: number; withdrawNoticeDays: number; withdrawPenaltyShare: number }
export interface Stop { x: number; z: number }
export interface Segment { owner: OwnerId; km: number }
export interface Approver { owner: OwnerId; km: number; status: ApproverStatus; deadline: GameDay; decideAt?: GameDay; note?: string; counterTerms?: Terms; noticeUntil?: GameDay }
export interface HistoryItem { day: GameDay; from: RouteStatus; to: RouteStatus; by: OwnerId; note?: string }
export interface RouteEcon { revenueMonth: number; costMonth: number; tollPaidMonth: number; sharePaidMonth: number; byOwner: Record<number, number>; vehKmDay: number; paxKmDay: number; balance: number; unpaidMonths: number }
export interface Route {
  id: number; name: string; initiator: OwnerId; mode: RouteMode; stops: Stop[]; segments: Segment[]; scope: RouteScope;
  terms: Terms; status: RouteStatus; approvers: Approver[]; history: HistoryItem[]; counterRounds: number;
  createdDay: GameDay; activeSince?: GameDay; expiresDay?: GameDay; lineId?: number; econ: RouteEcon; disputeUntil?: GameDay;
}
export interface RouteNotice { day: GameDay; to: OwnerId; routeId: number; text: string; lvl: 'good' | 'warn' | 'bad' | 'info' }

/** Команды: всё, что делает игрок/ИИ/сервер, идёт через них (детерминированно, сериализуемо). */
export type RouteCommand =
  | { c: 'create'; by: OwnerId; name?: string; mode: RouteMode; stops: Stop[]; terms?: Partial<Terms> }
  | { c: 'edit'; by: OwnerId; id: number; stops?: Stop[]; terms?: Partial<Terms>; name?: string }
  | { c: 'submit'; by: OwnerId; id: number }
  | { c: 'open'; by: OwnerId; id: number }
  | { c: 'approve'; by: OwnerId; id: number }
  | { c: 'reject'; by: OwnerId; id: number; note?: string }
  | { c: 'counter'; by: OwnerId; id: number; terms: Partial<Terms>; note?: string }
  | { c: 'acceptCounter'; by: OwnerId; id: number; from: OwnerId }
  | { c: 'revoke'; by: OwnerId; id: number }          // владелец отзывает согласие
  | { c: 'reapprove'; by: OwnerId; id: number }       // повторное согласие после отзыва
  | { c: 'pause'; by: OwnerId; id: number }
  | { c: 'resume'; by: OwnerId; id: number }
  | { c: 'close'; by: OwnerId; id: number }           // инициатор закрывает/отзывает заявку
  | { c: 'delete'; by: OwnerId; id: number }          // удалить черновик / свой внутренний маршрут
  | { c: 'dispute'; by: OwnerId; id: number; note: string }
  | { c: 'resolveDispute'; by: OwnerId; id: number; forInitiator: boolean };

export type AIProfile = 'cooperative' | 'mercantile' | 'cautious' | 'protectionist';
/** Абстракция владения (подрегионы реализует другой модуль, 08-expansion). */
export interface Territory {
  ownerAt(x: number, z: number): OwnerId;
  cityAt?(x: number, z: number): number;
  isAI(owner: OwnerId): boolean;
  profile(owner: OwnerId): AIProfile;
  relation(a: OwnerId, b: OwnerId): number;          // 0..100
  addRelation?(a: OwnerId, b: OwnerId, d: number): void;
  ownerName(owner: OwnerId): string;
  /** для ИИ: загрузка его дорог V/C (0..1+), конкуренция с его линиями 0..1, стратегическая ценность 0/0.5/1 */
  aiContext?(owner: OwnerId, r: Route): { vcAdd?: number; competition?: number; strategic?: number };
  pay?(from: OwnerId, to: OwnerId, amount: number, why: string): void;
}
