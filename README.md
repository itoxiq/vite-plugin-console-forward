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

## License

MIT
