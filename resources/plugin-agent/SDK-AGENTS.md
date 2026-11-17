# Lunaris Plugin SDK

This directory is the packed toolchain. Start with the setup in [README.md](README.md). The full SDK archive includes the quickstart, authoring guide and recipes in `DOCS/`. Work in the generated project and follow its own `AGENTS.md`.

- Use `npm exec -- lunaris-core contracts` at the installed toolchain root to list available SDK packages. Use `npm run core -- contracts` inside a generated project.
- Treat `packages/` and the root lockfile as distribution inputs. Change plugin source, its manifest and its local docs in the project directory.
- Use `lunaris-plugin-development` for implementation and `lunaris-plugin-review` for explicit reviews. If your agent does not load skills, read the relevant `SKILL.md` under `.agents/skills/` directly.
