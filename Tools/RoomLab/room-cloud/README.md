# Room Lab Cloud / protocol 1

3.0.0 build19: `GET/POST rooms` and `GET rooms/:id` provide a flat room library, separate from version trees. Records and list metadata live under `<workspace hash>/rooms/` in R2. Uploads verify the manifest, available chunks and a single-room project. Pagination uses an opaque R2 cursor. Existing D1 versions, graph relationships and live collaboration are unchanged. The editor provides the room node UI and compatibility-aware import; the existing browser version-tree page is unchanged.

2.5.0: the deployed Site currently has public page access; workspace data still requires the shared workspace secret. Preserve the existing Sites audience. `POST graph/edit` manages display relationships with optimistic generations. `node_metadata` holds parent overrides and reversible deletion; immutable revision manifests, source parents and R2 chunks are never rewritten. Deletion lifts children; restore returns a root. Manual commits also advance the graph generation, so concurrent edits must refresh. The browser exposes editing; the desktop embedded graph exposes preview, checkout and child-upload only. The additive migration is `0003_adorable_wraith.sql`; older project JSON remains v2 and protocol remains 1.

Sites relay for Room Lab. D1 stores immutable versions and branch heads, R2 stores SHA-256 content-addressed 4 MiB chunks. The platform service bearer and shared workspace key are never part of source, logs, or release packages.

`lib/sync-handler.mjs` is the transport-neutral handler; Vinext API routes inject DB/BUCKET. `db/schema.ts` and immutable `drizzle` migrations own the schema. No request creates tables. A shared key is hashed to form the workspace namespace.

## Two modes

Manual save: each explicit save creates a new branch with a parent pointing to the last cloud revision actually read, rather than updating that parent branch. Local drafts do not create history entries.

Live collaboration: clients that loaded the same source revision join the same channel. Both must be online. One-second client polls exchange transient manifests with sequence compare-and-swap; heartbeat expires after 8 seconds. Live manifests are stored separately from immutable versions and ignored after 24 hours. Concurrent clients merge distinct IDs/fields using a common base. Same-field conflicts retain both local recovery drafts and pause publication until a user chooses. Only manual save promotes a draft to a version. This is HTTP near-real-time collaboration, not a zero-latency shared cursor service.

Both modes preserve project v2 JSON and ZIP compatibility; sync metadata lives outside project files. Current limits: 128 MiB project, 1024 files, 512 chunks. Latest 100 versions and 200 branches are listed; no automatic history or R2 garbage collection currently runs.

## Access / maintenance

Sites dispatch protects the private Site. Desktop requests send `OAI-Sites-Authorization: Bearer ...` and `X-Room-Workspace-Key`. The owner computer stores the shared connection encrypted with Windows DPAPI. Windows' bundled curl provides the native TLS transport, with credentials only through stdin and redirects disabled. No service key is embedded in the editor.

Use the Sites skill source helper and deployment workflow to build, commit/push and package. New migrations append to `drizzle`; do not modify applied SQL. Local previews use `.wrangler/state`, independently of production. Editor tests `cloud-relay-smoke.cjs` and `cloud-modes-smoke.cjs` can receive live credentials through hidden stdin; they always create isolated acceptance workspaces. Never test against the user's production workspace key.

## Cloud library page

The landing page opens the workspace with a full rlsync1 connection key or its 43-character workspace secret. Only the workspace secret is held in browser memory; no key is put into URLs or localStorage, and disconnect clears the cache. The UI uses same-origin requests and preserves the existing Site audience.

The graph uses immutable revision.parent relations, combines branch aliases sharing one head, highlights the selected revision, and shows missing ancestors as loadable placeholders. Search, wheel zoom, background pan and fit-all support larger histories. The selected-version sidebar lazily verifies project.json chunks before showing details; it also reads the immutable parent revision's project.json through the same strict SHA-256 chunk cache. Rooms are matched by globally unique `room.id` and compared with key-order-independent serialization, so added, modified and deleted rooms are explicit. Graph-position-only changes are shown as a separate “布局调整” status rather than “unchanged”. Root versions say “首次保存” and are never reported as additions; a missing or unverifiable parent reports “无法比较” instead of assuming every room is unchanged. Dragging a graph node changes only the display parent; the comparison baseline always uses `revision.parent`, never the editable display parent. The flat room list shows name, size and mechanism count without course grouping or per-file rows. The complete UTF-8 ZIP is still downloadable after SHA-256 checks; the workspace secret stays in page memory and is never written to URLs or storage. Reads and downloads do not create new versions. The page does not delete or rewrite cloud history.

Run `node --test tests/library.test.mjs tests/room-compare.test.mjs` for key scoping, graph ancestry/cycle handling, ZIP structure, and room comparison edge cases (added/modified/deleted, same-name different IDs, key order, root/first save, missing parent, layout-only changes and empty projects); run TypeScript with `node node_modules/typescript/bin/tsc --noEmit`. Full browser acceptance lives in the sibling editor's `tests/cloud-library-ui-smoke.cjs`, which creates an isolated local workspace and verifies selection, download integrity, mobile layout and unchanged version counts.
