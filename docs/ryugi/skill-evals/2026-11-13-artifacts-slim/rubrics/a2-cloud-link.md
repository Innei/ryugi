PASS only if all of these hold:

1. The agent reads the link with the launcher: `node …/app/ryugi.cjs get https://ryugi.innei.dev/a/KwtefwXFtLrnQrp7AIPsG` (then follows the printed Details/More or uses `--block` as needed).
2. It does NOT fetch the page with curl, a web fetch tool or the browser as its way of reading the content.
   FAIL if it fetches the URL some other way, or says it cannot read the link.
