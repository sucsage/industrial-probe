export type Protocol = 'modbus-tcp' | 'modbus-rtu' | 'mqtt'

export interface ModbusOptions {
  host: string
  port: number
  unitId: number
}

export interface MqttOptions {
  host: string
  port: number
  topic: string
  username?: string
  password?: string
}

export interface RegisterResult {
  address: number
  value: number
  raw: number[]
  timestamp: string
}

// factory-test.yaml schema
export interface TestConfig {
  name: string
  host: string
  port?: number
  protocol: Protocol
  unitId?: number
  tests: TestCase[]
}

export interface TestCase {
  name: string
  register: number
  type?: 'holding' | 'input' | 'coil' | 'discrete'
  expect: ExpectRule
}

export type ExpectRule =
  | { equals: number }
  | { between: [number, number] }
  | { lessThan: number }
  | { greaterThan: number }
  | { notEquals: number }

export interface TestResult {
  name: string
  register: number
  actual: number
  expected: string
  passed: boolean
  error?: string
}
