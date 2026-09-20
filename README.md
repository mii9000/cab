# cab

**Coding Agent Boilerplate** (cab) is a starting point for building apps with Pi.dev. Clone it, and your project starts with agent rules and skills already in place instead of pasting prompts into every session.

## Install CAB in a project

Requires Node.js 18 or newer and an internet connection.

```sh
npx create-cab ./my-project
```

Omit the directory to install into the current directory:

```sh
npx create-cab
```

The command installs `AGENTS.md`, `.agents/`, `.pi/settings.json`, and `.pi/aliases.json` from the current `main` branch of `mii9000/cab`.

The command stops before writing if a destination file exists. Review the reported paths, then replace regular files explicitly:

```sh
npx create-cab ./my-project --force
```

`--force` does not follow symbolic links, replace directories, or delete unrelated files.

## Release

1. Run `npm test`.
2. Run `npm pack --dry-run` and inspect the included files.
3. Confirm `create-cab` is still available on npm.
4. Authenticate with `npm login`.
5. Publish with `npm publish`.
6. Test the published version in a temporary directory.
