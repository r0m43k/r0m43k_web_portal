FROM nginx:1.25-alpine

COPY default.http.conf /etc/nginx/confs/default.http.conf
COPY default.https.conf /etc/nginx/confs/default.https.conf
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
