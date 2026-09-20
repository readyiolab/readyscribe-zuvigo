import { describe, expect, it } from "vitest";
import { CaptureEventType } from "@zuvigo/types";
import { groupEventsIntoSteps, normalizeEvents } from "./index.js";

describe("normalizeEvents", () => {
  it("dedupes and sorts", () => {
    const out = normalizeEvents([
      {
        clientEventId: "b",
        sequence: 2,
        type: CaptureEventType.CLICK,
        timestamp: 2,
        element: { tag: "button", text: "Go" },
      },
      {
        clientEventId: "a",
        sequence: 1,
        type: CaptureEventType.CLICK,
        timestamp: 1,
        element: { tag: "button", text: "Go" },
      },
      {
        clientEventId: "a",
        sequence: 1,
        type: CaptureEventType.CLICK,
        timestamp: 1,
      },
    ]);
    expect(out.map((e) => e.clientEventId)).toEqual(["a", "b"]);
  });

  it("redacts password fields", () => {
    const out = normalizeEvents([
      {
        clientEventId: "1",
        sequence: 1,
        type: CaptureEventType.INPUT,
        timestamp: 1,
        element: { tag: "input", type: "password", value: "supersecret" },
      },
    ]);
    expect(out[0]?.element?.value).toBeUndefined();
    expect(out[0]?.element?.isSensitive).toBe(true);
  });
});

describe("groupEventsIntoSteps", () => {
  it("builds heuristic steps", () => {
    const steps = groupEventsIntoSteps([
      {
        clientEventId: "1",
        sequence: 1,
        type: CaptureEventType.NAVIGATION,
        timestamp: 1,
        url: "https://example.com",
      },
      {
        clientEventId: "2",
        sequence: 2,
        type: CaptureEventType.CLICK,
        timestamp: 2,
        element: { text: "Login" },
      },
    ]);
    expect(steps.length).toBe(2);
    expect(steps[1]?.title).toContain("Login");
    expect(steps[1]?.annotations?.[0]?.kind).toBe("click");
  });

  it("folds after-navigation into the click step", () => {
    const steps = groupEventsIntoSteps([
      {
        clientEventId: "c1",
        sequence: 1,
        type: CaptureEventType.CLICK,
        timestamp: 1,
        element: { text: "About Us" },
        assetClientId: "asset-c1",
        metadata: {
          phase: "click",
          highlight: { x: 0.1, y: 0.2, w: 0.15, h: 0.05 },
        },
      },
      {
        clientEventId: "c1-after",
        sequence: 2,
        type: CaptureEventType.NAVIGATION,
        timestamp: 2000,
        assetClientId: "asset-c1-after",
        metadata: { parentClientEventId: "c1", phase: "after", navigated: true },
      },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.title).toBe('Click "About Us"');
    expect(steps[0]?.assetClientId).toBe("asset-c1");
    expect(steps[0]?.destinationAssetClientId).toBe("asset-c1-after");
    expect(steps[0]?.annotations[0]?.navigated).toBe(true);
    expect(steps[0]?.annotations[0]?.highlight).toEqual({ x: 0.1, y: 0.2, w: 0.15, h: 0.05 });
  });

  it("attaches result text to the click step", () => {
    const steps = groupEventsIntoSteps([
      {
        clientEventId: "c2",
        sequence: 1,
        type: CaptureEventType.CLICK,
        timestamp: 1,
        element: { tag: "svg" },
        assetClientId: "asset-c2",
      },
      {
        clientEventId: "c2-result",
        sequence: 2,
        type: CaptureEventType.CUSTOM,
        timestamp: 500,
        metadata: {
          parentClientEventId: "c2",
          phase: "result",
          resultText: "UPI ID has been copied successfully.",
        },
      },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.title).toBe('Click "SVG"');
    expect(steps[0]?.annotations[0]?.resultText).toContain("copied");
  });

  it("merges consecutive INPUTs on the same field", () => {
    const field = { tag: "input", name: "q", ariaLabel: "Search", selectorHint: "input#APjFqb" };
    const steps = groupEventsIntoSteps([
      {
        clientEventId: "a",
        sequence: 1,
        type: CaptureEventType.INPUT,
        timestamp: 1,
        element: field,
      },
      {
        clientEventId: "b",
        sequence: 2,
        type: CaptureEventType.INPUT,
        timestamp: 2,
        element: field,
        assetClientId: "asset-b",
      },
      {
        clientEventId: "c",
        sequence: 3,
        type: CaptureEventType.INPUT,
        timestamp: 3,
        element: field,
        assetClientId: "asset-c",
      },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.title).toBe('Type in "Search"');
    expect(steps[0]?.assetClientId).toBe("asset-c");
    expect(steps[0]?.sourceEventIds).toEqual(["a", "b", "c"]);
  });

  it("combines INPUT group with following CLICK", () => {
    const field = { tag: "input", name: "q", text: "Search", selectorHint: "input.search" };
    const steps = groupEventsIntoSteps([
      {
        clientEventId: "1",
        sequence: 1,
        type: CaptureEventType.INPUT,
        timestamp: 1,
        element: field,
      },
      {
        clientEventId: "2",
        sequence: 2,
        type: CaptureEventType.INPUT,
        timestamp: 2,
        element: field,
      },
      {
        clientEventId: "3",
        sequence: 3,
        type: CaptureEventType.CLICK,
        timestamp: 3,
        element: { text: "Google Search" },
        assetClientId: "asset-click",
      },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.title).toContain("Type in");
    expect(steps[0]?.title).toContain("continue");
    expect(steps[0]?.assetClientId).toBe("asset-click");
  });

  it("handles TAB_CHANGE event cleanly as a workflow step", () => {
    const steps = groupEventsIntoSteps([
      {
        clientEventId: "tab-1",
        sequence: 1,
        type: CaptureEventType.TAB_CHANGE,
        timestamp: 1000,
        url: "https://app.example.com/settings",
        metadata: {
          title: "Account Settings",
          url: "https://app.example.com/settings",
        },
        assetClientId: "asset-tab-1",
      },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.title).toBe("Switch to tab: Account Settings");
    expect(steps[0]?.description).toBe('Switch to the "Account Settings" tab.');
    expect(steps[0]?.assetClientId).toBe("asset-tab-1");
  });
});
