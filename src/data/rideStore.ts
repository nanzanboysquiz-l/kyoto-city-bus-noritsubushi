import type { DemoRoute } from "./demoRoutes";

export interface RideRecord {
  id: string;
  routeId: string;
  boardedStopId: string;
  alightedStopId: string;
  rideDate: string;
  distanceKm: number;
  createdAt: string;
}

export interface RideInput {
  routeId: string;
  boardedStopId: string;
  alightedStopId: string;
  rideDate: string;
  routes: DemoRoute[];
}

export interface DistanceInput {
  routeId: string;
  boardedStopId: string;
  alightedStopId: string;
  routes: DemoRoute[];
}

export function calculateRideDistance(input: DistanceInput): number {
  const route = input.routes.find((candidate) => candidate.id === input.routeId);
  if (!route || input.boardedStopId === input.alightedStopId) return 0;

  const stopNames = [
    ...new Set(route.segments.flatMap((segment) => [segment.fromStop, segment.toStop])),
  ];
  const start = stopNames.indexOf(input.boardedStopId);
  const end = stopNames.indexOf(input.alightedStopId);
  if (start < 0 || end < 0) return 0;

  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  return route.segments.reduce((total, segment) => {
    const from = stopNames.indexOf(segment.fromStop);
    const to = stopNames.indexOf(segment.toStop);
    if (from < 0 || to < 0) return total;
    if (Math.max(from, to) <= lower || Math.min(from, to) >= upper) return total;
    return total + segment.distanceKm;
  }, 0);
}

export function createRideRecord(input: RideInput): RideRecord | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.rideDate)) return null;
  const distanceKm = calculateRideDistance(input);
  if (distanceKm <= 0) return null;

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    routeId: input.routeId,
    boardedStopId: input.boardedStopId,
    alightedStopId: input.alightedStopId,
    rideDate: input.rideDate,
    distanceKm,
    createdAt: new Date().toISOString(),
  };
}

export function applyRideProgress(routes: DemoRoute[], records: RideRecord[]): DemoRoute[] {
  return routes.map((route) => ({
    ...route,
    segments: route.segments.map((segment) => {
      const stopNames = [
        ...new Set(route.segments.flatMap((candidate) => [candidate.fromStop, candidate.toStop])),
      ];
      const segmentFrom = stopNames.indexOf(segment.fromStop);
      const segmentTo = stopNames.indexOf(segment.toStop);

      const visited = segment.visited || records
        .filter((record) => record.routeId === route.id)
        .some((record) => {
          const start = stopNames.indexOf(record.boardedStopId);
          const end = stopNames.indexOf(record.alightedStopId);
          if (start < 0 || end < 0) return false;
          const lower = Math.min(start, end);
          const upper = Math.max(start, end);
          return Math.max(segmentFrom, segmentTo) <= lower
            ? false
            : Math.min(segmentFrom, segmentTo) >= upper
              ? false
              : true;
        });

      return { ...segment, visited };
    }),
  }));
}

export function summarizeMemberDistance(records: RideRecord[]): number {
  const total = records.reduce((sum, record) => sum + record.distanceKm, 0);
  return Math.round((total + Number.EPSILON) * 10) / 10;
}

export function loadRideRecords(storage: Pick<Storage, "getItem"> = localStorage): RideRecord[] {
  try {
    const parsed = JSON.parse(storage.getItem("kyoto-bus-rides") ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRideRecord) : [];
  } catch {
    return [];
  }
}

export function saveRideRecords(
  records: RideRecord[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem("kyoto-bus-rides", JSON.stringify(records));
}

export function isRideRecord(value: unknown): value is RideRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RideRecord>;
  return typeof record.id === "string"
    && typeof record.routeId === "string"
    && typeof record.boardedStopId === "string"
    && typeof record.alightedStopId === "string"
    && typeof record.rideDate === "string"
    && typeof record.distanceKm === "number"
    && typeof record.createdAt === "string";
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportRideRecordsCsv(records: RideRecord[], routes: DemoRoute[]): string {
  const header = [
    "ride_date",
    "operator",
    "route",
    "boarded_stop",
    "alighted_stop",
    "distance_km",
  ].join(",");
  const rows = [...records].sort((a, b) => b.rideDate.localeCompare(a.rideDate)).map((record) => {
    const route = routes.find((candidate) => candidate.id === record.routeId);
    return [
      record.rideDate,
      route?.operator ?? "",
      route?.name ?? record.routeId,
      record.boardedStopId,
      record.alightedStopId,
      record.distanceKm,
    ].map(csvEscape).join(",");
  });
  return [header, ...rows].join("\r\n");
}

export function importRideRecordsJson(json: string): RideRecord[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(isRideRecord) : [];
  } catch {
    return [];
  }
}
