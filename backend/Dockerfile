FROM python:3.12-alpine
RUN apk add --no-cache build-base postgresql-dev ffmpeg

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app/

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--timeout", "3600", "--graceful-timeout", "3600"]
