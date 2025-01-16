---
title: Your First Component
---

# Creating and nesting components

React apps are made out of components. A component is a piece of the UI that has its own logic and appearance. A component can be as small as a button, or as large as an entire page.

```jsx
function MyButton() {
	return <button>I'm a button</button>;
}

export default function MyApp() {
	return (
		<div>
			<h1>Welcome to my app</h1>
			<MyButton />
		</div>
	);
}
```
