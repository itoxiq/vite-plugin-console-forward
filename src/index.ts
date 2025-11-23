import type { Plugin } from "vite";

interface ConsoleForwardOptions {
  /**
   * Console levels to forward (default: ['log', 'warn', 'error', 'info', 'debug'])
   */
  levels?: ("log" | "warn" | "error" | "info" | "debug")[];
  /**
   * Whether to capture uncaught errors (default: true)
   */
  captureErrors?: boolean;
  /**
   * Whether to capture unhandled promise rejections (default: true)
   */
  captureRejections?: boolean;
  /**
   * Custom prefix for terminal output (default: 'browser')
   */
  prefix?: string;
}

const VIRTUAL_MODULE_ID = "virtual:console-forward";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

function generateClientCode(options: Required<ConsoleForwardOptions>): string {
  const { levels, captureErrors, captureRejections } = options;

  const errorHandlerCode = captureErrors
    ? `
  const errorHandler = (event) => forward('error', [{
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack
  }]);
  addEventListener('error', errorHandler);`
    : "";

  const rejectionHandlerCode = captureRejections
    ? `
  const rejectionHandler = (event) => {
    const reason = event.reason;
    forward('error', [{
      type: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason?.stack
    }]);
  };
  addEventListener('unhandledrejection', rejectionHandler);`
    : "";

  const cleanupErrorHandler = captureErrors
    ? "removeEventListener('error', errorHandler);"
    : "";

  const cleanupRejectionHandler = captureRejections
    ? "removeEventListener('unhandledrejection', rejectionHandler);"
    : "";

  return `
if (import.meta.hot) {
  const methods = ${JSON.stringify(levels)};
  const originalMethods = Object.fromEntries(
    methods.map(method => [method, console[method].bind(console)])
  );
  let isForwarding = false;
  let isConnected = true;

  // Track connection state
  import.meta.hot.on('vite:ws:disconnect', () => { isConnected = false; });
  import.meta.hot.on('vite:ws:connect', () => { isConnected = true; });

  function serialize(value, seen = new WeakSet(), depth = 0) {
    if (depth > 10) return '[MaxDepth]';
    try {
      if (value === null || value === undefined) return value;
      if (typeof value !== 'object') return value;
      if (value instanceof Error) return { message: value.message, stack: value.stack };
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      if (Array.isArray(value)) return value.map(item => serialize(item, seen, depth + 1));
      const result = {};
      for (const key of Object.keys(value)) {
        result[key] = serialize(value[key], seen, depth + 1);
      }
      return result;
    } catch {
      return String(value);
    }
  }

  function forward(method, args) {
    if (isForwarding || !isConnected) return;
    isForwarding = true;
    try {
      if (import.meta.hot?.send) {
        import.meta.hot.send('console-forward', {
          method,
          args: args.map(arg => serialize(arg))
        });
      } else {
        isConnected = false;
      }
    } catch {
      isConnected = false;
    } finally {
      isForwarding = false;
    }
  }

  methods.forEach(method => {
    console[method] = (...args) => {
      originalMethods[method](...args);
      forward(method, args);
    };
  });
${errorHandlerCode}
${rejectionHandlerCode}

  import.meta.hot.dispose(() => {
    methods.forEach(method => { console[method] = originalMethods[method]; });
    ${cleanupErrorHandler}
    ${cleanupRejectionHandler}
  });
}
`;
}

export default function consoleForwardPlugin(
  options: ConsoleForwardOptions = {}
): Plugin {
  const resolvedOptions: Required<ConsoleForwardOptions> = {
    levels: options.levels ?? ["log", "warn", "error", "info", "debug"],
    captureErrors: options.captureErrors ?? true,
    captureRejections: options.captureRejections ?? true,
    prefix: options.prefix ?? "browser",
  };

  return {
    name: "vite-plugin-console-forward",
    apply: "serve",

    config() {
      return {
        server: {
          watch: {
            ignored: ["**/vite-plugin-console-forward/**"],
          },
        },
      };
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return generateClientCode(resolvedOptions);
      }
    },

    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module", src: "/@id/__x00__virtual:console-forward" },
          injectTo: "head-prepend",
        },
      ];
    },

    configureServer(server) {
      const handleConsoleMessage = (data: { method: string; args: unknown[] }) => {
        try {
          const { method, args } = data;
          const formattedArgs = args.map((arg: unknown) =>
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          );
          console.log(`[${resolvedOptions.prefix}:${method}]`, ...formattedArgs);
        } catch (error) {
          console.error("[console-forward] Failed to process message:", error);
        }
      };

      server.ws.on("console-forward", handleConsoleMessage);

      server.httpServer?.on("close", () => {
        server.ws.off("console-forward", handleConsoleMessage);
      });
    },
  };
}

export { consoleForwardPlugin };
export type { ConsoleForwardOptions };
