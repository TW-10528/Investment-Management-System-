# Docker Setup Guide — Thirdwave IMS

## Overview

The application is now fully containerized with Docker:
- **Backend**: Hono/Node.js (runs on port 8004 internally)
- **Frontend**: React/Vite + Nginx (runs on port 80)
- **Database**: PostgreSQL 16 Alpine (runs on port 5432 internally, 6000 exposed to host)

All services communicate via an internal Docker network.

---

## Quick Start

### 1. Build and Run (Development)
```bash
docker-compose up --build
```

This will:
1. Build the backend container
2. Build the frontend container
3. Start PostgreSQL database
4. Start backend service
5. Start frontend service (with Nginx reverse proxy)

### 2. Access the Application
- **Frontend**: http://localhost (port 80)
- **Backend API**: http://localhost:8004
- **Database**: localhost:6000 (from host machine)

### 3. Run in Background
```bash
docker-compose up -d
```

View logs:
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db
```

---

## Database Migrations & Seeding

The database runs automatically, but you need to run migrations:

### Option A: From Host (if PostgreSQL client installed)
```bash
cd backend
npm run db:migrate
npm run db:seed
```

### Option B: Inside the Container
```bash
docker-compose exec backend npm run db:migrate
docker-compose exec backend npm run db:seed
```

---

## Environment Variables

### Development (Default)
The `docker-compose.yml` includes sensible defaults for local development.

### Production
Copy `.env.docker` to `.env.production`:
```bash
cp .env.docker .env.production
# Edit .env.production with your production values
docker-compose --env-file .env.production up -d
```

**IMPORTANT**: Set these in production:
- `SECRET_KEY` - Generate a strong JWT secret
- `SMTP_USER` / `SMTP_PASSWORD` - Configure email sending
- `AI_API_KEY` - Thirdwave AI Gateway key
- `ALLOWED_ORIGINS` - Your production domain

---

## Common Commands

### Start Services
```bash
docker-compose up                 # Foreground
docker-compose up -d              # Background
```

### Stop Services
```bash
docker-compose down               # Stop and remove containers
docker-compose down -v            # Also remove volumes (WARNING: deletes DB data)
```

### View Logs
```bash
docker-compose logs -f            # All services
docker-compose logs -f backend    # Backend only
docker-compose logs -f frontend   # Frontend only
docker-compose logs -f db         # Database only
```

### Run Commands in Containers
```bash
# Backend
docker-compose exec backend npm run db:migrate
docker-compose exec backend npm run db:seed
docker-compose exec backend npm run build

# Database
docker-compose exec db psql -U ims_user -d ims_db
```

### Rebuild Images
```bash
docker-compose build --no-cache
```

### Remove Everything
```bash
docker-compose down -v            # Stop services, remove containers + volumes
docker system prune -a            # Remove unused Docker objects
```

---

## File Structure

```
invfin/
├── docker-compose.yml            ← Main orchestration
├── .env.docker                   ← Production env template
├── DOCKER_SETUP.md              ← This file
│
├── backend/
│   ├── Dockerfile               ← Backend container definition
│   ├── .dockerignore            ← Files to exclude from build context
│   ├── src/                     ← TypeScript source
│   ├── dist/                    ← Compiled JavaScript (generated)
│   ├── uploads/                 ← Volume mount for file uploads
│   └── prisma/                  ← Database schema
│
├── frontend/
│   ├── Dockerfile               ← Frontend container definition
│   ├── .dockerignore            ← Files to exclude from build context
│   ├── nginx.conf               ← Nginx configuration (reverse proxy)
│   ├── src/                     ← React source
│   └── dist/                    ← Built static files (generated)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Compose Network                │
│                    (ims-network bridge)                 │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │ Frontend (Nginx) │  │  Backend (Hono)  │             │
│  │  Port 80 (HTTP)  │  │ Port 8004 (API)  │             │
│  │                  │  │                  │             │
│  │ - SPA routing    │  │ - REST API       │             │
│  │ - Static assets  │  │ - Database ops   │             │
│  │ - API proxy      ├─→│ - File upload    │             │
│  │   (/api → :8004) │  │ - AI extraction  │             │
│  └──────────────────┘  └──────────┬───────┘             │
│         ↑                         │                      │
│     Port 80                       │ connects to          │
│    (exposed)                      ↓                      │
│                          ┌──────────────────┐            │
│                          │    PostgreSQL    │            │
│                          │ Port 5432 (int)  │            │
│                          │ Port 6000 (ext)  │            │
│                          └──────────────────┘            │
│                                                           │
└─────────────────────────────────────────────────────────┘
         ↓ (Host Machine)
    http://localhost
```

---

## Production Deployment (172.16.5.105)

### SSH into Server
```bash
ssh user@172.16.5.105
cd /opt/invfin  # or your app directory
```

### Deploy
```bash
git pull origin main
cp .env.docker .env.production
# Edit .env.production with production values
docker-compose --env-file .env.production up -d --build
```

### Monitor
```bash
docker-compose logs -f
```

### Backup Database
```bash
docker-compose exec db pg_dump -U ims_user ims_db > backup.sql
```

### Restore Database
```bash
docker-compose exec -T db psql -U ims_user ims_db < backup.sql
```

---

## Troubleshooting

### Backend can't connect to database
```bash
# Check database is healthy
docker-compose ps

# View db logs
docker-compose logs db

# Verify connection from backend
docker-compose exec backend curl http://db:5432
```

### Frontend showing blank page
```bash
# Check Nginx is running
docker-compose exec frontend ps aux | grep nginx

# View frontend logs
docker-compose logs frontend

# Check API connectivity from frontend container
docker-compose exec frontend curl http://backend:8004/health
```

### Permissions error on uploads
```bash
# Ensure uploads directory exists and is writable
docker-compose exec backend mkdir -p ./uploads
docker-compose exec backend chmod 755 ./uploads
```

### Port already in use
If port 80, 8004, or 6000 are already in use:

Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:80"      # Use 8080 instead of 80
  - "8005:8004"    # Use 8005 instead of 8004
  - "6001:5432"    # Use 6001 instead of 6000
```

### Rebuild after code changes
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up
```

---

## Health Checks

All services have health checks configured:

- **Backend**: `curl http://localhost:8004/health`
- **Frontend**: `wget http://localhost/`
- **Database**: `pg_isready -U ims_user -d ims_db`

Check status:
```bash
docker-compose ps
```

---

## Notes

- **Volume Persistence**: PostgreSQL data is stored in `ims_pgdata` volume (survives container restarts)
- **File Uploads**: Backend uploads are mounted to `./backend/uploads/` on host
- **Logs**: Use `docker-compose logs` to view all output
- **Networking**: Services communicate via Docker DNS (service names resolve internally)
- **Reverse Proxy**: Nginx forwards `/api/*` requests to backend container
- **Multi-stage Builds**: Both Dockerfiles use multi-stage builds for smaller final images
