import mqtt from "mqtt";

export interface MqttConnectOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface MqttMessage {
  topic: string;
  payload: string;
  ts: string;
}

export class MqttClientWrapper {
  private client: mqtt.MqttClient | null = null;

  async connect(opts: MqttConnectOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(`mqtt://${opts.host}:${opts.port}`, {
        username:       opts.username,
        password:       opts.password,
        connectTimeout: 5000,
      });
      this.client.once("connect", () => resolve());
      this.client.once("error",   reject);
    });
  }

  subscribe(topic: string, onMessage: (msg: MqttMessage) => void): void {
    this.client?.subscribe(topic);
    this.client?.on("message", (t, payload) => {
      onMessage({ topic: t, payload: payload.toString(), ts: new Date().toLocaleTimeString() });
    });
  }

  publish(topic: string, payload: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client?.publish(topic, payload, (err) => (err ? reject(err) : resolve()));
    });
  }

  disconnect(): void {
    this.client?.end();
  }
}
