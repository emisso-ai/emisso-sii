/**
 * sii cert verify — load and validate .p12 file
 */

import { Command } from "@effect/cli";
import { Effect, Option } from "effect";
import { loadCertFromFile } from "@emisso/sii";
import {
  OutputRenderer,
  CliError,
  resolveFormat,
  formatOption,
  jsonFlag,
} from "@emisso/cli-core";
import { certColumns } from "../../formatters/sii-table.js";
import { resolveCertConfig, type CertFlags } from "../../config/resolve.js";
import { certOption, passwordOption } from "../../options.js";
import { effectifyConfig } from "../../utils.js";

const options = {
  cert: certOption,
  password: passwordOption,
  format: formatOption,
  json: jsonFlag,
};

export const certVerifyCommand = Command.make(
  "verify",
  options,
  ({ cert, password, format, json }) =>
    Effect.gen(function* () {
      const renderer = yield* OutputRenderer;
      const resolvedFormat = resolveFormat(format, json);

      const flags: CertFlags = {
        cert,
        password,
        env: Option.none(),
      };

      const config = yield* effectifyConfig(() => resolveCertConfig(flags));

      const certData = yield* Effect.try({
        try: () => loadCertFromFile(config.certPath, config.certPassword),
        catch: (error) =>
          new CliError({
            kind: "auth",
            message: "Failed to load certificate",
            detail: error instanceof Error ? error.message : String(error),
          }),
      });

      const certificate = certData.certificate;
      const now = new Date();
      const isExpired = now > certificate.validity.notAfter;
      const hasPrivateKey = !!certData.privateKey;

      const rows = [
        { field: "File", value: config.certPath },
        { field: "Loaded", value: "Yes" },
        { field: "Private Key", value: hasPrivateKey ? "Present" : "Missing" },
        { field: "Certificate", value: "Present" },
        { field: "Expired", value: isExpired ? "Yes" : "No" },
        { field: "Valid Until", value: certificate.validity.notAfter.toISOString() },
      ];

      yield* renderer.render(rows, {
        columns: certColumns,
        ttyDefault: "table",
      }, { format: resolvedFormat });

      if (isExpired || !hasPrivateKey) {
        process.exitCode = 1;
      }
    }),
).pipe(Command.withDescription("Load and validate a .p12 certificate file"));
