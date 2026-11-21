import { describe, expect, it } from "vitest";
import { demoRoutes } from "./demoRoutes";
import {
  applyRideProgress,
  calculateRideDistance,
  createRideRecord,
  exportRideRecordsCsv,
  importRideRecordsJson,
  summarizeMemberDistance,
  type RideRecord,
} from "./rideStore";

describe("rideStore", () => {
  it("calculates and records a ride between two stops", () => {
    const record = createRideRecord({
      routeId: "demo-north",
      boardedStopId: "デモ北端",
      alightedStopId: "デモ中央",
      rideDate: "2026-11-21",
      routes: demoRoutes,
    });

    expect(record).not.toBeNull();
    expect(record?.distanceKm).toBe(3.5);
  });

  it("marks route segments covered by a ride as visited", () => {
    const record: RideRecord = {
      id: "ride-1",
      routeId: "demo-north",
      boardedStopId: "デモ北端",
      alightedStopId: "デモ中央",
      rideDate: "2026-11-21",
      distanceKm: 3.5,
      createdAt: "2026-11-21T10:00:00.000Z",
    };
    const routes = applyRideProgress(demoRoutes, [record]);

    expect(routes[0].segments.every((segment) => segment.visited)).toBe(true);
  });

  it("rejects rides that have the same boarding and alighting stop", () => {
    expect(
      calculateRideDistance({
        routeId: "demo-north",
        boardedStopId: "デモ北端",
        alightedStopId: "デモ北端",
        routes: demoRoutes,
      }),
    ).toBe(0);
  });

  it("sums each member's ride distances only", () => {
    const records: RideRecord[] = [
      {
        id: "ride-1",
        routeId: "demo-north",
        boardedStopId: "デモ北端",
        alightedStopId: "デモ中央",
        rideDate: "2026-11-21",
        distanceKm: 3.5,
        createdAt: "2026-11-21T10:00:00.000Z",
      },
      {
        id: "ride-2",
        routeId: "demo-east-west",
        boardedStopId: "デモ西端",
        alightedStopId: "デモ東端",
        rideDate: "2026-11-20",
        distanceKm: 2,
        createdAt: "2026-11-20T10:00:00.000Z",
      },
    ];

    expect(summarizeMemberDistance(records)).toBe(5.5);
  });

  it("exports ride records as CSV", () => {
    const record: RideRecord = {
      id: "ride-1",
      routeId: "demo-north",
      boardedStopId: "デモ北端",
      alightedStopId: "デモ中央",
      rideDate: "2026-11-21",
      distanceKm: 3.5,
      createdAt: "2026-11-21T10:00:00.000Z",
    };

    const csv = exportRideRecordsCsv([record], demoRoutes);
    expect(csv).toContain("ride_date,operator,route,boarded_stop,alighted_stop,distance_km");
    expect(csv).toContain("2026-11-21,デモ交通A,サンプル北線,デモ北端,デモ中央,3.5");
  });

  it("imports valid JSON records and rejects malformed records", () => {
    const record: RideRecord = {
      id: "ride-1",
      routeId: "demo-north",
      boardedStopId: "デモ北端",
      alightedStopId: "デモ中央",
      rideDate: "2026-11-21",
      distanceKm: 3.5,
      createdAt: "2026-11-21T10:00:00.000Z",
    };

    expect(importRideRecordsJson(JSON.stringify([record]))).toEqual([record]);
    expect(importRideRecordsJson("{broken")).toEqual([]);
    expect(importRideRecordsJson(JSON.stringify([{ routeId: "demo-north" }]))).toEqual([]);
  });
});
