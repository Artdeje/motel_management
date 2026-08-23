import * as esbuild from "esbuild";

async function build() {
  const result = await esbuild.build({
    entryPoints: ["server.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    sourcemap: true,
    outfile: "dist/server.cjs",
    logLevel: "info",
  });

  if (result.errors.length > 0) {
    console.error(result.errors);
    process.exit(1);
  }

  console.log("✅ Server built to dist/server.cjs");
}

build().catch((err) => {
  console.error("❌ Server build failed:", err);
  process.exit(1);
});
