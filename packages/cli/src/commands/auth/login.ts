/**
 * sii auth login — authenticate with .p12 cert, print token
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

export const authLoginCommand = Command.make(
  "login",
  options,
  ({ cert, password, env, format, json }) =>
    Effect.gen(function* () {
      const renderer = yield* OutputRenderer;
      const resolvedFormat = resolveFormat(format, json);

      const flags: CertFlags = { cert, password, env };
      const config = yield* effectifyConfig(() => resolveCertConfig(flags));

      const token = yield* Effect.tryPromise({
        try: () => authenticate(config),
        catch: (error) =>
          new CliError({
            kind: "auth",
            message: "Authentication failed",
            detail: error instanceof Error ? error.message : String(error),
          }),
      });

      const rows = [
        { field: "Token", value: token.token },
        { field: "Expires At", value: token.expiresAt.toISOString() },
        { field: "Environment", value: config.env },
      ];

      yield* renderer.render(rows, {
        columns: authColumns,
        ttyDefault: "table",
      }, { format: resolvedFormat });
    }),
).pipe(Command.withDescription("Authenticate with SII using .p12 certificate"));
