import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "fs";
import { parse } from "yaml";
import { ModbusClient } from "../protocols/modbus";

interface TestCase {
  name: string;
  register: number;
  expect: string; // e.g. "equals(0)", "between(0,1500)", "lessThan(80)", "greaterThan(0)"
}

interface TestConfig {
  name: string;
  host: string;
  port?: number;
  protocol: "modbus-tcp";
  tests: TestCase[];
}

function evalExpect(value: number, expr: string): boolean {
  const m = expr.match(/^(\w+)\(([^)]+)\)$/);
  if (!m) return false;
  const [, fn, args] = m;
  const nums = args.split(",").map(Number);

  switch (fn) {
    case "equals":      return value === nums[0];
    case "lessThan":    return value < nums[0];
    case "greaterThan": return value > nums[0];
    case "between":     return value >= nums[0] && value <= nums[1];
    default:            return false;
  }
}

export function testCommand(): Command {
  return new Command("test")
    .description("Run a YAML test suite against a device")
    .requiredOption("-f, --file <path>", "Path to test config YAML")
    .action(async (opts) => {
      let config: TestConfig;

      try {
        config = parse(readFileSync(opts.file, "utf-8")) as TestConfig;
      } catch (err: any) {
        console.error(chalk.red(`\n  ✗ Cannot read config: ${err.message}\n`));
        process.exit(1);
      }

      console.log(chalk.yellow(`\n⚡ ${config.name}`));
      console.log(chalk.gray(`  Host: ${config.host} | Protocol: ${config.protocol}\n`));

      const client = new ModbusClient({ host: config.host, port: config.port ?? 502 });
      await client.connect();

      let passed = 0;
      let failed = 0;

      for (const t of config.tests) {
        const addr = t.register - 40001;
        try {
          const [result] = await client.readHoldingRegisters(addr, 1);
          const ok = evalExpect(result.value, t.expect);

          if (ok) {
            passed++;
            console.log(
              `  ${chalk.green("PASS ✓")}  ${chalk.white(t.name.padEnd(28))}` +
              `${chalk.gray("→")} ${chalk.green(result.value)}`
            );
          } else {
            failed++;
            console.log(
              `  ${chalk.red("FAIL ✗")}  ${chalk.white(t.name.padEnd(28))}` +
              `${chalk.gray("→")} ${chalk.red(result.value)} ${chalk.gray(`(expected: ${t.expect})`)}`
            );
          }
        } catch (err: any) {
          failed++;
          console.log(`  ${chalk.red("ERR  ✗")}  ${chalk.white(t.name.padEnd(28))} ${chalk.red(err.message)}`);
        }
      }

      client.disconnect();

      console.log(chalk.gray("\n  " + "─".repeat(40)));
      console.log(
        `  ${chalk.green(`${passed} passed`)}  ${failed > 0 ? chalk.red(`${failed} failed`) : chalk.gray("0 failed")}\n`
      );

      if (failed > 0) process.exit(1);
    });
}
