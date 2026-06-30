// Prompt surface for the three.ws avatar MCP server.
//
// One prompt: showcase-avatar. Given an avatar id or @handle it drives the
// full showcase flow — render the live, rotatable avatar inline (render_avatar
// is an MCP App, so capable hosts show the interactive viewer) AND produce the
// paste-anywhere embed iframe, finishing with a short copy-paste summary.
//
// The argument is resolved here (UUID → id selector, anything else → handle)
// so the generated message hands the model unambiguous tool arguments.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map the raw prompt argument to the selector the tools expect.
export function avatarSelector(raw) {
	const value = String(raw ?? '').trim();
	if (!value) {
		throw new Error('showcase-avatar requires an "avatar" argument: an avatar id (UUID) or @handle.');
	}
	if (UUID_RE.test(value)) return { kind: 'id', value };
	return { kind: 'handle', value: value.replace(/^@/, '') };
}

export function buildPrompts() {
	return [
		{
			definition: {
				name: 'showcase-avatar',
				title: 'Showcase a three.ws avatar',
				description:
					'Render a three.ws 3D avatar live and inline (interactive, rotatable) and produce its ' +
					'paste-anywhere embed iframe, with a short copy-paste summary. Takes an avatar id or @handle.',
				arguments: [
					{
						name: 'avatar',
						description: 'Avatar id (UUID) or three.ws @handle, e.g. "@nirholas".',
						required: true,
					},
				],
			},
			resolve(args = {}) {
				const selector = avatarSelector(args.avatar);
				const ref = selector.kind === 'id' ? `avatar ${selector.value}` : `@${selector.value}`;
				const toolArg = `"${selector.kind === 'id' ? 'id' : 'handle'}": "${selector.value}"`;
				return {
					description: `Showcase ${ref}: live inline 3D render plus ready-to-paste embed code.`,
					messages: [
						{
							role: 'user',
							content: {
								type: 'text',
								text:
									`Showcase the three.ws avatar ${ref}.\n\n` +
									`1. Call the render_avatar tool with { ${toolArg} } so the live, rotatable 3D ` +
									`avatar renders inline in this conversation.\n` +
									`2. Call the avatar_embed_code tool with { ${toolArg} } to get the embed iframe.\n` +
									`3. Finish with a short copy-paste summary containing exactly: the avatar name, ` +
									`the interactive viewer URL, the embed URL, and the <iframe> snippet in a code ` +
									`block — so I can paste the embed into any site without editing.\n\n` +
									`If the avatar cannot be found, say so plainly and suggest checking the id or handle.`,
							},
						},
					],
				};
			},
		},
	];
}
