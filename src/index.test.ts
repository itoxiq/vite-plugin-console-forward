import { describe, it, expect, vi, beforeEach } from "vitest";
import consoleForwardPlugin from "./index";
import type { ViteDevServer, HotChannel } from "vite";

describe("consoleForwardPlugin", () => {
  describe("plugin configuration", () => {
    it("returns a plugin with correct name", () => {
      const plugin = consoleForwardPlugin();
      expect(plugin.name).toBe("vite-plugin-console-forward");
    });

    it("applies only during serve mode", () => {
      const plugin = consoleForwardPlugin();
      expect(plugin.apply).toBe("serve");
    });

    it("returns config with server watch ignored pattern", () => {
      const plugin = consoleForwardPlugin();
      const config = plugin.config?.({} as any, { command: "serve", mode: "development" });
      expect(config).toEqual({
        server: {
          watch: {
            ignored: ["**/vite-plugin-console-forward/**"],
          },
        },
      });
    });
  });

  describe("virtual module resolution", () => {
    it("resolves virtual module ID", () => {
      const plugin = consoleForwardPlugin();
      const resolved = plugin.resolveId?.call({} as any, "virtual:console-forward", undefined, {} as any);
      expect(resolved).toBe("\0virtual:console-forward");
    });

    it("returns undefined for non-virtual module", () => {
      const plugin = consoleForwardPlugin();
      const resolved = plugin.resolveId?.call({} as any, "some-other-module", undefined, {} as any);
      expect(resolved).toBeUndefined();
    });

    it("loads client code for resolved virtual module", () => {
      const plugin = consoleForwardPlugin();
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).toContain("import.meta.hot");
      expect(code).toContain("console-forward");
    });

    it("returns undefined for non-virtual module load", () => {
      const plugin = consoleForwardPlugin();
      const code = plugin.load?.call({} as any, "some-other-module", {} as any);
      expect(code).toBeUndefined();
    });
  });

  describe("generated client code", () => {
    it("includes default console methods", () => {
      const plugin = consoleForwardPlugin();
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).toContain('"log"');
      expect(code).toContain('"warn"');
      expect(code).toContain('"error"');
      expect(code).toContain('"info"');
      expect(code).toContain('"debug"');
    });

    it("respects custom levels option", () => {
      const plugin = consoleForwardPlugin({ levels: ["log", "error"] });
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).toContain('["log","error"]');
      expect(code).not.toContain('"warn"');
    });

    it("includes error capture by default", () => {
      const plugin = consoleForwardPlugin();
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).toContain("addEventListener('error'");
    });

    it("excludes error capture when disabled", () => {
      const plugin = consoleForwardPlugin({ captureErrors: false });
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).not.toContain("addEventListener('error'");
    });

    it("includes rejection capture by default", () => {
      const plugin = consoleForwardPlugin();
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).toContain("addEventListener('unhandledrejection'");
    });

    it("excludes rejection capture when disabled", () => {
      const plugin = consoleForwardPlugin({ captureRejections: false });
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).not.toContain("addEventListener('unhandledrejection'");
    });

    it("includes serialization for circular references", () => {
      const plugin = consoleForwardPlugin();
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).toContain("[Circular]");
      expect(code).toContain("WeakSet");
    });

    it("includes max depth protection", () => {
      const plugin = consoleForwardPlugin();
      const code = plugin.load?.call({} as any, "\0virtual:console-forward", {} as any);
      expect(code).toContain("[MaxDepth]");
      expect(code).toContain("depth > 10");
    });
  });

  describe("HTML transformation", () => {
    it("injects script tag in head-prepend", () => {
      const plugin = consoleForwardPlugin();
      const tags = plugin.transformIndexHtml?.call({} as any, "", {} as any);
      expect(tags).toEqual([
        {
          tag: "script",
          attrs: { type: "module", src: "/@id/__x00__virtual:console-forward" },
          injectTo: "head-prepend",
        },
      ]);
    });
  });

  describe("server configuration", () => {
    let mockServer: Partial<ViteDevServer>;
    let wsHandlers: Map<string, Function>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      wsHandlers = new Map();
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});

      mockServer = {
        ws: {
          on: vi.fn((event: string, handler: Function) => {
            wsHandlers.set(event, handler);
          }),
          off: vi.fn(),
        } as unknown as HotChannel,
        httpServer: {
          on: vi.fn(),
        } as any,
      };
    });

    it("registers console-forward WebSocket handler", () => {
      const plugin = consoleForwardPlugin();
      plugin.configureServer?.(mockServer as ViteDevServer);
      expect(mockServer.ws?.on).toHaveBeenCalledWith("console-forward", expect.any(Function));
    });

    it("handles incoming console messages", () => {
      const plugin = consoleForwardPlugin();
      plugin.configureServer?.(mockServer as ViteDevServer);

      const handler = wsHandlers.get("console-forward");
      handler?.({ method: "log", args: ["test message"] });

      expect(consoleLogSpy).toHaveBeenCalledWith("[browser:log]", "test message");
    });

    it("uses custom prefix", () => {
      const plugin = consoleForwardPlugin({ prefix: "app" });
      plugin.configureServer?.(mockServer as ViteDevServer);

      const handler = wsHandlers.get("console-forward");
      handler?.({ method: "warn", args: ["warning"] });

      expect(consoleLogSpy).toHaveBeenCalledWith("[app:warn]", "warning");
    });

    it("formats objects as JSON", () => {
      const plugin = consoleForwardPlugin();
      plugin.configureServer?.(mockServer as ViteDevServer);

      const handler = wsHandlers.get("console-forward");
      handler?.({ method: "log", args: [{ key: "value" }] });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[browser:log]",
        JSON.stringify({ key: "value" }, null, 2)
      );
    });

    it("cleans up handler on server close", () => {
      const plugin = consoleForwardPlugin();
      plugin.configureServer?.(mockServer as ViteDevServer);

      const closeHandler = (mockServer.httpServer?.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: [string, Function]) => call[0] === "close"
      )?.[1];
      closeHandler?.();

      expect(mockServer.ws?.off).toHaveBeenCalledWith("console-forward", expect.any(Function));
    });
  });
});
