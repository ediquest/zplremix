import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function resolveBasePath(): string {
  if (process.env.GITHUB_ACTIONS !== "true") {
    return "/";
  }
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const repoName = repository.split("/")[1] ?? "";
  if (!repoName || repoName.toLowerCase().endsWith(".github.io")) {
    return "/";
  }
  return `/${repoName}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()]
});
