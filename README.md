# em
Internal campaign e-shot tool with automated UTMs and export tools.

## Campaign Pack exports

Campaign Pack exports use the following top-level folders:

- `offer-cards/` for rendered offer cards and CTA assets.
- `summary/` for campaign summary files.
- `utms/` for the full UTM CSV export.

All-card ZIP exports also place rendered visual assets in `offer-cards/` so Klaviyo upload workflows can use one folder for both offer cards and CTA images. Exported filenames are unchanged; only the folder destination changes.

## UTM metadata fallback

Browser-generated downloads cannot reliably write macOS Finder “Get Info” comments because downloads are exposed to web code as file-like `Blob` / `File` data and browser save APIs only let the page provide file contents and a suggested filename, not macOS extended attributes such as Finder comments.

Instead, Campaign Pack export writes `summary/utm_lookup.csv` automatically from the same generated UTM data used by em. The CSV has the shape:

```csv
filename,utm
offer-1.png,https://example.com/?utm_source=klaviyo...
```
Trigger fresh Pages deployment
