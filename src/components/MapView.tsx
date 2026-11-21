import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as MapLibre,
  setWorkerUrl,
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { DemoRoute } from "../data/demoRoutes";

setWorkerUrl(workerUrl);

interface MapViewProps {
  routes: DemoRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

function toFeatureCollection(routes: DemoRoute[]) {
  return {
    type: "FeatureCollection" as const,
    features: routes.flatMap((route) => {
      if (route.shapeCoordinates && route.shapeCoordinates.length >= 2) {
        return [{
          type: "Feature" as const,
          properties: {
            routeId: route.id,
            routeName: route.name,
            visited: route.segments.some((segment) => segment.visited),
          },
          geometry: {
            type: "LineString" as const,
            coordinates: route.shapeCoordinates,
          },
        }];
      }
      return route.segments.map((segment) => ({
        type: "Feature" as const,
        properties: {
          routeId: route.id,
          routeName: route.name,
          visited: segment.visited,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: segment.coordinates,
        },
      }));
    }),
  };
}

export default function MapView({
  routes,
  selectedRouteId,
  onSelectRoute,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;

    const style = import.meta.env.VITE_MAP_STYLE_URL;
    if (!style) {
      setStatus("error");
      setErrorMessage("地図スタイルの設定がありません。");
      return;
    }

    let styleLoaded = false;
    const map = new MapLibre({
      container: containerRef.current,
      style,
      center: [135.755, 35.028],
      zoom: 11,
      minZoom: 8,
      maxZoom: 18,
      localIdeographFontFamily: "sans-serif",
      cooperativeGestures: true,
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      styleLoaded = true;
      map.addSource("routes", {
        type: "geojson",
        data: toFeatureCollection(routes),
      });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "routes",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#ffffff",
          "line-width": 9,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "route-unvisited",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "visited"], false],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#98a5a1",
          "line-width": 4,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "route-visited",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "visited"], true],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#147d74",
          "line-width": 4.5,
        },
      });
      map.on("click", "route-unvisited", selectRoute);
      map.on("click", "route-visited", selectRoute);
      map.on("mouseenter", "route-unvisited", setPointerCursor);
      map.on("mouseenter", "route-visited", setPointerCursor);
      map.on("mouseleave", "route-unvisited", clearCursor);
      map.on("mouseleave", "route-visited", clearCursor);
      setStatus("ready");
    });

    map.on("error", (event) => {
      if (!styleLoaded) {
        setStatus("error");
        setErrorMessage(event.error.message);
      }
    });

    function selectRoute(event: MapLayerMouseEvent) {
      const feature = event.features?.[0];
      const routeId = feature?.properties?.routeId;
      if (typeof routeId === "string") onSelectRoute(routeId);
    }

    function setPointerCursor() {
      map.getCanvas().style.cursor = "pointer";
    }

    function clearCursor() {
      map.getCanvas().style.cursor = "";
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onSelectRoute, routes]);

  useEffect(() => {
    if (!mapRef.current || status !== "ready") return;
    const source = mapRef.current.getSource("routes") as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(routes));

    if (selectedRouteId) {
      const route = routes.find((candidate) => candidate.id === selectedRouteId);
      const coordinates = route?.segments.flatMap((segment) => segment.coordinates) ?? [];
      if (coordinates.length > 0) {
        const bounds = coordinates.reduce(
          (result, coordinate) => result.extend(coordinate),
          new LngLatBounds(coordinates[0], coordinates[0]),
        );
        mapRef.current.fitBounds(bounds, { padding: 72, maxZoom: 13, duration: 450 });
      }
    }
  }, [routes, selectedRouteId, status]);

  const pan = (offset: [number, number]) => mapRef.current?.panBy(offset, { duration: 250 });

  return (
    <div className="map-frame">
      <div
        aria-label="京都市周辺のバス路線進捗地図。ドラッグで移動、ホイールまたは操作ボタンで拡大縮小できます。"
        className="map-canvas"
        ref={containerRef}
        role="region"
      />
      <div className="map-control-cluster" aria-label="地図を動かす">
        <div className="map-pan-grid">
          <button aria-label="地図を北へ移動" onClick={() => pan([0, -70])} type="button">↑</button>
          <button aria-label="地図を西へ移動" onClick={() => pan([-70, 0])} type="button">←</button>
          <button aria-label="地図を東へ移動" onClick={() => pan([70, 0])} type="button">→</button>
          <button aria-label="地図を南へ移動" onClick={() => pan([0, 70])} type="button">↓</button>
        </div>
        <div className="map-zoom-controls">
          <button
            aria-label="地図を拡大"
            onClick={() => mapRef.current?.zoomIn()}
            type="button"
          >
            +
          </button>
          <button
            aria-label="地図を縮小"
            onClick={() => mapRef.current?.zoomOut()}
            type="button"
          >
            −
          </button>
        </div>
      </div>
      {status === "loading" && <div className="map-state map-loading">地図を読み込んでいます…</div>}
      {status === "error" && (
        <div className="map-state map-error" role="alert">
          <strong>地図スタイルを読み込めませんでした。</strong>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
