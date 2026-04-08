import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { ModbusClient } from "../protocols/modbus";

export function readCommand(): Command {
  return new Command("read")
    .description("Read holding registers from a Modbus device")
    .requiredOption("-H, --host <host>", "Device IP address")
    .option("-p, --port <port>", "Modbus port", "502")
    .option("-r, --register <addr>", "Start address (40001-based)", "40001")
    .option("-c, --count <n>", "Number of registers to read", "10")
    .option("-u, --unit-id <id>", "Modbus unit ID", "1")
    .action(async (opts) => {
      const host = opts.host;
      const port = parseInt(opts.port);
      const startAddr = parseInt(opts.register) - 40001; // convert to 0-based
      const count = parseInt(opts.count);
      const unitId = parseInt(opts.unitId);

      const client = new ModbusClient({ host, port, unitId });

      try {
        console.log(chalk.yellow(`\n⚡ Reading ${count} register(s) from ${host}:${port}\n`));
        await client.connect();
        const results = await client.readHoldingRegisters(startAddr, count);
        client.disconnect();

        const table = new Table({
          head: [
            chalk.gray("Address"),
            chalk.gray("Dec"),
            chalk.gray("Hex"),
            chalk.gray("Bin"),
          ],
          style: { head: [], border: ["gray"] },
        });

        results.forEach((r) => {
          table.push([
            chalk.yellow(`4${String(r.address).padStart(4, "0")}`),
            chalk.white(r.value.toString()),
            chalk.cyan("0x" + r.value.toString(16).toUpperCase().padStart(4, "0")),
            chalk.gray(r.value.toString(2).padStart(16, "0")),
          ]);
        });

        console.log(table.toString());
        console.log();
      } catch (err: any) {
        console.error(chalk.red(`\n  ✗ Error: ${err.message}\n`));
        process.exit(1);
      }
    });
}
