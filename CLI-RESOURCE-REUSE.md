# CLI anonymous resource reuse

Set `AGENT_BROWSER_RESOURCE_CACHE=public-anonymous-v1` in the environment of a
new native browser host to enable the bounded public CSS/image cache described
in `RESOURCE-REUSE.md`. Unset remains the default and preserves existing options.

```sh
AGENT_BROWSER_RESOURCE_CACHE=public-anonymous-v1 agent-browser serve
```

This is startup configuration, not a command-line option or per-command setting.
A client connected to an already-running daemon does not reconfigure its cache;
start the intended host with the setting. The cache belongs to each transport and
is cleared on closure, not persisted or shared between hosts.

## Behavior and restrictions

- Enables transport `resourceCache: {}` and session `resourceCredentials: "omit"`.
- Omits credentials for native stylesheet/image loads, including their CORS
  credential policy. Credential-dependent assets can therefore behave differently.
- Navigation, scripts and page-fetch credential policies are unchanged. This is
  not an anonymous browsing mode or a general HTML/API cache.
- Only native document loading without process or page-script runtimes is
  supported. Reader, SafeJS-root and page-script configurations are rejected.
- Empty, misspelled and other cache values are invalid; unset disables it.
- Validation occurs before connection-file or secret-configuration IO. Existing
  validation of an adapter without a SafeJS root still takes precedence.
- Policy checks, explicit freshness, same-origin admission, bounded lifetime and
  honest network-versus-memory accounting remain as documented in
  `RESOURCE-REUSE.md`. No challenge bypass, credential provider or new dependency.

## September 14, 2026 validation

The isolated candidate passes 563 cases in eight explicit native-manifest files,
production compilation, eight strict test roots, four-file formatting and two
new-file lint checks. Integration tests inspect host/session/transport options,
default behavior, cookie-jar identity, validation ordering, environment capture
and existing-connection forwarding with external boundaries mocked.

Four real compiled CLI `capabilities` invocations also pass: enabled, invalid,
reader-incompatible and synthetic process-runtime-incompatible configurations.
They use socket-denying seccomp, no addons, a subprocess-denying preload, private
empty HOME/TMP/runtime directories and no credential settings. The synthetic
SafeJS path is rejected before activation; this is not a SafeJS probe.
These checks do not create a real service or establish a live cache hit.

Evidence starts at `/dev/shm/agent-browser-cli-resource-reuse-september14/` and is
copied to `node_modules/.cache/native-validation/cli-resource-reuse-september14/`.
The earlier paired Lobsters measurements in `RESOURCE-REUSE.md` remain the
native-API evidence, not a new CLI-service run. Full native release, live service,
TTY/PTY, SafeJS, credential and device acceptance gates remain separate.
