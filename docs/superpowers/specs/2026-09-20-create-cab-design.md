# `create-cab` Design

## Purpose

Publish an npm initializer that installs CAB's agent configuration into a local directory:

```sh
npx create-cab [directory]
npx create-cab [directory] --force
```

The package will download the current `main` branch of `https://github.com/mii9000/cab` at runtime. It will not bundle configuration files in the npm package.

## Scope

Each run installs this fixed set:

- `AGENTS.md`
- every regular file under `.agents/`
- `.pi/settings.json`
- `.pi/aliases.json`

The command defaults to the current working directory when the user omits `[directory]`. It resolves a relative directory from the current working directory.

The first release will not support other repositories, source branches, refs, configurable manifests, prompts, or release automation.

## Command interface

The npm package and executable will both use the name `create-cab`. This supports both forms:

```sh
npx create-cab ./my-project
npm create cab ./my-project
```

The CLI accepts one optional positional directory and these flags:

- `--force`: replace conflicting regular files
- `--help`: print usage and exit successfully

Unknown flags or more than one positional directory produce a usage error and a nonzero exit code.

## Package structure

The repository will add:

- `package.json` for npm metadata, scripts, the Node requirement, the binary mapping, and dependencies
- `bin/create-cab.js` as the executable CLI entry point
- `lib/installer.js` for downloading, extraction, preflight validation, and copying
- `test/` for tests and fixtures
- usage and publishing documentation in `README.md`

The package will require Node.js 18 or newer and use ECMAScript modules. It will use Node's built-in `fetch`, filesystem promises, temporary-directory APIs, and test runner. The maintained `tar` npm package will be its only runtime dependency.

A `files` allowlist in `package.json` will limit the published package to the executable, installer, and README. npm includes `package.json` automatically.

## Installation flow

1. Parse arguments and resolve the target directory.
2. Create an OS temporary directory.
3. Download `https://codeload.github.com/mii9000/cab/tar.gz/refs/heads/main` into the temporary directory.
4. Reject non-successful HTTP responses and invalid archives.
5. Extract the archive in the temporary directory with `tar`, with absolute paths and parent-directory traversal rejected.
6. Verify that every required source entry exists with the expected type. Reject source symlinks and other non-regular file types.
7. Enumerate the complete source file set, including nested regular files under `.agents/`.
8. Preflight every destination path before creating or changing target files.
9. If preflight succeeds, create required directories and copy each file while preserving its path relative to the repository root.
10. Remove the temporary directory in a `finally` block.
11. Print the number of installed files and the resolved target path.

Downloading and extraction happen before destination changes. The fixed GitHub tarball URL avoids GitHub API rate limits and requires one network request.

The installer module will accept its source URL or fetch operation through an internal test seam. The public CLI will always use the fixed CAB URL.

## Conflict and filesystem rules

Without `--force`, any existing destination file is a conflict. The command will collect and print all conflicts, then exit before writing any destination file.

With `--force`, the command may replace existing regular files. Existing directories may merge with source directories.

The command will reject these cases even with `--force`:

- the target directory itself or a path beneath it that CAB needs to traverse is a symbolic link
- a directory exists where CAB needs a file
- a non-directory exists where CAB needs a directory
- a destination has a filesystem type other than a regular file or directory

The installer will use `lstat` when checking existing destination entries so it does not follow symlinks within the managed target tree. It will not remove directories.

A conflict, download failure, extraction failure, or source validation failure leaves the destination unchanged. A filesystem failure during the copy phase can leave a partial installation; the command will report the failure and will not attempt rollback.

## Output and errors

Successful runs print a short summary. Expected failures use concise messages that identify the cause:

- download failures include the HTTP status or network error
- malformed downloads report an extraction failure
- missing or invalid source entries identify the affected path
- conflicts list every conflicting relative path and suggest `--force`
- unsafe destination types identify the affected path

The executable catches operational errors, writes the message to standard error, and sets a nonzero exit code without printing a stack trace. Internal programmer errors may retain their stack traces during tests.

## Testing

Tests will use `node:test`, temporary directories, and a local HTTP server serving fixture archives. Automated tests will not depend on GitHub availability.

Coverage will include:

- current-directory and explicit-directory targets
- relative and nested target paths
- the exact install set, including nested `.agents` files
- exclusion of repository files outside the install set
- complete conflict reporting before writes
- `--force` replacement of regular files
- allowed merging of existing directories
- rejection of symlinks and file/directory type mismatches
- missing source entries
- HTTP failures and invalid archives
- temporary-directory cleanup on success and failure
- CLI help, argument errors, exit codes, and messages

Release verification will run the test suite, inspect `npm pack --dry-run`, and perform one real `npx` smoke test against a temporary directory.

## Release process

The initial release will use this manual process:

1. Run the automated tests.
2. Run `npm pack --dry-run` and inspect the package contents.
3. Authenticate to npm with an account allowed to publish `create-cab`.
4. Publish `create-cab@1.0.0`.
5. Run `npx create-cab <temporary-directory>` and inspect the installed files.

The package name `create-cab` was unclaimed when this design was written, but npm availability must be checked again before publishing.
