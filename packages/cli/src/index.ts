/**
 * Root command composition for @emisso/sii-cli
 */

import { Command } from "@effect/cli";
import { OutputRenderer } from "@emisso/cli-core";

import { authLoginCommand } from "./commands/auth/login.js";
import { authTestCommand } from "./commands/auth/test.js";
import { certInfoCommand } from "./commands/cert/info.js";
import { certVerifyCommand } from "./commands/cert/verify.js";
import { invoicesListCommand } from "./commands/invoices/list.js";
import { invoicesDownloadCommand } from "./commands/invoices/download.js";
import { rutValidateCommand } from "./commands/rut/validate.js";
import { rutFormatCommand } from "./commands/rut/format.js";
import { doctorCommand } from "./commands/doctor.js";

// Subcommand groups
const authCommand = Command.make("auth").pipe(
  Command.withDescription("Certificate-based authentication with SII"),
  Command.withSubcommands([authLoginCommand, authTestCommand]),
);

const certCommand = Command.make("cert").pipe(
  Command.withDescription("Digital certificate (.p12) inspection and validation"),
  Command.withSubcommands([certInfoCommand, certVerifyCommand]),
);

const invoicesCommand = Command.make("invoices").pipe(
  Command.withDescription("Invoice listing and download from SII RCV"),
  Command.withSubcommands([invoicesListCommand, invoicesDownloadCommand]),
);

const rutCommand = Command.make("rut").pipe(
  Command.withDescription("Chilean RUT validation and formatting utilities"),
  Command.withSubcommands([rutValidateCommand, rutFormatCommand]),
);

// Root command
export const rootCommand = Command.make("sii").pipe(
  Command.withDescription(
    "Chilean SII tax authority CLI — certificate auth, invoices, RCV, and RUT utilities",
  ),
  Command.withSubcommands([
    authCommand,
    certCommand,
    invoicesCommand,
    rutCommand,
    doctorCommand,
  ]),
);

// Re-export for external usage
export { OutputRenderer };
