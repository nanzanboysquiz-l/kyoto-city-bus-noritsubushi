import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import officialRoutesJson from "./official-routes.json";

interface OfficialRoute {
  id: string;
  operator: string;
  routeNumber: string;
  name: string;
  stops: Array<{ id: string; name: string; coordinates: [number, number] }>;
  shapeCoordinates: Array<[number, number]>;
  segments: Array<{ id: string; distanceKm: number }>;
  sourceFeedVersion: string;
  sourceFeedStart: string;
  sourceFeedEnd: string;
}

describe("official GTFS catalog", () => {
  it("contains both operators and valid route metadata", () => {
    const routes = officialRoutesJson as unknown as OfficialRoute[];
    expect(routes.length).toBeGreaterThanOrEqual(194);
    expect(new Set(routes.map((route) => route.operator))).toEqual(
      new Set(["京都バス", "京都市営バス"]),
    );
    for (const route of routes) {
      expect(route.id).not.toBe("");
      expect(route.stops.length).toBeGreaterThan(1);
      expect(route.segments.length).toBe(route.stops.length - 1);
      expect(route.segments.every((segment) => segment.distanceKm > 0)).toBe(true);
      expect(route.sourceFeedVersion).not.toBe("");
    }
  });

  it("does not copy raw GTFS archives into the public bundle", () => {
    const publicDirectory = new URL("../../public/", import.meta.url);
    const walk = (directory: URL): string[] => {
      if (!existsSync(directory)) return [];
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(new URL(`${entry.name}/`, directory))
          : [new URL(entry.name, directory).pathname],
      );
    };
    expect(walk(publicDirectory).some((file) => file.toLowerCase().endsWith(".zip"))).toBe(false);
  });
});
