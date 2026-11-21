import { describe, expect, it } from "vitest";
import { createProgressSvg, type SvgRoute } from "./svg";

const routes: SvgRoute[] = [
  {
    id: "route-a",
    operator: "デモ交通A",
    name: "サンプル北線",
    segments: [
      {
        distanceKm: 1.2,
        visited: true,
        coordinates: [
          [135.74, 35.06],
          [135.75, 35.05],
        ],
      },
      {
        distanceKm: 2.3,
        visited: false,
        coordinates: [
          [135.75, 35.05],
          [135.77, 35.04],
        ],
      },
    ],
  },
];

describe("createProgressSvg", () => {
  it("exports the same visited and unvisited route states as accessible vector paths", () => {
    const svg = createProgressSvg(routes, {
      title: "京都バス乗車進捗",
      attribution: "画面見本の仮データ",
    });

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<title id="svg-title">京都バス乗車進捗</title>');
    expect(svg).toContain("サンプル北線");
    expect(svg).toContain('stroke="#147d74"');
    expect(svg).toContain('stroke-dasharray="8 8"');
    expect(svg).toContain("乗車済み");
    expect(svg).toContain("未乗車");
    expect(svg).toContain("画面見本の仮データ");
  });

  it("escapes attribution text so it remains valid SVG text", () => {
    const svg = createProgressSvg(routes, {
      title: "進捗",
      attribution: "事業者A & <デモ>",
    });

    expect(svg).toContain("事業者A &amp; &lt;デモ&gt;");
    expect(svg).not.toContain("事業者A & <デモ>");
  });

  it("rejects coordinates outside longitude and latitude ranges", () => {
    const invalidRoutes = structuredClone(routes);
    invalidRoutes[0].segments[0].coordinates[0] = [200, 35];

    expect(() =>
      createProgressSvg(invalidRoutes, { title: "進捗", attribution: "デモ" }),
    ).toThrow(RangeError);
  });
});
