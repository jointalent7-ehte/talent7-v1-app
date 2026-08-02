import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    // This app deliberately hydrates several persisted UI preferences and the
    // Supabase session from effects. Removing those state updates would break
    // saved-state restoration, so keep the rule off until that state is moved
    // behind dedicated external-store hooks.
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  },
  globalIgnores([".next/**", "node_modules/**", "play-store-assets/**", "next-env.d.ts"])
]);
