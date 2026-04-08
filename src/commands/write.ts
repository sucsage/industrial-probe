import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ModbusClient } from "../protocols/modbus";

export function writeCommand(): Command {
  return new Command("write")
    .description("Write a value to a holding register")
    .requiredOption("-H, --host <host>", "Device IP address")
    .option("-p, --port <port>", "Modbus port", "502")
    .requiredOption("-r, --register <addr>", "Register address (40001-based)")
    .requiredOption("-v, --value <n>", "Value to write (0–65535)")
    .action(async (opts) => {
      const host = opts.host;
      const port = parseInt(opts.port);
      const address = parseInt(opts.register) - 40001;
      const value = parseInt(opts.value);

      if (value < 0 || value > 65535) {
        console.error(chalk.red("  ✗ Value must be 0–65535"));
        process.exit(1);
      }

      const spinner = ora(`Writing ${value} to register ${opts.register}...`).start();
      const client = new ModbusClient({ host, port });

      try {
        await client.connect();
        await client.writeRegister(address, value);
        client.disconnect();
        spinner.succeed(
          chalk.green(`Wrote `) +
            chalk.white(value) +
            chalk.green(` → register `) +
            chalk.yellow(opts.register)
        );
        console.log();
      } catch (err: any) {
        spinner.fail(chalk.red(`Write failed: ${err.message}`));
        process.exit(1);
      }
    });
}
