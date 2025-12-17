# Flask-Admin для Mindful Journal

Простая админка на Flask с авто-рефлексией схемы PostgreSQL.

## Быстрый старт (dev)

```bash
cd admin
python -m venv venv
source venv/bin/activate  # Linux/Mac
# или venv\Scripts\activate  # Windows

pip install -r requirements.txt

# Установи переменные
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="secret123"

python app.py
```

Открой: http://localhost:5000

## Деплой на сервер

```bash
# На сервере
cd /var/www/mindful-journal/admin
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Запуск через PM2
pm2 start "source venv/bin/activate && gunicorn -w 2 -b 127.0.0.1:5000 app:app" --name mindful-admin --cwd /var/www/mindful-journal/admin
```

## Nginx proxy

Добавь в nginx конфиг:

```nginx
location /flask_admin {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## Переменные окружения

- `DATABASE_URL` - PostgreSQL connection string
- `ADMIN_USERNAME` - логин (default: admin)
- `ADMIN_PASSWORD` - пароль (default: mindful123)
- `SECRET_KEY` - секрет Flask
