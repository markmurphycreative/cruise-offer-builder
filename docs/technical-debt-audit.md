# Technical Debt Audit — 2026-07-08

## Scope

Maintenance audit for safe cleanup opportunities in the single-page campaign builder. The pass focused on duplicate helpers, unused code/assets, legacy wording/code, repeated rendering logic, stale comments, and compatibility-sensitive areas.

## Findings

| Area | Finding | Classification | Action |
| --- | --- | --- | --- |
| Test-coupled constants | `RETURN_EMBARKATION_PORTS` looks unused in runtime code, but itinerary regression tests extract it directly to assemble their render context. | Needs caution | Left in place after validation showed removing it would break existing tests. |
| Unused global wrappers | Several globally scoped helpers appear to have a single definition and no repo references, including `removeItineraryImage`, `replaceItineraryImage`, `centreHeroImage`, `setHeroCropAxis`, `detectRouteMapArtworkBounds`, and older export wrapper names. | Needs caution | Left in place because inline/browser integrations or manual console workflows may still depend on global function names. |
| Legacy compatibility paths | Crop-position normalisation, old UTM output nodes, autosave/session restore, and campaign import/export compatibility code remain present. | Leave alone | Preserved to avoid regressions with legacy campaign files and saved browser state. |
| Repeated rendering logic | Single, email, all-card, export, hero, and itinerary rendering paths share similar sequencing patterns. | Needs caution | Left in place; consolidating these paths would be a behavioural refactor and needs dedicated visual/export regression coverage. |
| CSS selector audit | The stylesheet contains many state and render-only selectors that are applied dynamically rather than appearing directly in static markup. | Needs caution | No CSS removed, because static selector matching would risk false positives and visual changes. |
| Assets | Operator logos are referenced directly by configuration/tests or are available UI choices. | Leave alone | No assets removed. |
| Comments | Most legacy/compatibility comments describe current compatibility constraints, especially around CSV imports, autosave, UTM generation, and preview rendering. | Leave alone | No comment-only cleanup performed. |

## Cleanup completed

- No runtime code, CSS, copy, assets, save/load/import/export paths, or compatibility logic were removed in this pass. The audit found candidates, but validation showed the only apparently safe runtime removal was test-coupled, so it was left in place.

## Validation notes

- Existing automated tests were run after the audit.
- JavaScript syntax was checked with `node --check` using the script extracted from `index.html`.
- A targeted itinerary test run proved `RETURN_EMBARKATION_PORTS` is required by current tests, so it was not removed.
- No UI styling, copy, save/load/import/export logic, or campaign compatibility behaviour was changed.
