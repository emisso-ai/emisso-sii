/**
 * sii rut format <rut>
 */

import { Command, Args } from "@effect/cli";
import { Effect } from "effect";
import { validateRut, formatRut } from "@emisso/sii";
import {
  OutputRenderer,
  CliError,
  resolveFormat,
  formatOption,
  jsonFlag,
} from "@emisso/cli-core";
import { rutColumns } from "../../formatters/sii-table.js";

const rutArg = Args.text({ name: "rut" }).pipe(
  Args.withDescription("RUT to format (e.g. 123456785 → 12345678-5)"),
);

const options = { format: formatOption, json: jsonFlag };

export const rutFormatCommand = Command.make(
  "format",
  { args: rutArg, ...options },
  ({ args: rut, format, json }) =>
    Effect.gen(function* () {
      if (!validateRut(rut)) {
        return yield* Effect.fail(
          new CliError({
            kind: "validation",
            message: `RUT inválido: ${rut}`,
            detail: "El RUT no pasa la validación mod-11",
          }),
        );
      }

      const renderer = yield* OutputRenderer;
      const formatted = formatRut(rut);
      const resolvedFormat = resolveFormat(format, json);

      const rows = [
        { field: "Input", value: rut },
        { field: "Formato", value: formatted },
      ];

      yield* renderer.render(rows, {
        columns: rutColumns,
        ttyDefault: "table",
      }, { format: resolvedFormat });
    }),
).pipe(Command.withDescription("Format a RUT with dash separator (12345678-5)"));
