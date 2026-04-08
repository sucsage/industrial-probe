import chalk from 'chalk'
import ora from 'ora'
import { ModbusClient } from '../protocols/modbus.js'

interface PingOptions {
  host: string
  port: number
  unitId: number
  count: number
}

export async function pingCommand(opts: PingOptions): Promise<void> {
  console.log(chalk.gray(`\n  Pinging ${opts.host}:${opts.port} (Unit ID: ${opts.unitId}) — ${opts.count}x\n`))

  const client = new ModbusClient({
    host: opts.host,
    port: opts.port,
    unitId: opts.unitId,
  })

  const times: number[] = []

  try {
    await client.connect()
  } catch (err: any) {
    console.error(chalk.red(`  ✗ Cannot connect: ${err.message}`))
    process.exit(1)
  }

  for (let i = 0; i < opts.count; i++) {
    const start = Date.now()
    try {
      await client.readHoldingRegisters(1, 1)
      const ms = Date.now() - start
      times.push(ms)
      console.log(`  ${chalk.green('●')} Reply from ${opts.host}  time=${chalk.yellow(ms + 'ms')}`)
    } catch (err: any) {
      console.log(`  ${chalk.red('✗')} Timeout or error: ${err.message}`)
    }

    if (i < opts.count - 1) await new Promise(r => setTimeout(r, 500))
  }

  await client.disconnect()

  if (times.length > 0) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    const min = Math.min(...times)
    const max = Math.max(...times)
    console.log(chalk.gray(`\n  min=${min}ms  avg=${avg}ms  max=${max}ms  loss=${opts.count - times.length}/${opts.count}\n`))
  }
}
