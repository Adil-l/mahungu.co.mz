#!/usr/bin/env bash
#
# Põe o site Mahungu no ar no link fixo do ngrok.
# Uso:  ./mostrar-site.sh      (Ctrl+C para parar)
#
set -e
cd "$(dirname "$0")"

DOMAIN=stole-murmuring-hazily.ngrok-free.dev

# 1. Arranca o servidor Laravel na porta 8000 (se ainda não estiver a correr)
if ! lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo ">> A arrancar o Laravel na porta 8000..."
  php artisan serve --port=8000 >/dev/null 2>&1 &
  sleep 2
else
  echo ">> Laravel já está a correr na porta 8000."
fi

# 2. Arranca o agendador (processa posts agendados a cada minuto)
if ! pgrep -f "artisan schedule:work" >/dev/null 2>&1; then
  echo ">> A arrancar o agendador (posts agendados)..."
  php artisan schedule:work >/dev/null 2>&1 &
fi

# 3. Abre o túnel ngrok no domínio fixo
echo ">> Link público: https://$DOMAIN"
echo ">> (Ctrl+C para parar) "
ngrok http 8000 --url=https://$DOMAIN
