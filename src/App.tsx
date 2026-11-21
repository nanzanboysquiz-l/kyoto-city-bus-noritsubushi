import { lazy, Suspense, useMemo, useState } from "react";
import AuthScreen from "./components/AuthScreen";
import { demoRoutes, type DemoRoute } from "./data/demoRoutes";
import { officialRoutes } from "./data/officialRoutes";
import { getSupabaseClient } from "./data/supabaseClient";
import {
  filterRoutes,
  getProgressState,
  summarizeProgress,
  type ProgressState,
} from "./domain/progress";
import { createProgressSvg } from "./domain/svg";
import {
  applyRideProgress,
  createRideRecord,
  exportRideRecordsCsv,
  importRideRecordsJson,
  loadRideRecords,
  saveRideRecords,
  summarizeMemberDistance,
  type RideRecord,
} from "./data/rideStore";

const MapView = lazy(() => import("./components/MapView"));

type Screen = "map" | "record" | "group";
type RouteStateFilter = ProgressState | "all";

const stateLabels: Record<ProgressState, string> = {
  "not-started": "未乗車",
  "in-progress": "一部乗車",
  complete: "完乗済み",
};

const filterLabels: Record<RouteStateFilter, string> = {
  all: "すべて",
  "not-started": "未乗車",
  "in-progress": "乗車中",
  complete: "完乗",
};

function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === "true";
}

function activeRoutes(): DemoRoute[] {
  return import.meta.env.VITE_USE_OFFICIAL_GTFS === "true"
    ? officialRoutes
    : demoRoutes;
}

function officialFeedNotice(): string {
  const feeds = [
    ...new Map(
      officialRoutes.map((route) => {
        const metadata = route as DemoRoute & {
          sourceFeedVersion?: string;
          sourceFeedStart?: string;
          sourceFeedEnd?: string;
        };
        return [
          metadata.sourceFeedVersion ?? "",
          `${metadata.operator}: ${metadata.sourceFeedVersion ?? "版未確認"}（${metadata.sourceFeedStart ?? "開始日未確認"}〜${metadata.sourceFeedEnd ?? "終了日未確認"}）`,
        ];
      }),
    ).values(),
  ];
  return feeds.join("／");
}

function AppNavigation({
  activeScreen,
  onNavigate,
  className,
}: {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
  className: string;
}) {
  const screens: { id: Screen; label: string }[] = [
    { id: "map", label: "地図" },
    { id: "record", label: "記録" },
    { id: "group", label: "グループ" },
  ];

  return (
    <nav className={className} aria-label="メインメニュー">
      {screens.map((screen) => (
        <button
          aria-current={activeScreen === screen.id ? "page" : undefined}
          className={activeScreen === screen.id ? "nav-button is-active" : "nav-button"}
          key={screen.id}
          onClick={() => onNavigate(screen.id)}
          type="button"
        >
          {screen.label}
        </button>
      ))}
    </nav>
  );
}

function DemoBanner() {
  const usesOfficialData = import.meta.env.VITE_USE_OFFICIAL_GTFS === "true";
  return (
    <div className="demo-banner" role="note">
      <span className="demo-dot" aria-hidden="true" />
      <span>
        <strong>{usesOfficialData ? "公式GTFSの試作表示" : "画面見本のデモ"}</strong>
        <span className="demo-banner-detail">
          {usesOfficialData
            ? `京都バス・京都市営バスのGTFSを表示します。取得版: ${officialFeedNotice()}。個別利用条件の確認前で、本番運用は保留です。`
            : "路線・乗車状況は仮のデータです。記録は保存されません。"}
        </span>
      </span>
    </div>
  );
}

function ProgressOverview({
  routes,
}: {
  routes: DemoRoute[];
}) {
  const summary = summarizeProgress(routes);

  return (
    <section className="progress-overview" aria-label="乗車進捗の概要">
      <div className="progress-overview-copy">
        <span className="eyebrow">路線網の進み具合</span>
        <div className="progress-distance">
          <strong>{summary.visitedKm.toFixed(1)} km</strong>
          <span> / {summary.totalKm.toFixed(1)} km</span>
        </div>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="乗車距離の進捗"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percent}
      >
        <span style={{ width: `${summary.percent}%` }} />
      </div>
      <div className="progress-percent">
        <strong>{summary.percent}%</strong>
        <span>乗車済み</span>
      </div>
    </section>
  );
}

function routeStateOrder(route: DemoRoute): number {
  const order: Record<ProgressState, number> = {
    complete: 0,
    "in-progress": 1,
    "not-started": 2,
  };
  return order[getProgressState(route)];
}

function RouteList({
  routes,
  selectedRouteId,
  onSelectRoute,
}: {
  routes: DemoRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (route: DemoRoute) => void;
}) {
  const [stateFilter, setStateFilter] = useState<RouteStateFilter>("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [query, setQuery] = useState("");
  const operators = [...new Set(routes.map((route) => route.operator))];

  const visibleRoutes = useMemo(() => {
    const filtered = filterRoutes(routes, {
      state: stateFilter,
      operator: operatorFilter === "all" ? undefined : operatorFilter,
    }).filter((route) =>
      `${route.name} ${route.operator} ${route.routeNumber}`
        .toLocaleLowerCase("ja")
        .includes(query.trim().toLocaleLowerCase("ja")),
    );

    return filtered.sort((a, b) => routeStateOrder(a) - routeStateOrder(b));
  }, [operatorFilter, query, routes, stateFilter]);

  return (
    <aside className="route-panel" aria-label="路線一覧">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ROUTES</span>
          <h2>路線を探す</h2>
        </div>
        <span className="route-count">{visibleRoutes.length}路線</span>
      </div>

      <label className="search-field">
        <span className="sr-only">路線名で検索</span>
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="路線名で検索"
          type="search"
          value={query}
        />
      </label>

      <div className="filter-list" aria-label="進捗で絞り込む">
        {(Object.keys(filterLabels) as RouteStateFilter[]).map((state) => (
          <button
            aria-pressed={stateFilter === state}
            className={stateFilter === state ? "filter-chip is-selected" : "filter-chip"}
            key={state}
            onClick={() => setStateFilter(state)}
            type="button"
          >
            {filterLabels[state]}
          </button>
        ))}
      </div>

      <label className="operator-select">
        <span>事業者</span>
        <select
          onChange={(event) => setOperatorFilter(event.target.value)}
          value={operatorFilter}
        >
          <option value="all">すべて</option>
          {operators.map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </select>
      </label>

      <ul className="route-list">
        {visibleRoutes.map((route) => {
          const state = getProgressState(route);
          const distance = route.segments
            .filter((segment) => segment.visited)
            .reduce((total, segment) => total + segment.distanceKm, 0);

          return (
            <li key={route.id}>
              <button
                aria-pressed={selectedRouteId === route.id}
                className={
                  selectedRouteId === route.id ? "route-item is-selected" : "route-item"
                }
                onClick={() => onSelectRoute(route)}
                type="button"
              >
                <span className={`route-state-mark state-${state}`} aria-hidden="true">
                  {state === "complete" ? "✓" : state === "in-progress" ? "◐" : "○"}
                </span>
                <span className="route-item-copy">
                  <span className="route-item-title">{route.name}</span>
                  <span className="route-item-meta">
                    {route.operator} · {route.routeNumber}
                  </span>
                </span>
                <span className="route-item-distance">
                  {distance.toFixed(1)}
                  <small>km</small>
                </span>
                <span className="sr-only">{stateLabels[state]}</span>
              </button>
            </li>
          );
        })}
        {visibleRoutes.length === 0 && (
          <li className="empty-routes">条件に合う路線はありません。</li>
        )}
      </ul>
    </aside>
  );
}

function MapScreen({
  routes,
}: {
  routes: DemoRoute[];
}) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const downloadSvg = () => {
    const svg = createProgressSvg(routes, {
      title: "京都バス乗車進捗",
      attribution: import.meta.env.VITE_USE_OFFICIAL_GTFS === "true"
        ? `京都バス・京都市営バスのODPT GTFS（${officialFeedNotice()}）`
        : "画面見本の仮データ",
    });
    const file = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = url;
    link.download = "kyoto-bus-progress-demo.svg";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("画面見本のSVGをダウンロードしました。");
  };

  return (
    <>
      <div className="screen-heading">
        <div>
          <span className="eyebrow">KYOTO BUS RIDE MAP</span>
          <h1>走った道を、京都の地図に。</h1>
          <p>乗った区間を重ねながら、路線網の景色を少しずつ変えていこう。</p>
        </div>
        <button className="button button-secondary export-button" onClick={downloadSvg} type="button">
          <span aria-hidden="true">↗</span>
          SVGをダウンロード
        </button>
      </div>

      <DemoBanner />
      <ProgressOverview routes={routes} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <div className="map-layout">
        <RouteList
          onSelectRoute={(route) => setSelectedRouteId(route.id)}
          routes={routes}
          selectedRouteId={selectedRouteId}
        />
        <section className="map-card" aria-label="路線の進捗地図">
          <div className="map-card-heading">
            <div>
              <h2>京都の路線網</h2>
              <p>路線は読みやすさのため、重なる場所で少しずらしています。</p>
            </div>
            <span className="map-live-dot">
              <span aria-hidden="true" />
              地図
            </span>
          </div>
          <Suspense fallback={<div className="map-loading">地図を準備しています…</div>}>
            <MapView
              onSelectRoute={setSelectedRouteId}
              routes={routes}
              selectedRouteId={selectedRouteId}
            />
          </Suspense>
          <div className="map-legend" aria-label="地図の凡例">
            <span><i className="legend-line legend-visited" aria-hidden="true" />乗車済み</span>
            <span><i className="legend-line legend-unvisited" aria-hidden="true" />未乗車</span>
          </div>
        </section>
      </div>
    </>
  );
}

function RecordScreen({
  records,
  routes,
  onAddRecord,
  onDeleteRecord,
  onReplaceRecords,
}: {
  records: RideRecord[];
  routes: DemoRoute[];
  onAddRecord: (record: RideRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  onReplaceRecords: (records: RideRecord[]) => void;
}) {
  const [selectedRouteId, setSelectedRouteId] = useState(routes[0]?.id ?? "");
  const [boardingStop, setBoardingStop] = useState(routes[0]?.segments[0]?.fromStop ?? "");
  const [alightingStop, setAlightingStop] = useState(
    routes[0]?.segments.at(-1)?.toStop ?? "",
  );
  const [notice, setNotice] = useState("");
  const [rideDate, setRideDate] = useState(() => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().slice(0, 10);
  });
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const stopNames = [
    ...new Set(
      selectedRoute.segments.flatMap((segment) => [segment.fromStop, segment.toStop]),
    ),
  ];

  const downloadText = (filename: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    downloadText(
      "kyoto-bus-rides.csv",
      exportRideRecordsCsv(records, routes),
      "text/csv;charset=utf-8",
    );
    setNotice("乗車履歴をCSVで保存しました。");
  };

  const downloadBackup = () => {
    downloadText(
      "kyoto-bus-rides-backup.json",
      JSON.stringify(records, null, 2),
      "application/json",
    );
    setNotice("復元用のJSONバックアップを保存しました。");
  };

  const restoreBackup = async (file: File) => {
    const imported = importRideRecordsJson(await file.text());
    if (imported.length === 0) {
      setNotice("復元できる乗車記録が見つかりませんでした。");
      return;
    }
    onReplaceRecords(imported);
    setNotice(`${imported.length}件の記録を復元しました。`);
  };

  return (
    <section className="secondary-screen">
      <div className="screen-heading">
        <div>
          <span className="eyebrow">YOUR JOURNEY</span>
          <h1>乗車を記録する</h1>
          <p>乗った日と区間を残して、あとから地図で振り返ろう。</p>
        </div>
      </div>
      <DemoBanner />
      <div className="form-card">
        <div className="form-card-heading">
          <span className="form-icon" aria-hidden="true">01</span>
          <div>
            <h2>どの区間に乗った？</h2>
            <p>乗車した事業者、路線、停留所を選びます。</p>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const record = createRideRecord({
              routeId: selectedRouteId,
              boardedStopId: boardingStop,
              alightedStopId: alightingStop,
              rideDate,
              routes,
            });
            if (!record) {
              setNotice("乗った停留所と降りた停留所を異なる区間で選択してください。");
              return;
            }
            onAddRecord(record);
            setNotice(`${record.distanceKm.toFixed(1)} kmをブラウザーに保存しました。`);
          }}
        >
          <label>
            <span>乗車日</span>
            <input
              onChange={(event) => setRideDate(event.target.value)}
              type="date"
              value={rideDate}
            />
          </label>
          <label>
            <span>路線</span>
            <select
              onChange={(event) => {
                const route =
                  routes.find((candidate) => candidate.id === event.target.value) ??
                  routes[0];
                setSelectedRouteId(route.id);
                setBoardingStop(route.segments[0].fromStop);
                setAlightingStop(route.segments.at(-1)?.toStop ?? "");
              }}
              value={selectedRouteId}
            >
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.operator} · {route.name}
                </option>
              ))}
            </select>
          </label>
          <div className="stop-fields">
            <label>
              <span>乗った停留所</span>
              <select
                onChange={(event) => setBoardingStop(event.target.value)}
                value={boardingStop}
              >
                {stopNames.map((stop) => (
                  <option key={stop} value={stop}>
                    {stop}
                  </option>
                ))}
              </select>
            </label>
            <span className="stop-arrow" aria-hidden="true">→</span>
            <label>
              <span>降りた停留所</span>
              <select
                onChange={(event) => setAlightingStop(event.target.value)}
                value={alightingStop}
              >
                {stopNames.map((stop) => (
                  <option key={stop} value={stop}>
                    {stop}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-footer">
            <p>このブラウザーに保存します。クラウド同期は未接続です。</p>
            <button className="button button-primary" type="submit">
              記録を保存
            </button>
          </div>
          {notice && <p className="notice" role="status">{notice}</p>}
        </form>
      </div>
      <section className="backup-card" aria-labelledby="backup-title">
        <div>
          <span className="eyebrow">BACKUP</span>
          <h2 id="backup-title">履歴を残す</h2>
          <p>CSVは一覧として、JSONはブラウザーへ復元するためのバックアップとして保存できます。</p>
        </div>
        <div className="backup-actions">
          <button className="button button-secondary" onClick={downloadCsv} type="button">
            CSVで保存
          </button>
          <button className="button button-secondary" onClick={downloadBackup} type="button">
            復元用JSON
          </button>
          <label className="button button-secondary backup-import">
            <span>JSONを読み込む</span>
            <input
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void restoreBackup(file);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
        </div>
      </section>
      <section className="history-card" aria-labelledby="ride-history-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">HISTORY</span>
            <h2 id="ride-history-title">乗車履歴</h2>
          </div>
          <span className="route-count">{records.length}件</span>
        </div>
        {records.length === 0 ? (
          <p className="history-empty">まだ記録がありません。</p>
        ) : (
          <ul className="history-list">
            {[...records].sort((a, b) => b.rideDate.localeCompare(a.rideDate)).map((record) => {
              const route = routes.find((candidate) => candidate.id === record.routeId);
              return (
                <li className="history-row" key={record.id}>
                  <div>
                    <strong>{record.rideDate}</strong>
                    <span>{route?.operator} · {route?.name}</span>
                    <small>{record.boardedStopId} → {record.alightedStopId}</small>
                  </div>
                  <span className="history-distance">{record.distanceKm.toFixed(1)} km</span>
                  <button
                    aria-label={`${record.rideDate}の記録を削除`}
                    className="history-delete"
                    onClick={() => onDeleteRecord(record.id)}
                    type="button"
                  >
                    削除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

function GroupScreen({
  records,
}: {
  records: RideRecord[];
}) {
  const selfDistance = summarizeMemberDistance(records);

  return (
    <section className="secondary-screen">
      <div className="screen-heading">
        <div>
          <span className="eyebrow">RIDE TOGETHER</span>
          <h1>みんなの進捗</h1>
          <p>それぞれのペースで乗った道を、距離だけ並べてみよう。</p>
        </div>
      </div>
      <DemoBanner />
      <section className="privacy-note" aria-label="共有する情報">
        <span className="privacy-icon" aria-hidden="true">◎</span>
        <div>
          <h2>個人別の合計距離だけを共有</h2>
          <p>どの路線に、いつ乗ったかの詳細は、本人だけが見られる設計です。</p>
        </div>
        <span className="privacy-tag">プライバシー優先</span>
      </section>
      <section className="group-card" aria-labelledby="group-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">YOUR CIRCLE</span>
            <h2 id="group-title">おでかけ仲間</h2>
          </div>
          <button className="button button-secondary" disabled type="button">
            招待設定は未接続
          </button>
        </div>
        <ul className="member-list">
          {[
            { name: "あなた", distance: selfDistance.toFixed(1), initials: "自", tone: "mint" },
            { name: "メンバーA", distance: "5.8", initials: "A", tone: "blue" },
            { name: "メンバーB", distance: "1.4", initials: "B", tone: "peach" },
          ].map((member, index) => (
            <li className="member-row" key={member.name}>
              <span className={`member-avatar avatar-${member.tone}`}>{member.initials}</span>
              <span className="member-name">
                <strong>{member.name}</strong>
                {index === 0 && <small>自分</small>}
              </span>
              <span className="member-distance">
                <strong>{member.distance}</strong>
                <span>km</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="group-footnote">表示しているメンバーと距離は画面見本用です。</p>
      </section>
    </section>
  );
}

function SetupScreen({
  missing,
  configurationError,
}: {
  missing: string[];
  configurationError?: string;
}) {
  return (
    <main className="setup-screen">
      <div className="setup-mark" aria-hidden="true">京</div>
      <span className="eyebrow">KYOTO BUS RIDE MAP</span>
      <h1>京都バス乗車記録</h1>
      <p className="setup-lead">
        本番用の記録と共有は、クラウド接続と公式路線データを準備してから使えます。
      </p>
      <div className="setup-card">
        <h2>まだ準備中です</h2>
        <p>仮の路線や記録を本物のデータのように見せないため、本番モードでは画面見本を表示していません。</p>
        {configurationError && <p className="auth-error" role="alert">{configurationError}</p>}
        {missing.length > 0 && (
          <div className="missing-settings">
            <span>設定が必要な項目</span>
            <ul>{missing.map((name) => <li key={name}>{name}</li>)}</ul>
          </div>
        )}
        <p className="setup-help">画面の確認には、開発用のデモモードを使ってください。</p>
      </div>
    </main>
  );
}

function ConfiguredApp() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const missing = [
    !supabaseUrl ? "VITE_SUPABASE_URL" : null,
    !publishableKey ? "VITE_SUPABASE_PUBLISHABLE_KEY" : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) return <SetupScreen missing={missing} />;

  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return (
      <SetupScreen
        configurationError="VITE_SUPABASE_URLは有効なURLではありません。.env.localの値を確認してください。"
        missing={[]}
      />
    );
  }

  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) {
    return (
      <SetupScreen
        configurationError="Supabase URLにはHTTPSを指定してください。ローカル開発ではlocalhostのみHTTPを使えます。"
        missing={[]}
      />
    );
  }

  return <ConfiguredAuth supabaseUrl={supabaseUrl} publishableKey={publishableKey} />;
}

function ConfiguredAuth({
  supabaseUrl,
  publishableKey,
}: {
  supabaseUrl: string;
  publishableKey: string;
}) {
  const client = getSupabaseClient(supabaseUrl, publishableKey);
  return <AuthScreen client={client} />;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("map");
  const [records, setRecords] = useState<RideRecord[]>(() => loadRideRecords());
  const routes = useMemo(
    () => applyRideProgress(activeRoutes(), records),
    [records],
  );

  if (!isDemoMode()) return <ConfiguredApp />;

  const addRecord = (record: RideRecord) => {
    setRecords((current) => {
      const next = [record, ...current];
      saveRideRecords(next);
      return next;
    });
  };

  const deleteRecord = (recordId: string) => {
    setRecords((current) => {
      const next = current.filter((record) => record.id !== recordId);
      saveRideRecords(next);
      return next;
    });
  };

  const replaceRecords = (next: RideRecord[]) => {
    setRecords(next);
    saveRideRecords(next);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="京都バス乗車記録、地図へ">
          <span className="brand-mark" aria-hidden="true">京</span>
          <span className="brand-name">京バスノート</span>
        </a>
        <AppNavigation
          activeScreen={screen}
          className="desktop-nav"
          onNavigate={setScreen}
        />
        <div className="header-account">
          <span className="account-avatar" aria-hidden="true">?</span>
          <span>デモ利用中</span>
        </div>
      </header>

      <main className="page-content">
        {screen === "map" && <MapScreen routes={routes} />}
        {screen === "record" && (
          <RecordScreen
            onAddRecord={addRecord}
            onDeleteRecord={deleteRecord}
            onReplaceRecords={replaceRecords}
            records={records}
            routes={routes}
          />
        )}
        {screen === "group" && <GroupScreen records={records} />}
      </main>

      <AppNavigation
        activeScreen={screen}
        className="mobile-nav"
        onNavigate={setScreen}
      />
    </div>
  );
}
