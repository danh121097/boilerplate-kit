import { runCommand, showUsage } from "citty";
import pkg from "../package.json" with { type: "json" };
import { main } from "./main.js";
import { handleError } from "./errors.js";

const argv = process.argv.slice(2);

async function run() {
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(pkg.version);
    return;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    await showUsage(main);
    return;
  }
  await runCommand(main, { rawArgs: argv });
}

run().catch(handleError);
