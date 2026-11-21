export interface ProgressSegment {
  distanceKm: number;
  visited: boolean;
}

export interface ProgressRoute {
  id: string;
  operator: string;
  name: string;
  segments: ProgressSegment[];
}

export type ProgressState = "not-started" | "in-progress" | "complete";

export interface ProgressFilter {
  operator?: string;
  state?: ProgressState | "all";
}

export interface ProgressSummary {
  totalKm: number;
  visitedKm: number;
  remainingKm: number;
  percent: number;
}

function roundToTenth(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function sumDistance(segments: ProgressSegment[], visitedOnly = false): number {
  return segments.reduce((sum, segment) => {
    if (!Number.isFinite(segment.distanceKm) || segment.distanceKm < 0) {
      throw new RangeError("Segment distance must be a non-negative number.");
    }

    return sum + (visitedOnly && !segment.visited ? 0 : segment.distanceKm);
  }, 0);
}

export function getProgressState(route: ProgressRoute): ProgressState {
  const visitedCount = route.segments.filter((segment) => segment.visited).length;

  if (visitedCount === 0) return "not-started";
  if (visitedCount === route.segments.length) return "complete";
  return "in-progress";
}

export function summarizeProgress(routes: ProgressRoute[]): ProgressSummary {
  const segments = routes.flatMap((route) => route.segments);
  const totalKm = sumDistance(segments);
  const visitedKm = sumDistance(segments, true);

  return {
    totalKm: roundToTenth(totalKm),
    visitedKm: roundToTenth(visitedKm),
    remainingKm: roundToTenth(totalKm - visitedKm),
    percent: totalKm === 0 ? 0 : roundToTenth((visitedKm / totalKm) * 100),
  };
}

export function filterRoutes<T extends ProgressRoute>(
  routes: T[],
  filter: ProgressFilter = {},
): T[] {
  return routes.filter((route) => {
    const matchesOperator = !filter.operator || route.operator === filter.operator;
    const matchesState =
      !filter.state || filter.state === "all" || getProgressState(route) === filter.state;

    return matchesOperator && matchesState;
  });
}
