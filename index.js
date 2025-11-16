// Compatibility entrypoint: load main.js
try {
	require('./main');
} catch (e) {
	console.error('Failed to load main.js from index.js:', e);
}

