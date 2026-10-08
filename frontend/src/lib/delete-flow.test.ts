import { createStore } from "@tanstack/react-store";
import { describe, expect, it } from "vitest";

import { IDLE_DELETE, deleteFlowActions, type DeleteFlow } from "./delete-flow";
import type { StoreApi } from "./store-api";

type Row = { id: string; title: string };
type State = { delete: DeleteFlow<Row>; other: number };

const ROW: Row = { id: "r1", title: "First" };
const actions = (api: StoreApi<State>) => deleteFlowActions(api);
const initial: State = { delete: IDLE_DELETE, other: 7 };
const make = () => createStore(initial, actions);

describe("deleteFlowActions", () => {
  it("starts idle", () => {
    expect(make().state.delete).toEqual({ pending: null, error: null });
  });

  it("begin stores the target object, replacing an earlier one and its error", () => {
    const other: Row = { id: "r2", title: "Second" };
    const store = make();
    store.actions.beginDelete(ROW);
    store.actions.failDelete("old");
    store.actions.beginDelete(other);
    expect(store.state.delete).toEqual({ pending: other, error: null });
  });

  it("fail keeps the target and records the message", () => {
    const store = make();
    store.actions.beginDelete(ROW);
    store.actions.failDelete("Could not delete that task.");
    expect(store.state.delete).toEqual({ pending: ROW, error: "Could not delete that task." });
  });

  it("clearDeleteError keeps the target", () => {
    const store = make();
    store.actions.beginDelete(ROW);
    store.actions.failDelete("x");
    store.actions.clearDeleteError();
    expect(store.state.delete).toEqual({ pending: ROW, error: null });
  });

  it("cancel returns to idle and leaves the rest of the state alone", () => {
    const store = make();
    store.actions.beginDelete(ROW);
    store.actions.cancelDelete();
    expect(store.state).toEqual({ delete: { pending: null, error: null }, other: 7 });
    expect(IDLE_DELETE).toEqual({ pending: null, error: null });
    expect(Object.isFrozen(IDLE_DELETE)).toBe(true);
  });
});
