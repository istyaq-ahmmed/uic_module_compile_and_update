#!/usr/bin/env node
const  {Command}  = require("commander");
const {build}= require('./build');
const {
    checkConfig,
    configBuilder
}= require('./config_builder');

const program = new Command();

program
  .command("build")
  .requiredOption("-v, --version <number>", "Build version")
  .action(async (options) => {
      if(checkConfig(options.version)){
            await build(options.version);
            process.exit()
        }
  });

program
  .command("config")
  .option("--ssh.host <host>", "SSH host.")
  .option("--ssh.usr <username>", "SSH username.")
  .option("--ssh.pas <password>", "SSH password.")
  .option("--v2.key <apiKey>", "Beta apiKey.")
  .action((options) => {
    if(configBuilder(options)){
        console.log("Changes Saves.");
    }else
        console.log("No Changes Saves.");
  });

program.parse(process.argv);
