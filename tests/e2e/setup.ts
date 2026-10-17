import path from "node:path";
import { rm, mkdir } from "node:fs/promises";

export default async function setup() {
  const dataRoot = path.resolve(".data");
  const testDirectory = path.resolve(".data/e2e");
  if (
    path.dirname(testDirectory) !== dataRoot ||
    path.basename(testDirectory) !== "e2e"
  )
    throw new Error("Invalid test storage directory.");
  await rm(testDirectory, { recursive: true, force: true });
  await mkdir(testDirectory, { recursive: true });
  await mkdir(path.resolve("docs/screenshots"), { recursive: true });
}
