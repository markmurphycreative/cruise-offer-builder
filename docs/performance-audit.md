# Performance audit and optimisation report

## Scope measured

The audit focused on the user-visible flows called out in Prompt 4:

- Campaign loading from CSV / Sheet data.
- Campaign switching between offer tabs.
- Operator logo switching as part of active-offer edit refreshes.
- Hero image replacement.
- Preview rendering for Single, All 4, and Email views.
- Summary generation.
- Export preparation.
- UTM generation.

## Findings

The slowdown was not caused by a single image asset or one expensive calculation. The repeated cost came from duplicate refresh work after earlier compatibility patches had layered wrappers over the same global functions.

### Where time was being spent

1. **Preview rendering** rebuilds full card DOM with `innerHTML`, then immediately measures layout (`offsetHeight`) to size the scaler. This is expected for visual correctness, but it means unnecessary extra render passes are costly.
2. **All 4 and Email preview modes** rebuild every loaded card. The expensive part is not the string generation alone; it is the DOM replacement plus follow-up layout work, crop positioning, drop-target enhancement, and hero-picker binding for each card.
3. **UTM refreshes** were being triggered from multiple paths in the same user action. The wrapper at the bottom of the app called `genStandardUtms()` after `load`, `rv`, `sv`, `up`, and `processSheetCSV`, even when those functions had already regenerated UTMs directly.
4. **CTA settings reads** happened repeatedly inside multi-card preview loops. This is small in isolation, but it adds duplicate DOM reads to the heaviest paths.
5. **Campaign loading** intentionally runs CSV parse, editor hydration, status checks, preview render, UTM generation, and export filename updates. That full cascade is necessary, but duplicate UTM/render work inside the cascade made it feel slower.

## Optimisations made

- Added opt-in performance instrumentation. Set `localStorage.cobPerfAudit = "1"`, exercise the app, then inspect `window.COB_PERF_AUDIT` in DevTools.
- Coalesced the Standard UTM compatibility wrapper with a microtask queue so multiple calls in the same action collapse to one `genStandardUtms()` run.
- Cached CTA settings once per preview render and reused the value for Single / Email / All 4 preview generation.
- Removed the double card HTML assignment in All 4 view when CTA is enabled; the card now chooses the CTA or non-CTA render path once.
- Added timing records for campaign loading, campaign switching, hero image replacement, preview rendering, summary generation, export preparation, and UTM generation.

## Behaviour preserved

No user-facing behaviour was intentionally changed. Rendering still uses the existing card HTML, image crop positioning, hero-picker/drop-target setup, UTM builders, summary builder, and export pack flow.

## How to measure after this change

In the browser console:

```js
localStorage.setItem('cobPerfAudit', '1');
window.COB_PERF_AUDIT = [];
```

Then perform the target flows. Inspect:

```js
console.table(window.COB_PERF_AUDIT);
```

To disable:

```js
localStorage.removeItem('cobPerfAudit');
```
