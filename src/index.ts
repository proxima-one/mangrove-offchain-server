console.log(process.argv);

if (process.argv.length < 3) {
  throw new Error("Missing command to run: 'consumer' or 'server'");
}

const commandToRun = process.argv[2];
if (commandToRun == "consumer") require("./cmd/consumer");
else if (commandToRun == "server") require("./cmd/server");
else throw new Error(`Unknown command ${commandToRun} to run`);
