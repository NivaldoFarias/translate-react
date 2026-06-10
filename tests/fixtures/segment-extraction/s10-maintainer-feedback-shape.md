---
title: Maintainer shape
description: Link in prose plus code comment mix for review targeting.
---

When you [update state](/reference/react/useState), React schedules a render.

```js
// This comment explains the hook call
function Example() {
	const [value, setValue] = useState(0);
	return value;
}
```

See [preserving state](/learn/preserving-and-resetting-state) for pitfalls.
