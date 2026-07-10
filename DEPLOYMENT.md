# Deployment Guide - Investment Management System

## 🚀 Deployment Options

### Option 1: Docker Compose (Recommended for Quick Setup)

```bash
# Clone or navigate to project
cd ims-project

# Build and start services
docker-compose up --build -d

# Verify services
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Option 2: Manual Deployment

#### Backend Deployment

```bash
# 1. Server Setup
ssh user@your-server
cd /opt/ims-project/backend

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
nano .env  # Edit with production values

# 5. Initialize database
alembic upgrade head

# 6. Run with Gunicorn
gunicorn app.main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# Or use systemd service
sudo cp deployment/ims-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ims-backend
sudo systemctl start ims-backend
```

#### Frontend Deployment

```bash
# 1. Build for production
npm run build

# 2. Deploy to web server
# Option A: Static hosting (Nginx, Apache, S3, Vercel, etc.)
cp -r dist/* /var/www/ims-frontend/

# Option B: Using PM2
npm install -g pm2
pm2 start "npm run preview" --name "ims-frontend"
pm2 save
pm2 startup
```

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```yaml
# docker-compose.yml already configured
# Services: PostgreSQL, Backend, Frontend
# Just run:
docker-compose up --build
```

### Building Custom Docker Images

```bash
# Build backend image
cd backend
docker build -t ims-backend:latest .
docker run -e DATABASE_URL=postgresql://... ims-backend:latest

# Build frontend image
cd frontend
docker build -t ims-frontend:latest .
docker run -p 80:5173 ims-frontend:latest
```

## ☁️ Cloud Deployment

### AWS Deployment

**Using Elastic Beanstalk:**
```bash
# Install EB CLI
pip install awsebcli

# Initialize application
eb init -p python-3.11 ims-backend

# Create environment
eb create ims-production

# Deploy
eb deploy
```

**Using RDS for Database:**
- Create RDS PostgreSQL instance
- Update DATABASE_URL in .env
- Run migrations: `eb ssh` then `alembic upgrade head`

### Heroku Deployment

```bash
# Backend
cd backend
heroku create ims-api
heroku addons:create heroku-postgresql:standard-0
git push heroku main
heroku run alembic upgrade head

# Frontend
cd frontend
npm install -g heroku
heroku create ims-app
git subtree push --prefix frontend heroku main
```

### Google Cloud Run

```bash
# Backend
gcloud builds submit --tag gcr.io/PROJECT_ID/ims-backend
gcloud run deploy ims-backend --image gcr.io/PROJECT_ID/ims-backend

# Frontend
gcloud builds submit --tag gcr.io/PROJECT_ID/ims-frontend --source ./frontend
gcloud run deploy ims-frontend --image gcr.io/PROJECT_ID/ims-frontend
```

## 🔒 Production Configuration

### Environment Variables

```bash
# Backend
ENVIRONMENT=production
SECRET_KEY=<generate-secure-key>
DATABASE_URL=postgresql://user:pass@host:port/db
ALLOWED_ORIGINS=https://yourdomain.com
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Frontend
VITE_API_URL=https://api.yourdomain.com/api/v1
VITE_APP_NAME=Investment Management System
```

### Database Backups

```bash
# PostgreSQL backup
pg_dump ims_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backup (cron)
0 2 * * * pg_dump ims_db | gzip > /backups/ims_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz

# S3 backup script
aws s3 cp backup.sql.gz s3://bucket-name/backups/
```

## 🌐 Reverse Proxy Configuration

### Nginx Configuration

```nginx
upstream backend {
    server 127.0.0.1:8000;
}

upstream frontend {
    server 127.0.0.1:5173;
}

server {
    listen 80;
    server_name yourdomain.com;
    
    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # API
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Apache Configuration

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    
    # Frontend
    <Location />
        ProxyPass http://127.0.0.1:5173/
        ProxyPassReverse http://127.0.0.1:5173/
    </Location>
    
    # API
    <Location /api/>
        ProxyPass http://127.0.0.1:8000/
        ProxyPassReverse http://127.0.0.1:8000/
    </Location>
</VirtualHost>
```

## 🔐 SSL/TLS Certificate

```bash
# Using Let's Encrypt with Certbot
certbot certonly --nginx -d yourdomain.com
certbot renew --dry-run  # Test auto-renewal
```

## 📊 Monitoring & Logging

### Backend Logging

```python
# Configure in main.py
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()
    ]
)
```

### Frontend Error Tracking

```typescript
// Add error tracking service
import * as Sentry from "@sentry/react";

Sentry.init({
    dsn: "your-sentry-dsn",
    environment: "production",
    tracesSampleRate: 0.1,
});
```

### Health Checks

```bash
# Backend health check endpoint
curl http://localhost:8000/health

# Frontend health check
curl http://localhost:5173/
```

## 📈 Performance Tuning

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_capital_calls_status ON capital_calls(status);
CREATE INDEX idx_capital_calls_due_date ON capital_calls(due_date);
CREATE INDEX idx_distributions_fund_id ON distributions(fund_id);
CREATE INDEX idx_funds_is_active ON funds(is_active);

-- Analyze tables
ANALYZE;
```

### API Response Caching

```python
from fastapi_cache2 import FastAPICache2
from fastapi_cache2.backends.redis import RedisBackend

@app.get("/api/v1/dashboard/summary")
@cached(expire=300)  # Cache for 5 minutes
async def dashboard_summary():
    # Expensive calculation
    pass
```

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: |
          cd backend && pytest
          cd ../frontend && npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to production
        run: |
          # Deploy commands here
```

## 📋 Pre-deployment Checklist

- [ ] All environment variables configured
- [ ] Database backups enabled
- [ ] SSL certificate installed
- [ ] Static files optimized
- [ ] Logging configured
- [ ] Monitoring tools set up
- [ ] Firewall rules configured
- [ ] Database indexed
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Secrets not in code
- [ ] Load tested

## 🚨 Rollback Procedure

```bash
# If deployment fails
git revert <commit-hash>
git push
docker-compose down
docker-compose up --build

# Database rollback
alembic downgrade -1
# Or restore from backup
pg_restore -d ims_db backup.sql
```

## 🎯 Post-deployment Steps

1. Verify all services are running
2. Test critical workflows
3. Monitor error logs
4. Check database performance
5. Validate user access
6. Update DNS records
7. Notify stakeholders

## 📞 Support

For deployment issues:
1. Check logs: `docker-compose logs`
2. Verify connectivity: `telnet host port`
3. Test API: `curl http://localhost:8000/health`
4. Check database: `psql ims_db -c "SELECT 1"`

---

**Deployment Version**: 1.0  
**Last Updated**: May 2024
