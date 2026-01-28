import { mock } from "bun:test";

export function createMockQueue() {
	return {
		add: mock((fn: () => Promise<unknown>) => Promise.resolve(fn())),
		addAll: mock((fns: (() => Promise<unknown>)[]) => Promise.all(fns.map((fn) => fn()))),
		start: mock(() => Promise.resolve()),
		pause: mock(() => undefined),
		clear: mock(() => undefined),
		onEmpty: mock(() => Promise.resolve()),
		onSizeLessThan: mock(() => Promise.resolve()),
		size: mock(() => 0),
		filter: mock(() => []),
		dequeue: mock(() => undefined),
		enqueue: mock(() => undefined),
		setPriority: mock(() => undefined),
	};
}
