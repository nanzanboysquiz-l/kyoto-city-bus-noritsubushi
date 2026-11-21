import { describe, expect, it } from "vitest";
import {
  filterRoutes,
  getProgressState,
  summarizeProgress,
  type ProgressRoute,
} from "./progress";

const routes: ProgressRoute[] = [
  {
    id: "route-a",
    operator: "事業者A",
    name: "東西線",
    segments: [
      { distanceKm: 1.2, visited: true },
      { distanceKm: 2.3, visited: false },
    ],
  },
  {
    id: "route-b",
    operator: "事業者B",
    name: "南北線",
    segments: [{ distanceKm: 2, visited: true }],
  },
  {
    id: "route-c",
    operator: "事業者A",
    name: "環状線",
    segments: [
      { distanceKm: 1, visited: false },
      { distanceKm: 1.5, visited: false },
    ],
  },
];

describe("progress", () => {
  it("calculates visited and remaining distance across routes", () => {
    expect(summarizeProgress(routes)).toEqual({
      totalKm: 8,
      visitedKm: 3.2,
      remainingKm: 4.8,
      percent: 40,
    });
  });

  it("returns zero progress for an empty route set", () => {
    expect(summarizeProgress([])).toEqual({
      totalKm: 0,
      visitedKm: 0,
      remainingKm: 0,
      percent: 0,
    });
  });

  it("distinguishes unstarted, partial, and complete routes", () => {
    expect(routes.map(getProgressState)).toEqual([
      "in-progress",
      "complete",
      "not-started",
    ]);
  });

  it("filters by operator and whole-route progress state", () => {
    expect(
      filterRoutes(routes, { operator: "事業者A", state: "not-started" }).map(
        (route) => route.id,
      ),
    ).toEqual(["route-c"]);
  });

  it("rejects invalid segment distances instead of hiding bad data", () => {
    const invalidRoutes: ProgressRoute[] = [
      {
        id: "invalid",
        operator: "事業者A",
        name: "不正な距離",
        segments: [{ distanceKm: -1, visited: false }],
      },
    ];

    expect(() => summarizeProgress(invalidRoutes)).toThrow(RangeError);
  });
});
