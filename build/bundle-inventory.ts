import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function bundleInventory(): Plugin {
  let root = process.cwd();
  return {
    name: "tadarok-bundle-inventory",
    apply: "build",
    configResolved(config) { root = config.root; },
    generateBundle(options, bundle) {
      const records = Object.values(bundle).filter(item => item.type === "chunk").map(chunk => ({
        file: chunk.fileName,
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        modules: Object.entries(chunk.modules).map(([id, info]) => ({ id, renderedLength: info.renderedLength })),
      }));
      const destination = resolve(root, "work/license-audit");
      mkdirSync(destination, { recursive: true });
      const name = this.environment?.name ?? "unknown";
      writeFileSync(resolve(destination, `${name}.json`), JSON.stringify({ environment: name, output: options.dir, records }, null, 2));
    },
  };
}
