# ryugi-artifacts

Server, viewer and CLI for [Ryugi](https://github.com/Innei/ryugi)'s artifacts:
artboards, documents and HTML pages that a coding agent writes into a project
and you open in the browser.

```bash
npx ryugi-artifacts         # open the library of the current project
npx ryugi-artifacts monitor # list running project servers
```

The server reads `.ryugi/artifacts/` in the selected project. Ryugi's skills
start it for you; this package also runs standalone. Node.js is required.

Full command reference: [docs/artifacts-cli.md](https://github.com/Innei/ryugi/blob/main/docs/artifacts-cli.md).
Project overview and install: [Innei/ryugi](https://github.com/Innei/ryugi).

## License

AGPL-3.0-only — see [LICENSE](LICENSE). The corresponding source for this
package is the `artifacts/` directory of
[github.com/Innei/ryugi](https://github.com/Innei/ryugi/tree/main/artifacts);
every release is tagged `v<version>`.

Ryugi's skills and harness integrations are MIT; the artifacts application is
AGPL-3.0-only. Running a modified version as a network service means offering
its source to that service's users (AGPL section 13).
