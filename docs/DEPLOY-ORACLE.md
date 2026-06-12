# Deploy gratuito — Oracle Cloud Always Free (mahungu.co.mz)

VM grátis **para sempre**. Corre o Laravel completo: web + MySQL + cron + queue worker.
Ficheiros de apoio em [`deploy/`](../deploy/): `setup.sh`, `nginx-mahungu.conf`, `mahungu-worker.service`.

---

## 1. Criar a VM (Always Free)

1. Conta em <https://cloud.oracle.com> (pede cartão **só para verificação** — não cobra na camada Always Free).
2. **Compute → Instances → Create Instance**:
   - **Image:** Canonical **Ubuntu 22.04**.
   - **Shape:** marca *Always Free eligible* → `VM.Standard.A1.Flex` (ARM, escolhe 1–4 OCPU / 6–24 GB) **ou** `VM.Standard.E2.1.Micro` (AMD).
   - **SSH keys:** carrega a tua chave pública (ou gera e guarda a privada).
3. Anota o **IP público** da instância.

## 2. Abrir portas 80/443 (2 camadas!)

A Oracle bloqueia tráfego em **dois** sítios — tens de abrir nos dois:

**a) VCN Security List (rede):** Networking → Virtual Cloud Networks → a tua VCN → Subnet → Security List → **Add Ingress Rules**:
- Source `0.0.0.0/0`, IP Protocol `TCP`, Destination Port `80`
- Source `0.0.0.0/0`, IP Protocol `TCP`, Destination Port `443`

**b) Firewall do SO (iptables):** as imagens Oracle trazem regras iptables que bloqueiam tudo menos SSH. O [`setup.sh`](../deploy/setup.sh) já trata disto (passo 3/8).

## 3. Apontar o domínio

No DNS de `mahungu.co.mz` cria um registo **A** → IP público da VM (e `www` → mesmo IP).
Espera a propagação antes do HTTPS (passo 7).

## 4. Setup automático

SSH para a VM e corre o script (faz pacotes, Composer, clone, Nginx, worker):
```bash
ssh ubuntu@SEU_IP_PUBLICO
sudo apt-get update -y && sudo apt-get install -y git
git clone https://github.com/Adil-l/mahungu.co.mz.git /tmp/mahungu && cd /tmp/mahungu
bash deploy/setup.sh
```
> O script clona para `/var/www/mahungu.co.mz`. Podes correr a partir de `/tmp` na 1ª vez.

## 5. MySQL

```bash
sudo mysql_secure_installation     # define password do root, responde Y ao resto
sudo mysql
```
Dentro do MySQL:
```sql
CREATE DATABASE mahungu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mahungu'@'localhost' IDENTIFIED BY 'ESCOLHE_UMA_PASSWORD_FORTE';
GRANT ALL PRIVILEGES ON mahungu.* TO 'mahungu'@'localhost';
FLUSH PRIVILEGES; EXIT;
```

## 6. Configurar a app

```bash
cd /var/www/mahungu.co.mz
nano .env
```
Preenche pelo menos:
```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://mahungu.co.mz
DB_CONNECTION=mysql
DB_DATABASE=mahungu
DB_USERNAME=mahungu
DB_PASSWORD=ESCOLHE_UMA_PASSWORD_FORTE
```
(MAIL_* com SMTP real para a recuperação de palavra-passe.)

Depois:
```bash
php artisan migrate --force
php artisan db:seed --force        # cria utilizadores + fontes de notícias
php artisan config:cache && php artisan route:cache && php artisan view:cache
sudo systemctl restart mahungu-worker
```

## 7. Cron (scheduler) + HTTPS

**Cron** — aciona posts agendados e RSS a cada minuto:
```bash
sudo crontab -u www-data -e
```
Adiciona:
```
* * * * * php /var/www/mahungu.co.mz/artisan schedule:run >> /dev/null 2>&1
```

**HTTPS grátis (Let's Encrypt):**
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mahungu.co.mz -d www.mahungu.co.mz
```

## 8. Atualizações futuras (re-deploy)

```bash
cd /var/www/mahungu.co.mz
git pull origin main
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
sudo systemctl restart mahungu-worker
```

---

## Checklist
- [ ] VM Always Free criada (Ubuntu 22.04)
- [ ] Ingress 80/443 na VCN **e** iptables (setup.sh)
- [ ] DNS A de mahungu.co.mz → IP da VM
- [ ] `setup.sh` corrido sem erros
- [ ] MySQL criado, `.env` preenchido, `migrate` + `seed` ok
- [ ] `systemctl status mahungu-worker` = active (running)
- [ ] Cron do `www-data` instalado
- [ ] Certbot emitiu o certificado (site abre em https)
- [ ] Login funciona e os agendamentos são processados
