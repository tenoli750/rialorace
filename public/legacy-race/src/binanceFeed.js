import { COINS } from "./config.js";

export class BinanceFeed {
  constructor(engine, coins = COINS) {
    this.engine = engine;
    this.coins = coins;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
  }

  connect() {
    const streamPath = this.coins.map((coin) => coin.stream).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streamPath}`;

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
    }

    this.engine.setConnectionStatus(
      "connecting",
      this.reconnectAttempt ? "Reconnecting" : "Connecting"
    );

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.engine.setConnectionStatus("live", "Binance Live");
      this.engine.addNote("Binance WebSocket connected.");
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      const candle = payload?.data?.k;
      if (!candle || candle.i !== "1s") {
        return;
      }

      this.engine.updatePrice(payload.data.s, candle.c);
      if (candle.x) {
        this.engine.applyClosedCandle(payload.data.s, candle);
      }
    };

    socket.onerror = () => {
      this.engine.setConnectionStatus("error", "Feed Error");
    };

    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }

      this.reconnectAttempt += 1;
      this.engine.setConnectionStatus("retrying", "Retrying");
      this.engine.addNote("Binance stream disconnected. Reconnecting.");
      this.reconnectTimer = window.setTimeout(
        () => this.connect(),
        Math.min(10_000, 1_500 * this.reconnectAttempt)
      );
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
