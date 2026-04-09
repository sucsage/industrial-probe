import { Command } from "commander";
import chalk from "chalk";
import { ModbusClient } from "../protocols/modbus.js";

export function monitorCommand(): Command {
  return new Command("monitor")
    .description("Poll registers in real-time (Ctrl+C to stop)")
    .requiredOption("-H, --host <host>", "Device IP address")
    .option("-p, --port <port>", "Modbus port", "502")
    .option("-r, --register <addr>", "Start address (40001-based)", "40001")
    .option("-c, --count <n>", "Number of registers", "8")
    .option("-i, --interval <ms>", "Poll interval in ms", "1000")
    .action(async (opts) => {
      const host = opts.host;
      const port = parseInt(opts.port);
      const startAddr = parseInt(opts.register) - 40001;
      const count = parseInt(opts.count);
      const interval = parseInt(opts.interval);

      const client = new ModbusClient({ host, port });

      console.log(chalk.yellow(`\n⚡ Monitoring ${host} every ${interval}ms — Ctrl+C to stop\n`));

      await client.connect();

      const poll = async () => {
        try {
          const results = await client.readHoldingRegisters(startAddr, count);
          const ts = new Date().toLocaleTimeString();

          // Clear previous lines
          if (process.stdout.isTTY) {
            process.stdout.write(`\x1B[${count + 2}A`);
          }

          console.log(chalk.gray(`  Updated: ${ts}`));
          console.log(chalk.gray("  " + "─".repeat(36)));
          results.forEach((r) => {
            const bar = "█".repeat(Math.min(20, Math.floor(r.value / 3277)));
            console.log(
              `  ${chalk.yellow(String(r.address).padEnd(8))}` +
                `${chalk.white(String(r.value).padStart(6))}  ` +
                chalk.cyan(bar.padEnd(20))
            );
          });
        } catch (err: any) {
          console.error(chalk.red(`\n  ✗ Poll error: ${err.message}`));
        }
      };

      // Initial blank lines for TTY rewrite
      if (process.stdout.isTTY) {
        for (let i = 0; i < count + 2; i++) console.log();
      }

      const timer = setInterval(poll, interval);
      await poll();

      process.on("SIGINT", () => {
        clearInterval(timer);
        client.disconnect();
        console.log(chalk.yellow("\n\n  Monitoring stopped.\n"));
        process.exit(0);
      });
    });
}
