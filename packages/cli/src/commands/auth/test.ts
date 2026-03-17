/**
 * sii auth test — verify token is still valid
 */

import { Command } from "@effect/cli";
import { Effect } from "effect";
import { authenticate } from "@emisso/sii";
import {
  OutputRenderer,
  CliError,
  resolveFormat,
  formatOption,
  jsonFlag,
} from "@emisso/cli-core";
import { authColumns } from "../../formatters/sii-table.js";
import { resolveCertConfig, type CertFlags } from "../../config/resolve.js";
import { certOption, passwordOption, envOption } from "../../options.js";
import { effectifyConfig } from "../../utils.js";

const options = {
  cert: certOption,
  password: passwordOption,
  env: envOption,
  format: formatOption,
  json: jsonFlag,
};

export const authTestCommand = Command.make(
  "test",
  options,
  ({ cert, password, env, format, json }) =>
    Effect.gen(function* () {
      const renderer = yield* OutputRenderer;
      const resolvedFormat = resolveFormat(format, json);

      const flags: CertFlags = { cert, password, env };
      const config = yield* effectifyConfig(() => resolveCertConfig(flags));

      const startMs = Date.now();

      const token = yield* Effect.tryPromise({
        try: () => authenticate(config),
        catch: (error) =>
          new CliError({
            kind: "auth",
            message: "Authentication failed",
            detail: error instanceof Error ? error.message : String(error),
          }),
      });

      const elapsedMs = Date.now() - startMs;
      const isValid = token.expiresAt > new Date();

      const rows = [
        { field: "Status", value: isValid ? "OK" : "EXPIRED" },
        { field: "Token", value: token.token.slice(0, 20) + "..." },
        { field: "Expires At", value: token.expiresAt.toISOString() },
        { field: "Environment", value: config.env },
        { field: "Elapsed", value: `${elapsedMs}ms` },
      ];

      yield* renderer.render(rows, {
        columns: authColumns,
        ttyDefault: "table",
      }, { format: resolvedFormat });

      if (!isValid) {
        process.exitCode = 3;
      }
    }),
).pipe(Command.withDescription("Test SII authentication and verify token validity"));
