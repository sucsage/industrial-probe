import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ModbusClient } from "../protocols/modbus";

export function scanCommand(): Command {
  return new Command("scan")
    .description("Scan subnet for Modbus TCP devices")
    .argument("<subnet>", "Subnet to scan, e.g. 192.168.1.0/24")
    .option("-p, --port <port>", "Modbus port", "502")
    .option("-t, --timeout <ms>", "Timeout per host (ms)", "1000")
    .action(async (subnet: string, opts) => {
      const port = parseInt(opts.port);
      const timeout = parseInt(opts.timeout);

      // Parse subnet — simple /24 only for MVP
      const base = subnet.replace(/\/\d+$/, "").replace(/\.\d+$/, "");
      const found: string[] = [];

      console.log(chalk.yellow(`\n⚡ Scanning ${subnet} on port ${port}...\n`));

      const spinner = ora({ text: "Probing hosts...", color: "yellow" }).start();

      const tasks: Promise<void>[] = [];
      for (let i = 1; i <= 254; i++) {
        const host = `${base}.${i}`;
        tasks.push(
          (async () => {
            const client = new ModbusClient({ host, port, timeout });
            try {
              await client.connect();
              const alive = await client.ping();
              if (alive) found.push(host);
              client.disconnect();
            } catch {
              // not found
            }
          })()
        );
      }

      await Promise.all(tasks);
      spinner.stop();

      if (found.length === 0) {
        console.log(chalk.red("  No Modbus devices found.\n"));
      } else {
        console.log(chalk.green(`  Found ${found.length} device(s):\n`));
        found.forEach((h) => console.log(chalk.green("  ●"), chalk.white(h)));
        console.log();
      }
    });
}
