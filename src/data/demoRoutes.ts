import type { ProgressSegment, ProgressRoute } from "../domain/progress";
import type { SvgRoute, SvgSegment } from "../domain/svg";

type Coordinates = [longitude: number, latitude: number];

export interface DemoSegment extends ProgressSegment, SvgSegment {
  id: string;
  fromStop: string;
  toStop: string;
  coordinates: Coordinates[];
}

export interface DemoRoute extends Omit<ProgressRoute, "segments">, Omit<SvgRoute, "segments"> {
  routeNumber: string;
  segments: DemoSegment[];
  shapeCoordinates?: Coordinates[];
}

export const demoRoutes: DemoRoute[] = [
  {
    id: "demo-north",
    operator: "デモ交通A",
    routeNumber: "A-01",
    name: "サンプル北線",
    segments: [
      {
        id: "north-1",
        fromStop: "デモ北端",
        toStop: "デモ中央北",
        distanceKm: 1.2,
        visited: true,
        coordinates: [
          [135.738, 35.061],
          [135.747, 35.053],
          [135.757, 35.047],
        ],
      },
      {
        id: "north-2",
        fromStop: "デモ中央北",
        toStop: "デモ中央",
        distanceKm: 2.3,
        visited: false,
        coordinates: [
          [135.757, 35.047],
          [135.767, 35.038],
          [135.778, 35.031],
        ],
      },
    ],
  },
  {
    id: "demo-east-west",
    operator: "デモ交通B",
    routeNumber: "B-02",
    name: "サンプル東西線",
    segments: [
      {
        id: "east-west-1",
        fromStop: "デモ西端",
        toStop: "デモ東端",
        distanceKm: 2,
        visited: true,
        coordinates: [
          [135.724, 35.014],
          [135.744, 35.017],
          [135.766, 35.018],
          [135.785, 35.016],
        ],
      },
    ],
  },
  {
    id: "demo-loop",
    operator: "デモ交通A",
    routeNumber: "A-03",
    name: "サンプル環状線",
    segments: [
      {
        id: "loop-1",
        fromStop: "デモ南西",
        toStop: "デモ南東",
        distanceKm: 1,
        visited: false,
        coordinates: [
          [135.735, 34.994],
          [135.752, 34.991],
          [135.769, 34.994],
        ],
      },
      {
        id: "loop-2",
        fromStop: "デモ南東",
        toStop: "デモ南西",
        distanceKm: 1.5,
        visited: false,
        coordinates: [
          [135.769, 34.994],
          [135.773, 35.006],
          [135.753, 35.009],
          [135.735, 34.994],
        ],
      },
    ],
  },
];
