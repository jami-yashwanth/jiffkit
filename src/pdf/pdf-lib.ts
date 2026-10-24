// The worker's one door to pdf-lib. Imported dynamically, so the build emits it as its own `pdf-lib-<hash>.js`
// chunk: loaded on first use, never part of a page's first-load budget, and easy to find in tests.
export * from 'pdf-lib';
