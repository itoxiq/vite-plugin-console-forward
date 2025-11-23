# vite-plugin-console-forward

Forward browser console logs to your terminal during Vite development.

## Installation

```bash
bun add -d vite-plugin-console-forward
```

## Usage

```ts
// vite.config.ts
import consoleForward from "vite-plugin-console-forward";

export default {
  plugins: [consoleForward()],
};
```

## Options

```ts
consoleForward({
  levels: ["log", "warn", "error", "info", "debug"],
  captureErrors: true,
  captureRejections: true,
  prefix: "browser",
});
```

## Example Output

```shell
[browser:debug] [vite] hot updated: /src/components/HelloWorld.vue
[browser:log] some console.log for testing HMR
[browser:warn] This is a console.warn for testing HMR
[browser:error] {
  "message": "Error: This is a test error for HMR!",
  "filename": "http://localhost:5173/src/components/HelloWorld.vue",
  "lineno": 13,
  "colno": 10
}
```

## How It Works

This plugin uses Vite's HMR (Hot Module Replacement) WebSocket connection to forward browser console output to your terminal.

### Architecture

1. **Client-side injection**: The plugin injects a virtual module into your app's `<head>` that:
   - Wraps native `console` methods (`log`, `warn`, `error`, etc.) to intercept calls
   - Listens for `window.onerror` and `unhandledrejection` events
   - Serializes arguments (handling circular references, errors, and nested objects)
   - Sends messages through Vite's `import.meta.hot.send()` API

2. **Server-side handling**: The Vite dev server:
   - Listens for `console-forward` WebSocket events
   - Formats and prints messages to your terminal with the configured prefix

3. **HMR-aware**: The client code:
   - Tracks WebSocket connection state to avoid errors when disconnected
   - Properly cleans up event listeners and restores original console methods on HMR dispose

### Key Implementation Details

- Uses a virtual module (`virtual:console-forward`) to inject client code
- Only active during development (`apply: "serve"`)
- Prevents infinite loops when console methods are called during forwarding
- Limits serialization depth to 10 levels to avoid performance issues

## License

MIT
