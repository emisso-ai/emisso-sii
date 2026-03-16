/**
 * Shared CLI option definitions — DRY across all command files
 */

import { Options } from "@effect/cli";

export const certOption = Options.text("cert").pipe(
  Options.optional,
  Options.withDescription("Path to .p12 certificate file"),
);

export const passwordOption = Options.text("password").pipe(
  Options.optional,
  Options.withDescription("Certificate password"),
);

export const envOption = Options.text("env").pipe(
  Options.optional,
  Options.withDescription("SII environment: certification (default) or production"),
);

export const rutOption = Options.text("rut").pipe(
  Options.optional,
  Options.withDescription("Company RUT for portal login"),
);

export const claveOption = Options.text("clave").pipe(
  Options.optional,
  Options.withDescription("Clave tributaria (portal password)"),
);
