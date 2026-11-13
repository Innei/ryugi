# Html writing moved into the CLI

The installed artifacts CLI owns the complete writing description and examples.
Use the normal `start --artifact html/<id>` response for new content, or retrieve
the same description without starting a server:

```bash
node app/ryugi.cjs start --artifact html/topic --help
```

Resolve app/ relative to this skill's directory. Reuse the actual project and
artifact for your task. Follow SKILL.md for type selection and judgment.
