#!/usr/bin/env bash
#
# Setup inicial da VM Oracle Cloud (Ubuntu 22.04) para a app Mahungu.
# Correr como utilizador com sudo. Idempotente o suficiente para reexecutar.
#
set -euo pipefail

APP_DIR=/var/www/mahungu.co.mz
REPO=https://github.com/Adil-l/mahungu.co.mz.git
DOMAIN=mahungu.co.mz

echo ">> 1/8 Pacotes base..."
sudo apt-get update -y
sudo apt-get install -y nginx git unzip curl \
    php8.1-fpm php8.1-cli php8.1-mysql php8.1-mbstring php8.1-xml \
    php8.1-curl php8.1-zip php8.1-gd php8.1-bcmath php8.1-intl \
    mysql-server

echo ">> 2/8 Composer..."
if ! command -v composer >/dev/null 2>&1; then
  curl -sS https://getcomposer.org/installer | php
  sudo mv composer.phar /usr/local/bin/composer
fi

echo ">> 3/8 Firewall do SO (Oracle bloqueia por iptables por omissão)..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
sudo netfilter-persistent save || (sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save)

echo ">> 4/8 Clonar o repositório..."
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
else
  git -C "$APP_DIR" pull origin main
fi

echo ">> 5/8 Dependências + .env..."
cd "$APP_DIR"
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
[ -f .env ] || cp .env.example .env
php artisan key:generate --force

echo ">> 6/8 Permissões..."
sudo chown -R www-data:www-data "$APP_DIR/storage" "$APP_DIR/bootstrap/cache"
sudo find "$APP_DIR/storage" -type d -exec chmod 775 {} \;

echo ">> 7/8 Nginx + worker (systemd)..."
sudo cp deploy/nginx-mahungu.conf /etc/nginx/sites-available/mahungu
sudo ln -sf /etc/nginx/sites-available/mahungu /etc/nginx/sites-enabled/mahungu
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo cp deploy/mahungu-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mahungu-worker

echo ">> 8/8 Pronto. Falta fazer (ver docs/DEPLOY-ORACLE.md):"
echo "   - configurar MySQL (CREATE DATABASE + utilizador) e editar .env (DB_*)"
echo "   - php artisan migrate --force && php artisan db:seed --force"
echo "   - cron do scheduler  +  certbot (HTTPS) para $DOMAIN"
