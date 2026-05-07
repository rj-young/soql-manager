// Connection IPC handlers (`IConnectionHandlers`) land in Phase 2 Task 2.5.
import { IFileHandlers } from "@/handlers/fileHandlers";
import { IGeneratorHandlers } from "@/handlers/generatorHandlers";
import { IQueryHandlers } from "@/handlers/queryHandlers";
import { ITempHandlers } from "@/handlers/tempHandlers";

// commercial
import { IEnumHandlers } from "./enumHandlers";

export interface Handlers
  extends IQueryHandlers,
    IGeneratorHandlers,
    IFileHandlers,
    IEnumHandlers,
    ITempHandlers {}
