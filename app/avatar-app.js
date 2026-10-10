// MCP App (iframe) for the three.ws avatar viewer.
//
// Renders the avatar's GLB as an interactive, rotatable <model-viewer> inside
// the host's sandboxed iframe. It connects to the host via the MCP Apps SDK,
// reads the render_avatar tool result (structuredContent.model_url), and points
// model-viewer at it. The host pushes the triggering tool result to this app
// after connect, so registering ontoolresult before connect() is essential.
//
// This file is bundled (esbuild) and inlined into src/avatar-app.html by
// app/build.mjs — the published server serves that HTML as the ui:// resource.

import { App } from '@modelcontextprotocol/ext-apps';

const viewer = document.getElementById('viewer');
const nameEl = document.getElementById('name');
const statusEl = document.getElementById('status');

// Defense in depth: only point model-viewer at an https GLB/GLTF URL (http
// allowed solely for localhost dev). Blocks javascript:/data:/blob:/file:
// schemes from ever reaching the src attribute even if a malicious tool
// result slips through the server-side validation.
function isSafeModelUrl(url) {
	if (typeof url !== 'string' || url.trim() === '') return false;
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol === 'https:') return true;
	if (parsed.protocol === 'http:') {
		const host = parsed.hostname;
		return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
	}
	return false;
}

function applyResult(result) {
	const sc = (result && result.structuredContent) || {};
	if (sc.model_url && isSafeModelUrl(sc.model_url)) {
		viewer.setAttribute('src', sc.model_url);
		statusEl.hidden = true;
	} else if (sc.model_url) {
		viewer.removeAttribute('src');
		statusEl.hidden = false;
		statusEl.textContent = 'Blocked an unsafe model URL.';
		console.warn('[avatar-app] ignored unsafe model_url:', sc.model_url);
	}
	if (sc.name) {
		nameEl.textContent = sc.name;
		viewer.setAttribute('alt', sc.name);
	}
	if (sc.background && sc.background !== 'transparent') {
		document.body.style.background = sc.background === 'dark' ? '#0b0b12' : sc.background === 'light' ? '#f4f4f7' : sc.background;
	}
}

const app = new App({ name: 'three.ws Avatar Viewer', version: '0.2.0' });

// Register handlers BEFORE connect so the initial tool result isn't missed.
app.ontoolresult = (params) => applyResult(params);
app.onerror = (err) => console.error('[avatar-app]', err);
app.onhostcontextchanged = (ctx) => {
	if (ctx && ctx.theme) document.documentElement.dataset.theme = ctx.theme;
};

app.connect().catch((err) => {
	// Standalone/preview (opened outside an MCP host): show a clear hint rather
	// than a blank frame. Inside a host, connect() resolves and the result
	// arrives via ontoolresult.
	statusEl.textContent = 'Waiting for an MCP host…';
	console.warn('[avatar-app] not connected to a host:', err?.message || err);
});
