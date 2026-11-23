import { registerConnector } from "../registry.ts";
import { mcleodTrackAndTraceConnector } from "./mcleod-track-and-trace.ts";
import { samsaraConnector } from "./samsara.ts";

let registered = false;

export function registerBuiltinConnectors(): void {
  if (registered) return;
  registerConnector(mcleodTrackAndTraceConnector);
  registerConnector(samsaraConnector);
  registered = true;
}
