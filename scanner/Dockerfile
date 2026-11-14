# TaxComp malware scanner: official ClamAV (1.4 LTS line) + a dependency-free
# Node HTTP front (server.mjs). The image's /init runs freshclam (signature
# updates) and clamd; the Node server listens on 8080 and talks to clamd on
# 127.0.0.1:3310. ClamAV needs about 1.5 GB of RAM for its signatures.
FROM clamav/clamav:1.4.6

RUN apk add --no-cache nodejs

# Hardening (Phase 2c, N17): treat anything ClamAV cannot fully inspect as not
# clean, so archive bombs, deeply nested or encrypted archives and macro
# documents are refused instead of passing unscanned.
RUN printf '%s\n' \
  'MaxFileSize 16M' 'MaxScanSize 64M' 'StreamMaxLength 16M' \
  'MaxRecursion 10' 'MaxFiles 1000' 'AlertExceedsMax yes' \
  'AlertEncrypted yes' 'AlertEncryptedArchive yes' 'AlertEncryptedDoc yes' \
  'AlertOLE2Macros yes' 'AlertBrokenExecutables yes' 'AlertBrokenMedia yes' \
  >> /etc/clamav/clamd.conf

WORKDIR /app
COPY server.mjs /app/server.mjs

ENV PORT=8080
EXPOSE 8080

# Start ClamAV in the background, then run the HTTP front in the foreground.
# /health returns 503 until clamd has loaded its signatures.
CMD ["/bin/sh", "-c", "/init & exec node /app/server.mjs"]
