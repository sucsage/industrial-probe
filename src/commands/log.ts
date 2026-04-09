import { Command } from "commander";
import chalk from "chalk";
import { createWriteStream } from "fs";
import { ModbusClient } from "../protocols/modbus.js";

export function logCommand(): Command {
  return new Command("log")
    .description("Log register values to CSV over a duration")
    .requiredOption("-H, --host <host>", "Device IP address")
    .option("-p, --port <port>", "Modbus port", "502")
    .option("-r, --register <addr>", "Start address (40001-based)", "40001")
    .option("-c, --count <n>", "Number of registers", "8")
    .option("-i, --interval <ms>", "Poll interval in ms", "1000")
    .option("-d, --duration <s>", "Duration in seconds (0 = forever)", "60")
    .option("-o, --out <file>", "Output CSV file", "log.csv")
    .action(async (opts) => {
      const host = opts.host;
      const port = parseInt(opts.port);
      const startAddr = parseInt(opts.register) - 40001;
      const count = parseInt(opts.count);
      const interval = parseInt(opts.interval);
      const duration = parseInt(opts.duration) * 1000;
      const outFile = opts.out;

      const client = new ModbusClient({ host, port });
      await client.connect();

      const stream = createWriteStream(outFile);

      // CSV header
      const headers = ["timestamp", ...Array.from({ length: count }, (_, i) => `reg_${40001 + startAddr + i}`)];
      stream.write(headers.join(",") + "\n");

      console.log(chalk.yellow(`\n⚡ Logging to ${outFile} (${duration / 1000}s)...\n`));
      let rows = 0;

      const poll = async () => {
        const ts = new Date().toISOString();
        try {
          const results = await client.readHoldingRegisters(startAddr, count);
          const row = [ts, ...results.map((r) => r.value)].join(",");
          stream.write(row + "\n");
          rows++;
          process.stdout.write(`\r  ${chalk.gray(ts)}  ${chalk.green(`${rows} rows written`)}`);
        } catch (err: any) {
          console.error(chalk.red(`\n  ✗ ${err.message}`));
        }
      };

      const timer = setInterval(poll, interval);
      await poll();

      const stop = () => {
        clearInterval(timer);
        client.disconnect();
        stream.end();
        console.log(chalk.green(`\n\n  ✓ Saved ${rows} rows → ${outFile}\n`));
        process.exit(0);
      };

      if (duration > 0) setTimeout(stop, duration);
      process.on("SIGINT", stop);
    });
}
