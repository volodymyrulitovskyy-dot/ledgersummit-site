import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

const { loadState, resetState } = await import("../src/state.js");

const STORAGE_KEY = "eac-rebuild-state-v1";

test("loadState uses empty project fallback instead of seed project shape", () => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    projects: [
      {
        id: "proj-custom",
        name: "Custom Project"
      },
      {
        id: "proj-live"
      }
    ],
    ui: {}
  }));

  const state = loadState();

  assert.equal(state.projects[1].id, "proj-live");
  assert.equal(state.projects[1].name, "Untitled Project");
  assert.equal(state.projects[1].planning.labor.length, 0);
  assert.equal(state.projects[1].actuals.totalCost.length, 12);
});

test("loadState remaps legacy tabs and invalid activeModule safely", () => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ui: {
      activeModule: "not-real",
      activeTab: "reports"
    }
  }));

  const state = loadState();

  assert.equal(state.ui.activeModule, "eac");
  assert.equal(state.ui.activeTab, "financials");
});

test("loadState maps legacy plan subtabs into the plan workspace", () => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ui: {
      activeTab: "materials"
    }
  }));

  const state = loadState();

  assert.equal(state.ui.activeTab, "plan");
  assert.equal(state.ui.planSubtab, "materials");
});

test("resetState restores a valid default state", () => {
  const state = resetState();

  assert.ok(Array.isArray(state.projects));
  assert.equal(state.ui.activeModule, "eac");
  assert.equal(state.ui.activeTab, "overview");
});
