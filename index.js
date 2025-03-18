#!/usr/bin/env node

import process from "process";
process.removeAllListeners("warning");
import Download from "./commands/download.js";
import { Command } from "commander";

const program = new Command();

program
  .name("ytdt")
  .description("A CLI youtube downloader.")
  .action(Download)
  .version("1.0.0");

program.parse();
