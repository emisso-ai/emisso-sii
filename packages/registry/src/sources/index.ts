/**
 * Barrel for all source adapters. Each adapter is independently importable so
 * downstream consumers can compose only the sources they actually use.
 */

export { createEmpresasEnUnDiaAdapter } from "./empresas-en-un-dia";
export { createChileCompraAdapter } from "./chilecompra";
export { createCmfAdapter } from "./cmf";
export { createSofofaAdapter } from "./sofofa";
export { createCncAdapter } from "./cnc";
export { createDiarioOficialAdapter } from "./diario-oficial";
export { createSiiStcAdapter } from "./sii-stc";
