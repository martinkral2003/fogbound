// Client-side extension points for the v0.3 rework (renderer = scene objects, ui = DOM). See V3.md.
import * as dungeonsView from './dungeons_view.js';
import * as aimView from './aim_view.js'; // HERO lane: skill aim indicator
import * as travelUi from './travel_ui.js';
import * as perksUi from './perks_ui.js';
import * as townsView from './towns_view.js';
import * as hordeView from './horde_view.js';
import * as townsUi from './towns_ui.js';
import * as recruitsUi from './recruits_ui.js';
import * as hudUi from './hud_ui.js';

export function createViewsV3(ctx) {
  const list = [dungeonsView, aimView, townsView, hordeView].map((m) => m.createView(ctx)).filter(Boolean);
  return {
    frame(st, alpha, dt) { for (const v of list) if (v.frame) v.frame(st, alpha, dt); },
    handleEvents(events) { for (const v of list) if (v.handleEvents) v.handleEvents(events); },
    dispose() { for (const v of list) if (v.dispose) v.dispose(); },
  };
}
export function createUisV3(ctx) {
  const list = [travelUi, perksUi, townsUi, recruitsUi, hudUi].map((m) => m.createUi(ctx)).filter(Boolean);
  return {
    update(dt) { for (const u of list) if (u.update) u.update(dt); },
    handleEvents(events) { for (const u of list) if (u.handleEvents) u.handleEvents(events); },
    drawMinimap(mx, P, renderer, dt, phase) { for (const u of list) if (u.drawMinimap) u.drawMinimap(mx, P, renderer, dt, phase); }, // minimap overlays ('under' the fog mask / 'over' it)
    get open() { return list.some((u) => u.open); }, // any v3 panel/map open (controls ignore game keys while true)
  };
}
