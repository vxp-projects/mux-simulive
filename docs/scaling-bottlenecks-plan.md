# Action Plan: Addressing Server Bottlenecks for 10k Viewers

## Overview

This plan addresses the four critical bottlenecks preventing a 2-core server from handling 10,000 concurrent viewers.

---

## Bottleneck 1: Node.js Single-Threaded Limitation

### Problem
Node.js runs JavaScript in a single thread. Even with 2 cores, only one handles request processing while the other sits idle for JS execution.

### Solution: Cluster Mode + Standalone Build

**Step 1.1: Enable Next.js Standalone Output**

Modify `next.config.ts`:
```typescript
const nextConfig = {
  output: 'standalone',
  // ... existing config
};
```

This creates a minimal production build that can be clustered.

**Step 1.2: Create Cluster Entry Point**

Create `server.js` that spawns workers per CPU core:
```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Primary ${process.pid} spawning ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died, respawning...`);
    cluster.fork();
  });
} else {
  require('./.next/standalone/server.js');
}
```

**Step 1.3: Update Dockerfile**

```dockerfile
# Use standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./

CMD ["node", "server.js"]
```

**Expected Impact**: 2x throughput (utilizing both cores)

---

## Bottleneck 2: Connection Overhead

### Problem
Each viewer maintains an HTTP connection. 10,000 connections = significant kernel overhead, file descriptor exhaustion, and memory per socket.

### Solution: Nginx Reverse Proxy + HTTP/2

**Step 2.1: Add Nginx to Docker Compose**

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - app
    deploy:
      resources:
        limits:
          memory: 128M
```

**Step 2.2: Create Optimized Nginx Config**

`nginx.conf`:
```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 16384;
    use epoll;
    multi_accept on;
}

http {
    # Connection pooling to upstream
    upstream nextjs {
        server app:3000;
        keepalive 256;
        keepalive_requests 10000;
        keepalive_timeout 60s;
    }

    # HTTP/2 for multiplexing (many requests over fewer connections)
    server {
        listen 443 ssl http2;

        ssl_certificate /etc/nginx/certs/cert.pem;
        ssl_certificate_key /etc/nginx/certs/key.pem;

        # SSL session caching (reduces handshake overhead)
        ssl_session_cache shared:SSL:50m;
        ssl_session_timeout 1d;
        ssl_session_tickets off;

        # Compression
        gzip on;
        gzip_types text/plain application/json application/javascript text/css;

        # Proxy settings
        location / {
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Buffering for better performance
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 16k;
        }

        # Cache static assets aggressively
        location /_next/static/ {
            proxy_pass http://nextjs;
            proxy_cache_valid 200 365d;
            add_header Cache-Control "public, immutable, max-age=31536000";
        }
    }
}
```

**Step 2.3: Increase System File Descriptors**

Add to Dockerfile or host system:
```bash
# In docker-compose.yml under app service:
ulimits:
  nofile:
    soft: 65535
    hard: 65535
```

**Expected Impact**:
- HTTP/2 multiplexing: 10 connections per viewer → 1 connection
- Connection pooling: Node.js sees ~256 connections instead of 10,000
- Net result: ~90% reduction in connection overhead

---

## Bottleneck 3: SSL/TLS Handshake CPU Load

### Problem
Each new HTTPS connection requires an SSL handshake (CPU-intensive RSA/ECDSA operations). 10,000 viewers = potentially thousands of handshakes per minute.

### Solution: Cloudflare (Free Tier) or SSL Termination at Nginx

**Option A: Cloudflare (Recommended - Zero Infrastructure)**

1. Add domain to Cloudflare (free tier)
2. Enable "Full (Strict)" SSL mode
3. Enable these settings:
   - HTTP/2: On
   - HTTP/3 (QUIC): On
   - Always Use HTTPS: On
   - Auto Minify: JS, CSS, HTML
   - Brotli: On

Benefits:
- SSL terminated at 300+ edge locations worldwide
- Automatic DDoS protection
- Free SSL certificate
- Caches static assets at edge

**Option B: Optimize Nginx SSL (If Self-Hosting)**

Add to nginx.conf:
```nginx
# Use modern, fast ciphers
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
ssl_prefer_server_ciphers off;

# OCSP Stapling (faster certificate validation)
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;

# Session resumption (skip full handshake for returning visitors)
ssl_session_cache shared:SSL:50m;
ssl_session_timeout 1d;
ssl_session_tickets off;

# Early data for TLS 1.3 (0-RTT)
ssl_early_data on;
```

**Expected Impact**:
- Cloudflare: Near-zero SSL CPU on origin server
- Self-hosted optimization: 50-70% reduction in SSL CPU

---

## Bottleneck 4: Memory Consumption

### Problem
Each connection and request consumes memory:
- HTTP connection: ~10-20KB
- Request processing: ~50-100KB during handling
- V8 heap for JavaScript: Grows with traffic
- 10,000 viewers could need 2-4GB+ RAM

### Solution: Memory Optimization + Limits

**Step 4.1: Configure Node.js Memory Limits**

In Dockerfile or startup:
```dockerfile
# Limit heap to prevent runaway memory (adjust based on available RAM)
ENV NODE_OPTIONS="--max-old-space-size=1024"
```

**Step 4.2: Enable Response Streaming**

Already using React Server Components, which stream by default. Verify by checking for `loading.tsx` files or Suspense boundaries.

**Step 4.3: Optimize Docker Memory**

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 1.5G
        reservations:
          memory: 512M
```

**Step 4.4: Add Memory Monitoring Endpoint**

Create `src/app/api/metrics/route.ts`:
```typescript
import { NextResponse } from "next/server";

export async function GET() {
  const usage = process.memoryUsage();
  return NextResponse.json({
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + "MB",
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + "MB",
    rss: Math.round(usage.rss / 1024 / 1024) + "MB",
    external: Math.round(usage.external / 1024 / 1024) + "MB",
  });
}
```

**Step 4.5: Reduce Per-Request Memory**

Move expensive computations to build time or cache:
- Already done: ISR caching (pages rebuilt every 30-60s, not per request)
- Already done: Token caching in Redis
- Already done: Time offset calculation on client

**Expected Impact**:
- Predictable memory usage with caps
- Prevention of OOM crashes
- ~50% reduction in peak memory through streaming + caching

---

## Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | Add Cloudflare | 30 min | High (SSL + CDN + caching) |
| 2 | Nginx reverse proxy | 2 hours | High (connection pooling, HTTP/2) |
| 3 | Cluster mode | 1 hour | Medium (2x CPU utilization) |
| 4 | Memory optimization | 1 hour | Medium (stability) |

---

## Expected Results After Implementation

| Metric | Before | After |
|--------|--------|-------|
| SSL handshakes on server | 10,000/min | ~0 (Cloudflare) |
| Active connections to Node.js | 10,000 | ~256 (pooled) |
| CPU cores utilized | 1 | 2 |
| Memory per 1k viewers | ~400MB | ~100MB |
| **Realistic capacity** | **500-1,000** | **10,000+** |

---

## Quick Win: Vercel Deployment (Alternative)

If infrastructure management isn't desired, deploy to Vercel:

```bash
npm i -g vercel
vercel
```

Vercel automatically provides:
- Edge network (similar to Cloudflare)
- Auto-scaling serverless functions
- HTTP/2 and HTTP/3
- SSL at edge
- Zero configuration clustering

This handles all 4 bottlenecks with no infrastructure changes, but adds hosting costs at scale.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `next.config.ts` | Add `output: 'standalone'` |
| `server.js` | Create cluster entry point |
| `nginx.conf` | Create with optimized config |
| `docker-compose.yml` | Add nginx service, update app config |
| `Dockerfile` | Update for standalone + cluster |
| `src/app/api/metrics/route.ts` | Create monitoring endpoint |

Ready to implement?
