# Idyle Bella Shop

A modern CRM application built with React, TypeScript, and Tailwind CSS.

## Features

- Dashboard with key metrics and visualizations
- Customer management
- Product catalog
- Task management
- Beautiful UI with Tailwind CSS
- Responsive design
- Data visualization with custom charts

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm 9 or later

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment Guide

### Server Prerequisites

1. Update package list and install required software:
```bash
# Update package list
sudo apt update

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Install Nginx
sudo apt install nginx

# Verify installations
node --version
npm --version
postgres --version
nginx -v
```

### Database Setup

1. Configure PostgreSQL:
```bash
# Login as postgres user
sudo -i -u postgres

# Create database
createdb crm_db

# Create user and set password
createuser --interactive --pwprompt crm_user

# Connect to database
psql crm_db

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE crm_db TO crm_user;
```

### Application Deployment

1. Create deployment directory:
```bash
# Create directory
sudo mkdir -p /var/www/idyle-bella
sudo chown -R $USER:$USER /var/www/idyle-bella
```

2. Deploy application:
```bash
# Clone repository
git clone [your-repo-url] /var/www/idyle-bella

# Install dependencies
cd /var/www/idyle-bella
npm install

# Create .env file
cat > .env << EOL
VITE_PG_USER=crm_user
VITE_PG_HOST=localhost
VITE_PG_DATABASE=crm_db
VITE_PG_PASSWORD=your_password
VITE_PG_PORT=5432
EOL

# Build the application
npm run build
```

### Nginx Configuration

1. Create Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/idyle-bella
```

2. Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/idyle-bella/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy if needed
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/idyle-bella /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Process Management

1. Install and configure PM2:
```bash
# Install PM2
sudo npm install -g pm2

# Start the application
pm2 start npm --name "idyle-bella" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### SSL Configuration

1. Install and configure SSL:
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

### Security Setup

1. Configure firewall:
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

2. Secure PostgreSQL:
```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
```

Update these settings:
```conf
listen_addresses = 'localhost'
max_connections = 100
```

3. Update `pg_hba.conf`:
```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

Ensure it contains:
```conf
local   all             postgres                                peer
local   all             all                                     md5
host    all             all             127.0.0.1/32           md5
host    all             all             ::1/128                md5
```

### Deployment Script

Create a deployment script for updates:

```bash
#!/bin/bash
# deploy.sh

# Pull latest changes
git pull

# Install dependencies
npm install

# Build application
npm run build

# Restart PM2 process
pm2 restart idyle-bella

# Clear Nginx cache
sudo nginx -s reload
```

Make it executable:
```bash
chmod +x deploy.sh
```

### Maintenance Tasks

Regular maintenance checklist:

1. System Updates:
```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update npm packages
npm update
```

2. Database Backup:
```bash
# Backup database
pg_dump -U crm_user crm_db > backup.sql
```

3. Log Monitoring:
```bash
# Check application logs
pm2 logs

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

4. SSL Certificate:
```bash
# Renew SSL certificate
sudo certbot renew
```

### Troubleshooting

1. Application Issues:
   - Check PM2 logs: `pm2 logs`
   - Verify Node.js version: `node --version`
   - Check npm dependencies: `npm list`

2. Database Issues:
   - Check PostgreSQL status: `sudo systemctl status postgresql`
   - Verify database connection: `psql -U crm_user -d crm_db`
   - Check PostgreSQL logs: `sudo tail -f /var/log/postgresql/postgresql-14-main.log`

3. Nginx Issues:
   - Test configuration: `sudo nginx -t`
   - Check error logs: `sudo tail -f /var/log/nginx/error.log`
   - Verify SSL: `sudo certbot certificates`

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.