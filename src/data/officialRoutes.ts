import officialRoutesJson from "./official-routes.json";
import type { DemoRoute } from "./demoRoutes";

export const officialRoutes = officialRoutesJson as unknown as DemoRoute[];
