# cab

**cab** (coding agent boilerplate) is a starting point for building apps with AI coding agents. Clone it, and your project starts with agent rules and skills already in place instead of pasting prompts into every session.

## What's in the box

| Path | What it is |
|------|------------|
| `AGENTS.md` | Agent rules: think before coding, simplicity first, surgical changes, goal-driven execution. |
| `CLAUDE.md` | Same rules for Claude Code. |
| `.agents/skills/` | Custom skills for any agent that reads this directory. |
| `.claude/settings.json` | Enables plugins for Claude Code. |
| `.pi/settings.json` | Installs pi extensions. |

## Skills

**coder** — Enforces the lazy solution: YAGNI, stdlib before dependencies, shortest working diff. Use for any coding task.

**grilling** — Interrogates your plan in rounds until nothing is silently assumed. Use when you want to stress-test an idea.

**stop-slop** — Strips formulaic AI writing patterns from prose. On by default for every response.

The vendored superpowers pack adds more: brainstorming, test-driven development, systematic debugging, writing plans, and others.

## Usage

```bash
git clone <this repo> my-app
cd my-app
```

Then open the folder with your agent of choice. Pi picks up `.pi/settings.json` and `.agents/`; Claude Code picks up `CLAUDE.md`, `.claude/`, and `.agents/skills/`.

## Editing

The rules live in `AGENTS.md` (and its `CLAUDE.md` copy, kept in sync by hand). Skills live in `.agents/skills/<name>/SKILL.md`; the `.claude/skills/` copies mirror them. Change one, change both.
