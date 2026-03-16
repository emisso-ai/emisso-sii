/**
 * Config resolution: CLI flags → env vars → defaults
 */

import type { SiiConfig, SiiEnv, PortalConfig } from "@emisso/sii";
import { CliError } from "@emisso/cli-core";
import type { Option } from "effect";
import { Option as O } from "effect";

export interface CertFlags {
  cert: Option.Option<string>;
  password: Option.Option<string>;
  env: Option.Option<string>;
}

export interface PortalFlags {
  rut: Option.Option<string>;
  clave: Option.Option<string>;
  env: Option.Option<string>;
}

function getOrEnvOrThrow(
  flag: Option.Option<string>,
  envVar: string,
  fieldName: string,
): string {
  const flagValue = O.getOrUndefined(flag);
  if (flagValue !== undefined) return flagValue;

  const envValue = process.env[envVar];
  if (envValue !== undefined && envValue !== "") return envValue;

  throw new CliError({
    kind: "bad-args",
    message: `Missing required option: --${fieldName}`,
    detail: `Provide --${fieldName} or set ${envVar} environment variable`,
  });
}

function resolveEnv(flag: Option.Option<string>): SiiEnv {
  const value = O.getOrUndefined(flag) ?? process.env.SII_ENV ?? "certification";
  if (value !== "certification" && value !== "production") {
    throw new CliError({
      kind: "bad-args",
      message: `Invalid environment: ${value}`,
      detail: "Must be 'certification' or 'production'",
    });
  }
  return value;
}

export function resolveCertConfig(flags: CertFlags): SiiConfig {
  return {
    certPath: getOrEnvOrThrow(flags.cert, "SII_CERT_PATH", "cert"),
    certPassword: getOrEnvOrThrow(flags.password, "SII_CERT_PASSWORD", "password"),
    env: resolveEnv(flags.env),
  };
}

export function resolvePortalConfig(flags: PortalFlags & CertFlags): PortalConfig & { env: SiiEnv } {
  return {
    rut: getOrEnvOrThrow(flags.rut, "SII_RUT", "rut"),
    claveTributaria: getOrEnvOrThrow(flags.clave, "SII_CLAVE", "clave"),
    env: resolveEnv(flags.env),
  };
}
