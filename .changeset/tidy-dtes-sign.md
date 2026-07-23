---
"@emisso/sii": minor
---

Implement `buildDteXml`, `applyTimbre` and `signDte` for DTE types 33 (Factura Electrónica) and 39 (Boleta Electrónica).

- `buildDteXml`: builds the `<DTE>` / `<Documento ID="F{folio}T{tipo}">` XML with type-specific element names (RznSoc/GiroEmis/Acteco for 33; RznSocEmisor/GiroEmisor for 39), derives MntNeto/IVA from MntTotal when omitted (IVA as exact remainder, never a second rounding), validates receiver requirements for facturas, and treats line amounts as GROSS: for type 33 lines are converted to net with the rounding difference absorbed into the last affected line so the detail sums to MntNeto exactly.
- `applyTimbre`: builds a real TED signed RSA-SHA1 with the CAF private key over the compact `<DD>` block, embedding the original `<CAF>` block verbatim. Signature changed to `(xml, caf: FolioRange)` and `FolioRangeSchema` gained an optional `cafXml` field, since SII's `<FRMA>` signature inside the CAF cannot be reconstructed from parsed fields.
- `signDte`: XMLDSig over the `<Documento>` (Reference by ID + C14N transform), inserted as sibling of `<Documento>` inside `<DTE>`; must run after `applyTimbre`.
- `DteDocumentSchema` gained an optional `indServicio` (1|2|3) emitted only for boletas and only when explicitly set. Timestamps (TSTED/TmstFirma) use America/Santiago wall time.
