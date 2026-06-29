import * as esbuild from "esbuild";

const prod = process.argv.includes("production");

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  loader: {
    ".tsx": "tsx",
  },
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
};

if (prod) {
  esbuild.build(config).catch(() => process.exit(1));
} else {
  esbuild.context(config).then((ctx) => ctx.watch());
}
