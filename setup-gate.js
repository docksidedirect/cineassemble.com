import { config } from "./config.js";

export function validateSetup() {
  const missing = [];

  if (!config.openaiApiKey) {
    missing.push("OPENAI_API_KEY — required for scripts, images, and voice");
  }
  if (!config.replicateToken && config.animationEngine !== "local") {
    missing.push(
      "REPLICATE_API_TOKEN — required for video animation (or set ANIMATION_ENGINE=local)",
    );
  }
  if (!config.databaseUrl && !config.database.password) {
    missing.push(
      "DATABASE_URL or MySQL credentials — required for job storage",
    );
  }

  if (missing.length > 0) {
    console.error("\n" + "=".repeat(60));
    console.error("  CINEASSEMBLE SETUP INCOMPLETE");
    console.error("=".repeat(60));
    console.error("\n  You must add your own API credentials to .env:");
    console.error("  (Copy .env.example → .env and fill in your keys)\n");
    missing.forEach((m) => console.error("  ❌ " + m));
    console.error("\n" + "=".repeat(60));
    console.error("\n  Get your keys here:");
    console.error("  • OpenAI: https://platform.openai.com/api-keys");
    console.error("  • Replicate: https://replicate.com/account/api-tokens");
    console.error("  • Fal.ai (optional): https://fal.ai/dashboard/keys");
    console.error(
      "\n  Want to help the project? https://buymeacoffee.com/wanis.online",
    );
    console.error("=".repeat(60) + "\n");
    process.exit(1);
  }

  console.log(
    "✅ CineAssemble setup validated. Using your own API credentials.",
  );
}
