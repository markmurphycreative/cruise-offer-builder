# cruise-offer-builder
Internal cruise e-shot builder with automated UTMs and export tools.

## Export structure

Campaign Pack exports use the following top-level folders:

- `assets/` for supporting source assets.
- `offer-cards/` for rendered offer card PNGs and CTA JPG assets.
- `summary/` for campaign summaries, recovery data and the UTM lookup fallback.
- `utms/` for the full UTM CSV export.

All-card ZIP exports also place rendered visual assets in `offer-cards/` so Klaviyo upload workflows can use one folder for both offer cards and CTA images. Exported filenames are unchanged; only the folder destination changes.

## UTM metadata fallback

Browser-generated downloads cannot reliably write macOS Finder “Get Info” comments because downloads are exposed to web code as file-like `Blob` / `File` data and browser save APIs only let the page provide file contents and a suggested filename, not macOS extended attributes such as Finder comments.

Instead, Campaign Pack export writes `summary/utm_lookup.csv` automatically from the same generated UTM data used by the builder. The CSV has the shape:

```csv
filename,utm
020626_marella_captivating_coasts_card2.png,https://...
020626_pando_caribbean_escape_card1.png,https://...
```
