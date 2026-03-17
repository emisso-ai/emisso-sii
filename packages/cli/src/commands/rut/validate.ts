/**
 * sii rut validate <rut>
 */

import { Command, Args } from "@effect/cli";
import { Effect } from "effect";
import { validateRut, formatRut } from "@emisso/sii";
import {
  OutputRenderer,
  resolveFormat,
  formatOption,
  jsonFlag,
} from "@emisso/cli-core";
import { rutColumns } from "../../formatters/sii-table.js";

const rutArg = Args.text({ name: "rut" }).pipe(
  Args.withDescription("RUT to validate (e.g. 12345678-5 or 12.345.678-5)"),
);

const options = { format: formatOption, json: jsonFlag };

export const rutValidateCommand = Command.make(
  "validate",
  { args: rutArg, ...options },
  ({ args: rut, format, json }) =>
    Effect.gen(function* () {
      const renderer = yield* OutputRenderer;
      const isValid = validateRut(rut);
      const formatted = isValid ? formatRut(rut) : rut;
      const resolvedFormat = resolveFormat(format, json);

      const rows = [
        { field: "RUT", value: rut },
        { field: "Válido", value: isValid ? "Sí" : "No" },
        ...(isValid ? [{ field: "Formato", value: formatted }] : []),
      ];

      yield* renderer.render(rows, {
        columns: rutColumns,
        ttyDefault: "table",
      }, { format: resolvedFormat });

      if (!isValid) {
        process.exitCode = 5;
      }
    }),
).pipe(Command.withDescription("Validate a Chilean RUT using mod-11 algorithm"));
