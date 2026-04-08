import chalk from "chalk";
import Table from "cli-table3";

export function printHeader(title: string) {
  console.log();
  console.log(chalk.cyan.bold(`⚡ ${title}`));
  console.log(chalk.gray("─".repeat(50)));
}

export function printSuccess(msg: string) {
  console.log(chalk.green("✓"), msg);
}

export function printError(msg: string) {
  console.log(chalk.red("✗"), msg);
}

export function printWarning(msg: string) {
  console.log(chalk.yellow("⚠"), msg);
}

export function printInfo(msg: string) {
  console.log(chalk.blue("ℹ"), msg);
}

export function printRegisterTable(
  rows: { address: number; label?: string; value: number; unit?: string }[]
) {
  const table = new Table({
    head: [
      chalk.cyan("Register"),
      chalk.cyan("Label"),
      chalk.cyan("Value"),
      chalk.cyan("Hex"),
      chalk.cyan("Unit"),
    ],
    style: { head: [], border: ["gray"] },
  });

  for (const row of rows) {
    table.push([
      chalk.white("4" + String(row.address + 1).padStart(4, "0")),
      row.label ?? chalk.gray("—"),
      chalk.yellow(String(row.value)),
      chalk.gray("0x" + row.value.toString(16).toUpperCase().padStart(4, "0")),
      row.unit ?? chalk.gray("—"),
    ]);
  }

  console.log(table.toString());
}

export function printTestResult(
  name: string,
  passed: boolean,
  actual: number | string,
  expected: string
) {
  const icon = passed ? chalk.green("PASS ✓") : chalk.red("FAIL ✗");
  const actualStr = passed
    ? chalk.green(String(actual))
    : chalk.red(String(actual));
  console.log(
    "  " +
      icon +
      " " +
      chalk.white(name.padEnd(30)) +
      " " +
      actualStr +
      " " +
      chalk.gray("(expected: " + expected + ")")
  );
}
