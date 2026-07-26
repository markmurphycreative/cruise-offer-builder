# Protected Cruise and Package working baseline

## Baseline identity

The protected working baseline is commit
`6e098ce0e45a5f6642b7ade5610640efb9f37e10` (`Merge pull request #859 from
markmurphycreative/codex/restore-original-arrange-cards-functionality`).

This SHA identifies the approved application implementation before regression
protection was added. It is the source of truth for future Cruise, Package, and
shared-system changes. Do not reconstruct the approved behaviour from this
document or from memory; compare proposed changes with the implementation at
that commit.

## Protected contracts

- The compact **Arrange Cards** control, its left/right buttons, and direct
  offer-tab drag and drop are the only card-order interfaces. Reordering changes
  the authoritative offer collection and its parallel lock state atomically,
  regenerates position-based UTMs and every dependent view immediately, and
  autosaves only after the refresh completes. There is no modal or confirmation
  step.
- The complete **Tracking Links** section remains available for both campaign
  types, including Operator Landing Page, the current-card link, all detailed
  card links, their labels and values, and copy controls.
- Import text and parser results are drafts. Only an explicit **Load Offers**
  action may commit them. Input, Enter, clearing a draft, navigation, view
  changes, sidebar activity, and autosave must not replace committed offers.
- Autosave and campaign-file persistence serialize the authoritative collection
  selected by `campaignType`, never draft text, parser state, or preview DOM.
- All 4 renders a complete 2-by-2 canvas before applying one scale transform.
  Cruise uses Cruise-native geometry and Package uses Package-native geometry;
  Single and Email transforms do not leak into All 4.
- Cruise and Package select their import, parser, normalization, model, defaults,
  geometry, rendering, and validation paths explicitly from authoritative
  `campaignType`. State from one campaign type must not enter the other.

## Mandatory change control

For every future change, inventory each touched production file and identify it
as Cruise, Package, or shared. Keep the patch within the requested behaviour and
do not refactor protected code unless explicitly required. Run the complete
Node regression suite, including `tests/protected-paired-workflow-baseline.test.js`,
and treat any unrelated difference from the baseline commit as a failure.

The paired workflow represented by the permanent tests is:

1. Load four Cruise offers, inspect Single, All 4, Email, detailed tracking,
   summary, and exports; move offer 4 to position 1; verify immediate card and
   UTM renumbering; leave unrelated multi-offer draft text; navigate and
   autosave; then save/reopen and verify content, order, locks, and links.
2. Repeat with four Package offers imported through the Package route.
3. Restore Cruise after Package and Package after Cruise, then repeat in the
   opposite order. Each restored authoritative collection must equal its saved
   snapshot and retain its own campaign type and geometry.

Passing a narrow unit test is not enough when a change affects either real
campaign workflow. The protected Cruise and Package regression suites must both
pass before completion.
