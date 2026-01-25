import { db, MODE } from "./bootstrap.js";
import { SystemStorage } from "./storage/system.js";
import { StandaloneStorage } from "./storage/standalone.js";

export const storage =
  MODE === "system"
    ? new SystemStorage(db)
    : new StandaloneStorage(db);
