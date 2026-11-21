import type { ProgressSegment } from "./progress";

type Coordinates = [longitude: number, latitude: number];

export interface SvgSegment extends ProgressSegment {
  coordinates: Coordinates[];
}

export interface SvgRoute {
  id: string;
  operator: string;
  name: string;
  segments: SvgSegment[];
}

export interface SvgOptions {
  title: string;
  attribution: string;
}

interface Point {
  x: number;
  y: number;
}

const WIDTH = 1200;
const HEIGHT = 800;
const MARGIN = 76;
const HEADER_HEIGHT = 100;
const FOOTER_HEIGHT = 120;
const MAX_MERCATOR_LATITUDE = 85.05112878;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function project([longitude, latitude]: Coordinates): Point {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new RangeError("SVG coordinates must be valid longitude and latitude values.");
  }

  const clampedLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;

  return {
    x: (longitude * Math.PI) / 180,
    y: Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
  };
}

function pathData(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

export function createProgressSvg(routes: SvgRoute[], options: SvgOptions): string {
  const projectedSegments = routes.flatMap((route) =>
    route.segments.map((segment) => ({
      route,
      segment,
      points: segment.coordinates.map(project),
    })),
  );
  const points = projectedSegments.flatMap(({ points: segmentPoints }) => segmentPoints);
  const minX = points.length ? Math.min(...points.map(({ x }) => x)) : 0;
  const maxX = points.length ? Math.max(...points.map(({ x }) => x)) : 1;
  const minY = points.length ? Math.min(...points.map(({ y }) => y)) : 0;
  const maxY = points.length ? Math.max(...points.map(({ y }) => y)) : 1;
  const spanX = Math.max(maxX - minX, 0.000001);
  const spanY = Math.max(maxY - minY, 0.000001);
  const mapTop = HEADER_HEIGHT + MARGIN;
  const mapBottom = HEIGHT - FOOTER_HEIGHT - MARGIN;
  const availableWidth = WIDTH - MARGIN * 2;
  const availableHeight = mapBottom - mapTop;
  const scale = Math.min(availableWidth / spanX, availableHeight / spanY);
  const offsetX = (WIDTH - spanX * scale) / 2;
  const offsetY = mapTop + (availableHeight - spanY * scale) / 2;
  const toSvg = ({ x, y }: Point): Point => ({
    x: offsetX + (x - minX) * scale,
    y: offsetY + (maxY - y) * scale,
  });

  const paths = projectedSegments
    .map(({ route, segment, points: segmentPoints }) => {
      if (segmentPoints.length < 2) {
        throw new RangeError(`Segment ${route.id} requires at least two coordinates.`);
      }

      const d = pathData(segmentPoints.map(toSvg));
      const color = segment.visited ? "#147d74" : "#a8b2af";
      const dash = segment.visited ? "" : ' stroke-dasharray="8 8"';

      return [
        `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"${dash} data-route="${escapeXml(route.id)}" data-visited="${segment.visited}"/>`,
      ].join("");
    })
    .join("");

  const labels = routes
    .filter((route) => route.segments[0]?.coordinates[0])
    .map((route) => {
      const anchor = toSvg(project(route.segments[0].coordinates[0]));
      return `<text x="${(anchor.x + 10).toFixed(2)}" y="${(anchor.y - 10).toFixed(2)}" class="route-label">${escapeXml(route.name)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="svg-title svg-desc">
<title id="svg-title">${escapeXml(options.title)}</title>
<desc id="svg-desc">乗車済み区間は青緑の実線、未乗車区間は灰色の破線です。背景地図は含まれません。</desc>
<style>text{font-family:"Noto Sans JP","Yu Gothic",sans-serif;fill:#253331}.heading{font-size:30px;font-weight:700}.route-label{font-size:18px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round}.legend{font-size:16px}.credit{font-size:13px;fill:#52615e}</style>
<rect width="${WIDTH}" height="${HEIGHT}" fill="#f7f9f8"/>
<text x="${MARGIN}" y="58" class="heading">${escapeXml(options.title)}</text>
<g aria-label="路線の乗車進捗">${paths}${labels}</g>
<g transform="translate(${MARGIN},${HEIGHT - 66})">
<path d="M0 0h44" stroke="#147d74" stroke-width="7" stroke-linecap="round"/>
<text x="56" y="6" class="legend">乗車済み</text>
<path d="M180 0h44" stroke="#a8b2af" stroke-width="7" stroke-dasharray="8 8" stroke-linecap="round"/>
<text x="236" y="6" class="legend">未乗車</text>
<text x="${WIDTH - 420}" y="6" class="credit">${escapeXml(options.attribution)}・背景地図なし</text>
</g>
</svg>`;
}
