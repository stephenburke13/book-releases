// File-backed StateStore: the original state.json behavior, used by the CLI and
// the unit tests. recordEvents is a no-op because the CLI renders and emails the
// run's events directly rather than queuing them.

import { loadState, saveState } from "../state.js";
import type { State } from "../models.js";
import type { StateStore } from "./base.js";

export class FileStateStore implements StateStore {
  constructor(private readonly path = "state.json") {}

  async load(): Promise<State> {
    return loadState(this.path);
  }

  async save(state: State): Promise<void> {
    saveState(state, this.path);
  }

  async recordEvents(): Promise<void> {
    // No-op: the CLI emails events inline; nothing to queue.
  }
}
