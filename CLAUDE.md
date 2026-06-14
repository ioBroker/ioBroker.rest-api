# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.rest-api` is an ioBroker adapter that exposes a RESTful HTTP + Swagger UI interface for reading/writing ioBroker states and objects, sending messages to other adapters, and subscribing to changes (via URL hooks or long polling). It is similar to `simple-api` but adds long polling, URL-hook subscriptions, OAuth2, and a Swagger playground. It can run standalone or as a **web extension** mounted inside the `web` adapter under `/rest-api/`.

## Commands

- **Build:** `npm run build` — runs `tsc -p tsconfig.build.json` then `node tasks --copy-yaml`. The `--copy-yaml` step is required: the swagger/config YAML files are *not* handled by tsc and must be copied into `build/` or the adapter fails to start.
- **Type-check only (no emit):** `npm run build:ts`
- **Full regenerate** (regenerates command docs + bumps yaml version + copies yaml): `npm run build:all`, or just the doc generation: `npm run update-list`.
- **Lint:** `npm run lint` (ESLint flat config extending `@iobroker/eslint-config`).
- **Test (integration):** `npm test` / `npm run test:integration` — `mocha --exit`. Spins up a real js-controller harness via `@iobroker/testing`, so it is slow and requires the build output.
- **Run a single test file:** `npx mocha test/testApi.js --exit`. Filter by name with `--grep "<pattern>"`.
- **Package validation:** `npm run test:package`.

Node >= 20 is required. There is no watch task — rebuild after changes before running tests, because tests and the adapter run against `build/`, not `src/`.

## Architecture

**Source lives in `src/` (TypeScript), compiles to `build/`.** `package.json#main` is `build/main.js`. Anything loaded at runtime resolves against `build/`, not `src/`.

### Entry point and request flow

- `src/main.ts` — `RestApiAdapter` (extends `Adapter` from `@iobroker/adapter-core`). Handles adapter lifecycle, creates the Express app + `WebServer` (`@iobroker/webserver`), wires OAuth2 (`createOAuth2Server`) when `config.auth` is on, and forwards `stateChange`/`objectChange` events into the API instance.
- `src/lib/rest-api.ts` — the `SwaggerUI` class (default export; imported in main as `RestAPI`). This is the heart of the adapter. Its `init()` sets up all Express middleware and routes, authentication, the `/v1/polling` long-poll endpoint, the `/v1/command/*` dispatcher, log-file serving, and subscription bookkeeping.

There are **two distinct families of routes**, dispatched differently:

1. **REST resource routes** (`/v1/state/...`, `/v1/object/...`, `/v1/file/...`, `/v1/enum/...`, history, sendTo). These are declared in `src/lib/api/swagger/swagger.yaml`. At startup, `init()` walks `swaggerDocument.paths` and binds each path to an Express handler by mapping `x-swagger-router-controller` (→ controller filename) and `operationId` (→ exported function) to `build/lib/api/controllers/<controller>.js`. This manual binder is the project's own replacement for the unmaintained `swagger-node-runner-fork` — there is no swagger middleware doing routing for you. **Adding a REST endpoint means editing both `swagger.yaml` and the matching controller.**

2. **Socket "commands"** at `/v1/command/<commandName>`. These are *not* controllers. They are dispatched dynamically in `rest-api.ts` to handlers from `@iobroker/socket-classes` (`SocketCommands` / `SocketCommandsAdmin`). Argument names are extracted by reflection (`getParamNames` in `src/lib/common.ts` parses the function's `.toString()`), matched against query/body params, and the handler is invoked with a synthesized socket-like `{ _acl }` object.

### Controllers

`src/lib/api/controllers/*.ts` — `state`, `object`, `file`, `enum`, `history`, `sendTo`, plus shared helpers in `common.ts`. Each exported function is an Express-style `(req: RequestExt, res: Response)` handler. `req` is augmented (see `RequestExt` in `src/lib/types.d.ts`) with `_adapter`, `_user`, `_swaggerObject` (the `SwaggerUI` instance, used for subscribe/unsubscribe), and `swagger.operation.parameters` (used by `parseUrl` to extract path params). Controllers gate access through `checkPermissions(...)` in `common.ts` before touching adapter APIs.

### Auto-generated docs — do not hand-edit

`tasks.js` generates, from the live `@iobroker/socket-classes` command signatures:
- the command list in `README.md` between `<!-- START -->` / `<!-- END -->`, and
- the command section of `swagger.yaml` between `# commands start` / `# commands stop` (with admin commands further bracketed by `# admin commands start/end`).

Edits inside those markers will be overwritten by `npm run update-list` / `build:all`. To change a command's description, edit the `description` map in `tasks.js`, not the generated output. `tasks.js` also runs `--update-yaml-version` (syncs swagger version to `package.json`) and `--copy-yaml` (copies `swagger.yaml` and `config/default.yaml` into `build/`).

At runtime, `config.noCommands` / `config.noAdminCommands` cause `init()` to strip the corresponding marker sections and write a `swaggerEdited.yaml`; web-extension mode rewrites `basePath` into `swagger_extension.yaml`.

### Subscriptions

Change notifications use one `subscribes` map keyed by an md5 hash of either the client's URL hook or its IP/session id. Two delivery modes:
- **URL hook** — the adapter POSTs change payloads to a client-supplied HTTPS endpoint (validated on register; dropped after 3 failures).
- **Long polling** — client holds open `/v1/polling`; changes resolve the pending promise or queue briefly. A GC interval tears down stale poll sessions.

`stateChange`/`objectChange` (forwarded from `main.ts`) fan out to matching subscriptions, honoring per-subscription `delta` and `onchange` filters. The `_addTimeout`/`_waitFor` path implements "write a state and wait for `ack:true`" with a timeout (the `?timeout=` query on writes).

### Config & web-extension mode

Adapter config is typed by `RestApiAdapterConfig` in `src/lib/types.d.ts`. When running as a web extension, `instanceSettings` is non-null, `routerPrefix` becomes `/rest-api/`, CORS is disabled (the host `web` adapter owns it), and `welcomePage()`/`waitForReady()` integrate with the web adapter.

## Tests

Integration tests in `test/` (`testApi.js`, `testApiAsUser.js`, `testApiAsLimitedUser.js`, `testSsl.js`) use `@iobroker/testing`'s `tests.integration` harness to boot a controller, configure the adapter on a test port, and exercise the live HTTP API with `axios`. `testApiAsUser`/`testApiAsLimitedUser` verify permission enforcement for non-admin users. `.mocharc.json` only registers `test/mocha.setup.js`.
