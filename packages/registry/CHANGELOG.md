# @emisso/registry-cl

## 0.1.1

### Patch Changes

- 48af1da: Fix typo in `CompanySignals` field: `venceAlEstado` (vence/expires) → `vendeAlEstado` (vende/sells). The field tracks companies that sell to the state via ChileCompra contracts; the prior name was a misspelling that diverged from the canonical Spanish term used elsewhere in the SDK and downstream consumers. Updates `types.ts`, `cache.ts`, `merge.ts`, and the corresponding test fixtures. Internal SQLite column `signal_vende_estado` was already correct — only the TypeScript field name changed.
