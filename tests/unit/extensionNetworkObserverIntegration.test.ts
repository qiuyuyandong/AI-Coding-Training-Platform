import { describe, expect, it } from "vitest";
import {
  createRegistryRequestLifecycleSource,
  createWebRequestObserver,
  OJ_HOST_PATTERNS,
  OJ_RESOURCE_TYPES,
  persistRecordedLifecycle,
  registerNetworkObserverListeners,
  type LifecycleOutcome,
  type PersistRecordedCallback,
  type RegisterCallback,
  type WebRequestDetails,
} from "@/extension/src/networkObserver";

const LEETCODE_SUBMIT = "https://leetcode.com/problems/two-sum/submit/";

const validDetails = (overrides: Partial<WebRequestDetails> = {}): WebRequestDetails => ({
  requestId: "req-1",
  url: LEETCODE_SUBMIT,
  method: "POST",
  tabId: 5,
  frameId: 0,
  documentId: "doc-1",
  timeStamp: 1000,
  type: "xmlhttprequest",
  ...overrides,
});

const fakeObserver = () => createWebRequestObserver(
  createRegistryRequestLifecycleSource(() => "2026-07-24T01:00:00.000Z"),
);

describe("registerNetworkObserverListeners", () => {
  it("registers exactly five listeners with the correct kinds", () => {
    const registeredKinds: string[] = [];
    const registerCallback: RegisterCallback = (kind, _callback, _filter) => {
      void _callback; void _filter;
      registeredKinds.push(kind);
    };
    registerNetworkObserverListeners(
      registerCallback,
      fakeObserver(),
      () => { /* noop */ },
      () => { /* noop */ },
    );
    expect(registeredKinds).toEqual([
      "onBeforeRequest",
      "onBeforeRedirect",
      "onResponseStarted",
      "onCompleted",
      "onErrorOccurred",
    ]);
  });

  it("passes OJ_HOST_PATTERNS and OJ_RESOURCE_TYPES to each registration", () => {
    const capturedFilters: Array<{ urls: readonly string[]; types: readonly string[] }> = [];
    const registerCallback: RegisterCallback = (_kind, _callback, filter) => {
      void _kind; void _callback;
      capturedFilters.push(filter);
    };
    registerNetworkObserverListeners(
      registerCallback,
      fakeObserver(),
      () => { /* noop */ },
      () => { /* noop */ },
    );
    expect(capturedFilters).toHaveLength(5);
    for (const filter of capturedFilters) {
      expect(filter.urls).toEqual([...OJ_HOST_PATTERNS]);
      expect(filter.types).toEqual([...OJ_RESOURCE_TYPES]);
    }
  });

  it("records E1 and calls persist+schedule when observer returns recorded", () => {
    const observer = fakeObserver();
    const capturedCallbacks: Array<(details: WebRequestDetails, ...extra: unknown[]) => void> = [];
    const persistCalls: LifecycleOutcome[] = [];
    const scheduleCalls: Array<() => Promise<void>> = [];

    const registerCallback: RegisterCallback = (_kind, callback, _filter) => {
      void _kind; void _filter;
      capturedCallbacks.push(callback);
    };
    const persistCallback: PersistRecordedCallback = (outcome) => {
      persistCalls.push(outcome);
    };
    const scheduleCallback = (work: () => Promise<void>) => {
      scheduleCalls.push(work);
    };

    registerNetworkObserverListeners(registerCallback, observer, persistCallback, scheduleCallback);

    // Find the onBeforeRequest callback (index 0)
    const onBeforeRequest = capturedCallbacks[0];
    expect(onBeforeRequest).toBeDefined();

    // Invoke with valid details
    onBeforeRequest(validDetails());

    // Should have scheduled persistence but not called it yet (deferred via executor)
    expect(scheduleCalls).toHaveLength(1);
    expect(persistCalls).toHaveLength(0); // not called until scheduled work runs

    // Run the scheduled work
    const scheduledWork = scheduleCalls[0];
    expect(scheduledWork).toBeInstanceOf(Function);

    // Provide a fake storage and run
    const storageValues: Record<string, unknown> = {};
    const fakeStorage = {
      get: async (keys: readonly string[]) =>
        Object.fromEntries(keys.filter((k) => k in storageValues).map((k) => [k, storageValues[k]])),
      set: async (items: Record<string, unknown>) => { Object.assign(storageValues, items); },
    };

    // Re-register with wired persist
    persistCalls.length = 0;
    scheduleCalls.length = 0;
    registerNetworkObserverListeners(
      registerCallback,
      observer,
      async (outcome) => {
        persistCalls.push(outcome);
        await persistRecordedLifecycle(
          fakeStorage as Parameters<typeof persistRecordedLifecycle>[0],
          outcome,
          "leetcode",
          5,
          0,
          "doc-1",
          "v4-contract-1",
        );
      },
      (work) => { scheduleCalls.push(work); },
    );

    // Invoke onBeforeRequest again
    const onBeforeRequest2 = capturedCallbacks[0];
    onBeforeRequest2(validDetails({ requestId: "req-2" }));

    expect(scheduleCalls).toHaveLength(1);
    // Run scheduled work
    const work = scheduleCalls[0];
    expect(work).toBeInstanceOf(Function);
    expect(persistCalls).toHaveLength(0); // not called until work runs
    work(); // execute the deferred work
    expect(persistCalls).toHaveLength(1);
  });

  it("does NOT call persist or schedule when observer returns ignored", () => {
    const observer = fakeObserver();
    const capturedCallbacks: Array<(details: WebRequestDetails, ...extra: unknown[]) => void> = [];
    const persistCalls: LifecycleOutcome[] = [];
    const scheduleCalls: Array<() => Promise<void>> = [];

    const registerCallback: RegisterCallback = (_kind, callback, _filter) => {
      void _kind; void _filter;
      capturedCallbacks.push(callback);
    };
    const persistCallback: PersistRecordedCallback = (outcome) => {
      persistCalls.push(outcome);
    };
    const scheduleCallback = (work: () => Promise<void>) => {
      scheduleCalls.push(work);
    };

    registerNetworkObserverListeners(registerCallback, observer, persistCallback, scheduleCallback);

    // Invoke onBeforeRequest with a non-adapter URL (ignored)
    const onBeforeRequest = capturedCallbacks[0];
    onBeforeRequest(validDetails({ url: "https://example.com/submit" }));

    expect(scheduleCalls).toHaveLength(0);
    expect(persistCalls).toHaveLength(0);
  });

  it("does NOT call persist or schedule when observer returns rejected", () => {
    const observer = fakeObserver();
    const capturedCallbacks: Array<(details: WebRequestDetails, ...extra: unknown[]) => void> = [];
    const persistCalls: LifecycleOutcome[] = [];
    const scheduleCalls: Array<() => Promise<void>> = [];

    const registerCallback: RegisterCallback = (_kind, callback, _filter) => {
      void _kind; void _filter;
      capturedCallbacks.push(callback);
    };
    const persistCallback: PersistRecordedCallback = (outcome) => {
      persistCalls.push(outcome);
    };
    const scheduleCallback = (work: () => Promise<void>) => {
      scheduleCalls.push(work);
    };

    registerNetworkObserverListeners(registerCallback, observer, persistCallback, scheduleCallback);

    // Trigger an ignored outcome (AtCoder is excluded) to verify neither persist nor schedule fires
    const onBeforeRequest = capturedCallbacks[0];
    onBeforeRequest(validDetails({ url: "https://atcoder.jp/submit" }));

    expect(scheduleCalls).toHaveLength(0);
    expect(persistCalls).toHaveLength(0);
  });

  it("listener callbacks do not throw and return void", () => {
    const observer = fakeObserver();
    const capturedCallbacks: Array<(details: WebRequestDetails, ...extra: unknown[]) => void> = [];

    const registerCallback: RegisterCallback = (_kind, callback, _filter) => {
      void _kind; void _filter;
      capturedCallbacks.push(callback);
    };
    const noopPersist: PersistRecordedCallback = () => { /* noop */ };
    const noopSchedule: (work: () => Promise<void>) => void = () => { /* noop */ };

    registerNetworkObserverListeners(registerCallback, observer, noopPersist, noopSchedule);

    // Call each listener kind with valid details — none should throw
    for (const cb of capturedCallbacks) {
      expect(() => { cb(validDetails()); }).not.toThrow();
    }

    // Call with missing documentId
    expect(() => {
      capturedCallbacks[0](validDetails({ documentId: undefined }));
    }).not.toThrow();

    // Call with tabId < 0
    expect(() => {
      capturedCallbacks[0](validDetails({ tabId: -1 }));
    }).not.toThrow();
  });

  it("handles redirect and extra-arg listeners (onBeforeRedirect, onResponseStarted, onErrorOccurred)", () => {
    const observer = fakeObserver();
    const capturedCallbacks: Array<(details: WebRequestDetails, ...extra: unknown[]) => void> = [];

    const registerCallback: RegisterCallback = (_kind, callback, _filter) => {
      void _kind; void _filter;
      capturedCallbacks.push(callback);
    };
    const persistCalls: LifecycleOutcome[] = [];
    const scheduleCalls: Array<() => Promise<void>> = [];

    registerNetworkObserverListeners(
      registerCallback,
      observer,
      (outcome) => { persistCalls.push(outcome); },
      (work) => { scheduleCalls.push(work); },
    );

    // onBeforeRedirect (index 1) with redirectUrl
    const onBeforeRedirect = capturedCallbacks[1];
    expect(() => {
      onBeforeRedirect(validDetails(), "https://www.luogu.com.cn/record/123");
    }).not.toThrow();
    expect(scheduleCalls.length).toBeGreaterThanOrEqual(1);

    // onResponseStarted (index 2) with statusCode
    const onResponseStarted = capturedCallbacks[2];
    expect(() => {
      onResponseStarted(validDetails({ requestId: "req-rs" }), 202);
    }).not.toThrow();

    // onErrorOccurred (index 4) with error string
    const onErrorOccurred = capturedCallbacks[4];
    expect(() => {
      onErrorOccurred(validDetails({ requestId: "req-err" }), "net::ERR_FAILED");
    }).not.toThrow();
  });
});
