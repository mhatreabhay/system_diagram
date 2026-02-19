FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY app/nginx.conf /etc/nginx/conf.d/default.conf

# Copy static site files
COPY app/index.html /usr/share/nginx/html/
COPY app/css/ /usr/share/nginx/html/css/
COPY app/js/ /usr/share/nginx/html/js/
COPY app/icons/ /usr/share/nginx/html/icons/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
