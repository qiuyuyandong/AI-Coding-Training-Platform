import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        "tests/unit/extension*.test.ts",
        "tests/unit/luoguFixtureLoader.test.ts",
        "tests/unit/platformCertification.test.ts",
      ],
    },
  }),
);
