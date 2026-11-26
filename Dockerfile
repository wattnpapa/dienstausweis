# Dienstausweis: App und Signierdienst als ein Container.
#
# Zwei Stufen: Die erste baut App (dist-web) und Dienst (dist-dienst/dienst.mjs,
# von esbuild samt node-forge gebündelt). Die zweite enthält nur Node und diese
# beiden Ordner, kein node_modules. Schlüssel und Zertifikate gehören nicht ins
# Bild; sie kommen zur Laufzeit als schreibgeschütztes Volume nach /geheim.

FROM node:24-bookworm-slim AS bau
WORKDIR /quelle
# git: vite.config.ts schreibt den Commit in die angezeigte Fassung.
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    DA_HOST=0.0.0.0 \
    DA_PORT=8080 \
    DA_WEB=/app/dist-web
WORKDIR /app
COPY --from=bau /quelle/dist-web ./dist-web
COPY --from=bau /quelle/dist-dienst ./dist-dienst
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.DA_PORT+'/gesundheit').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist-dienst/dienst.mjs"]
