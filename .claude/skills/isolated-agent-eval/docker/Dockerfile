FROM node:24-slim AS node

FROM oven/bun:1
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && npm --version
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates chromium fonts-noto-cjk jq ripgrep procps \
  && rm -rf /var/lib/apt/lists/*
ENV BUN_INSTALL=/usr/local
ARG OMP_VERSION
RUN test -n "$OMP_VERSION" && bun add -g @oh-my-pi/pi-coding-agent@${OMP_VERSION} && omp --version
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium CHROME_PATH=/usr/bin/chromium
COPY entrypoint.sh /usr/local/bin/eval-entrypoint
RUN chmod 755 /usr/local/bin/eval-entrypoint
USER bun
WORKDIR /home/bun
ENTRYPOINT ["/usr/local/bin/eval-entrypoint"]
