import argparse
import csv
import json
import math
from collections import defaultdict
from pathlib import Path


def read_rows(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def haversine_km(first, second):
    lat1, lon1 = first
    lat2, lon2 = second
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    value = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(value))


def representative_stops(root, routes, trips, stop_times):
    trips_by_route = defaultdict(list)
    for trip in trips:
        trips_by_route[trip["route_id"]].append(trip)

    stop_by_id = {
        stop["stop_id"]: (
            float(stop["stop_lat"]),
            float(stop["stop_lon"]),
            stop["stop_name"],
        )
        for stop in read_rows(root / "stops.txt")
    }

    stop_times_by_trip = defaultdict(list)
    for row in stop_times:
        stop_times_by_trip[row["trip_id"]].append(row)
    for rows in stop_times_by_trip.values():
        rows.sort(key=lambda row: int(row["stop_sequence"]))

    return trips_by_route, stop_by_id, stop_times_by_trip


def import_feed(root, operator, include_shapes):
    routes = read_rows(root / "routes.txt")
    trips = read_rows(root / "trips.txt")
    stop_times = read_rows(root / "stop_times.txt")
    feed = read_rows(root / "feed_info.txt")[0]
    trips_by_route, stop_by_id, stop_times_by_trip = representative_stops(
        root, routes, trips, stop_times
    )

    shapes_by_id = defaultdict(list)
    if include_shapes:
        for row in read_rows(root / "shapes.txt"):
            shapes_by_id[row["shape_id"]].append(
                (
                    float(row["shape_pt_lon"]),
                    float(row["shape_pt_lat"]),
                    int(row["shape_pt_sequence"]),
                )
            )
    for rows in shapes_by_id.values():
        rows.sort(key=lambda row: row[2])

    output = []
    for route in routes:
        route_trips = trips_by_route[route["route_id"]]
        if not route_trips:
            continue

        candidates = [
            trip
            for trip in route_trips
            if stop_times_by_trip.get(trip["trip_id"])
        ]
        if not candidates:
            continue
        representative = max(
            candidates,
            key=lambda trip: len(stop_times_by_trip[trip["trip_id"]]),
        )
        ordered_times = stop_times_by_trip[representative["trip_id"]]

        stops = []
        seen = set()
        for row in ordered_times:
            stop_id = row["stop_id"]
            if stop_id in seen or stop_id not in stop_by_id:
                continue
            seen.add(stop_id)
            lat, lon, name = stop_by_id[stop_id]
            stops.append({
                "id": stop_id,
                "name": name,
                "coordinates": [lon, lat],
            })

        shape_coordinates = []
        if include_shapes:
            shape_id = representative.get("shape_id")
            if shape_id in shapes_by_id:
                shape_coordinates = [
                    [row[0], row[1]]
                    for row in shapes_by_id[shape_id]
                ]

        segments = []
        for index, stop in enumerate(stops[1:], start=1):
            previous = stops[index - 1]
            lon1, lat1 = previous["coordinates"]
            lon2, lat2 = stop["coordinates"]
            distance = haversine_km((lat1, lon1), (lat2, lon2))
            segments.append({
                "id": f'{route["route_id"]}-{index}',
                "fromStop": previous["name"],
                "toStop": stop["name"],
                "distanceKm": round(distance, 3),
                "visited": False,
                "coordinates": [previous["coordinates"], stop["coordinates"]],
            })

        route_number = route["route_short_name"].strip() or route["route_id"]
        route_name = route["route_long_name"].strip() or route_number
        output.append({
            "id": f'{operator["prefix"]}-{route["route_id"]}',
            "operator": operator["name"],
            "operatorId": operator["prefix"],
            "routeNumber": route_number,
            "name": route_name,
            "stops": stops,
            "shapeCoordinates": shape_coordinates,
            "segments": segments,
            "sourceFeedVersion": feed["feed_version"],
            "sourceFeedStart": feed["feed_start_date"],
            "sourceFeedEnd": feed["feed_end_date"],
        })
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kyoto-bus", type=Path, required=True)
    parser.add_argument("--kyoto-city", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    routes = []
    routes.extend(import_feed(
        args.kyoto_bus,
        {"name": "京都バス", "prefix": "kyoto-bus"},
        include_shapes=False,
    ))
    routes.extend(import_feed(
        args.kyoto_city,
        {"name": "京都市営バス", "prefix": "kyoto-city"},
        include_shapes=True,
    ))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(routes, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(routes)} routes to {args.output}")


if __name__ == "__main__":
    main()
