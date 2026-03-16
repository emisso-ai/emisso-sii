/**
 * sii auth login — authenticate with .p12 cert, print token
 */

import { Command, Options } from "@effect/cli";
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

const certOption = Options.text("cert").pipe(
  Options.optional,
  Options.withDescription("Path to .p12 certificate file"),
);

const passwordOption = Options.text("password").pipe(
  Options.optional,
  Options.withDescription("Certificate password"),
);

const envOption = Options.text("env").pipe(
  Options.optional,
  Options.withDescription("SII environment: certification (default) or production"),
);

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

      let config: ReturnType<typeof resolveCertConfig>;
      try {
        config = resolveCertConfig(flags);
      } catch (e) {
        if (e instanceof CliError) return yield* Effect.fail(e);
        throw e;
      }

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
