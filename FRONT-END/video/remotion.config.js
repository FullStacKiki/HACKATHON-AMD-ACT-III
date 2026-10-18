import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

// Set CHROME_EXE to use an installed headless Chrome instead of letting Remotion download its own.
Config.overrideWebpackConfig((c) => {
  const t = enableTailwind(c);
  // The app imports its components without the extension (Vite style).
  return { ...t, resolve: { ...t.resolve, extensions: [...new Set([".jsx", ".js", ...(t.resolve?.extensions ?? [])])] } };
});
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(18);
if (process.env.CHROME_EXE) Config.setBrowserExecutable(process.env.CHROME_EXE);
