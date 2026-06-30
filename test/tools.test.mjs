// Smoke test: the tool surface enumerates correctly without secrets or network.
//
// Asserts the three tools exist with unique names, real descriptions, MCP
// ToolAnnotations (read-only), human titles, and that render_avatar declares
// its MCP Apps ui:// resource (SEP-1865) via _meta.ui.resourceUri.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTools } from '../src/tools.js';
import { buildPrompts, avatarSelector } from '../src/prompts.js';
import { UI_RESOURCE_URI, UI_MIME_TYPE, UI_RESOURCE_META } from '../src/ui.js';

const EXPECTED_TOOLS = ['render_avatar', 'avatar_embed_code', 'get_avatar'];

test('enumerates exactly the three avatar tools with unique names', () => {
	const tools = buildTools();
	assert.equal(tools.length, 3);
	const names = tools.map((t) => t.definition.name);
	assert.deepEqual([...new Set(names)].sort(), [...EXPECTED_TOOLS].sort());
});

test('every tool has a title, description, input schema, and handler', () => {
	for (const tool of buildTools()) {
		const def = tool.definition;
		assert.equal(typeof def.title, 'string', `${def.name} missing title`);
		assert.ok(def.title.length > 0, `${def.name} empty title`);
		assert.equal(typeof def.description, 'string', `${def.name} missing description`);
		assert.ok(def.description.length >= 20, `${def.name} description too short`);
		assert.equal(def.inputSchema?.type, 'object', `${def.name} missing object inputSchema`);
		assert.equal(typeof tool.handler, 'function', `${def.name} missing handler`);
	}
});

test('every tool is annotated read-only, idempotent, open-world', () => {
	for (const tool of buildTools()) {
		const { name, annotations } = tool.definition;
		assert.ok(annotations, `${name} missing annotations`);
		assert.equal(annotations.readOnlyHint, true, `${name} readOnlyHint`);
		assert.equal(annotations.idempotentHint, true, `${name} idempotentHint`);
		assert.equal(annotations.openWorldHint, true, `${name} openWorldHint`);
	}
});

test('render_avatar declares the MCP Apps ui:// resource', () => {
	const renderAvatar = buildTools().find((t) => t.definition.name === 'render_avatar');
	assert.ok(renderAvatar, 'render_avatar tool not found');
	assert.equal(renderAvatar.definition._meta?.ui?.resourceUri, UI_RESOURCE_URI);
	assert.match(UI_RESOURCE_URI, /^ui:\/\//, 'UI resource must use the ui:// scheme');
	assert.equal(UI_MIME_TYPE, 'text/html;profile=mcp-app');
	assert.ok(
		Array.isArray(UI_RESOURCE_META.ui?.csp?.resourceDomains) &&
			UI_RESOURCE_META.ui.csp.resourceDomains.length > 0,
		'UI resource must carry a CSP grant',
	);
});

test('every tool advertises an honest object outputSchema', () => {
	for (const tool of buildTools()) {
		const { name, outputSchema } = tool.definition;
		assert.ok(outputSchema, `${name} missing outputSchema`);
		assert.equal(outputSchema.type, 'object', `${name} outputSchema must be an object schema`);
		assert.equal(
			outputSchema.additionalProperties,
			true,
			`${name} outputSchema must stay open to additive fields`,
		);
		const props = Object.keys(outputSchema.properties || {});
		assert.ok(props.length > 0, `${name} outputSchema has no properties`);
		assert.ok(Array.isArray(outputSchema.required), `${name} outputSchema missing required[]`);
		for (const field of outputSchema.required) {
			assert.ok(props.includes(field), `${name} requires undeclared field "${field}"`);
		}
	}
});

test('outputSchemas mirror the structuredContent each handler builds', () => {
	const byName = new Map(buildTools().map((t) => [t.definition.name, t.definition]));
	const fields = (name) => Object.keys(byName.get(name).outputSchema.properties);

	assert.deepEqual(
		fields('render_avatar').sort(),
		['background', 'embed_url', 'id', 'iframe', 'model_url', 'name', 'viewer_url'],
	);
	assert.deepEqual(fields('avatar_embed_code').sort(), ['embed_url', 'id', 'iframe', 'name']);
	assert.deepEqual(
		fields('get_avatar').sort(),
		['id', 'model_url', 'name', 'owner', 'slug', 'thumbnail', 'visibility'],
	);
	// owner is only present when the API response carries a user record, so it
	// must NOT be advertised as required.
	const getAvatar = byName.get('get_avatar').outputSchema;
	assert.ok(!getAvatar.required.includes('owner'), 'owner must stay optional');
	// id is null for raw-model renders — advertised as nullable, never omitted.
	assert.deepEqual(byName.get('render_avatar').outputSchema.properties.id.type, ['string', 'null']);
});

test('showcase-avatar prompt enumerates with its required argument', () => {
	const prompts = buildPrompts();
	assert.equal(prompts.length, 1);
	const def = prompts[0].definition;
	assert.equal(def.name, 'showcase-avatar');
	assert.equal(typeof def.title, 'string');
	assert.ok(def.description.length >= 20, 'prompt description too short');
	assert.equal(def.arguments.length, 1);
	assert.deepEqual(
		{ name: def.arguments[0].name, required: def.arguments[0].required },
		{ name: 'avatar', required: true },
	);
	assert.equal(typeof prompts[0].resolve, 'function');
});

test('showcase-avatar resolves a handle into a render + embed instruction', () => {
	const prompt = buildPrompts()[0];
	const result = prompt.resolve({ avatar: '@nirholas' });
	assert.equal(typeof result.description, 'string');
	assert.equal(result.messages.length, 1);
	assert.equal(result.messages[0].role, 'user');
	assert.equal(result.messages[0].content.type, 'text');
	const text = result.messages[0].content.text;
	assert.match(text, /render_avatar/, 'must drive the inline render');
	assert.match(text, /avatar_embed_code/, 'must drive the embed iframe');
	assert.match(text, /"handle": "nirholas"/, 'handle arg must be normalized (no @)');
	assert.match(text, /copy-paste summary/i, 'must ask for the copy-paste summary');
});

test('showcase-avatar resolves a UUID as an id selector and rejects empty input', () => {
	const uuid = '01234567-89ab-cdef-0123-456789abcdef';
	const prompt = buildPrompts()[0];
	const result = prompt.resolve({ avatar: uuid });
	assert.match(result.messages[0].content.text, new RegExp(`"id": "${uuid}"`));

	assert.deepEqual(avatarSelector(uuid), { kind: 'id', value: uuid });
	assert.deepEqual(avatarSelector('@nirholas'), { kind: 'handle', value: 'nirholas' });
	assert.deepEqual(avatarSelector('nirholas'), { kind: 'handle', value: 'nirholas' });
	assert.throws(() => avatarSelector(''), /avatar/i);
	assert.throws(() => prompt.resolve({}), /avatar/i);
});
