import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

mkdirSync(dist, { recursive: true });

const entryPoints = {
  background: join(root, "src/background.ts"),
  content: join(root, "src/content.ts"),
  sidepanel: join(root, "src/sidepanel.ts"),
  popup: join(root, "src/popup.ts"),
};

async function copyStatic() {
  cpSync(join(root, "public"), dist, { recursive: true });
  for (const html of ["sidepanel.html", "popup.html"]) {
    const src = join(root, "src", html);
    if (existsSync(src)) cpSync(src, join(dist, html));
  }
}

const ctx = await esbuild.context({
  entryPoints,
  bundle: true,
  outdir: dist,
  format: "esm",
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info",
});

await copyStatic();

if (watch) {
  await ctx.watch();
  console.log("Extension watching…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("Extension built to dist/");
}
