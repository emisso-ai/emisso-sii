#!/usr/bin/env node

/**
 * @emisso/sii-cli entry point
 */

import { createRequire } from "node:module";
import { runCli, OutputRendererLive } from "@emisso/cli-core";
import { rootCommand } from "../src/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

runCli({
  command: rootCommand,
  layer: OutputRendererLive,
  name: "sii",
  version: pkg.version,
});
