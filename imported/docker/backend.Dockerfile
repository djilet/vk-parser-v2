FROM node:22-bookworm

# Install Chromium, Xvfb, and VNC / window manager dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    xvfb \
    x11vnc \
    fluxbox \
    novnc \
    websockify \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DISPLAY=:99 \
    RESOLUTION=1280x1024x24

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Create a startup script
RUN echo '#!/bin/bash\n\
# Start Xvfb\n\
Xvfb :99 -screen 0 ${RESOLUTION} -ac &\n\
\n\
# Start window manager\n\
fluxbox -display :99 &\n\
\n\
# Start VNC server\n\
x11vnc -display :99 -nopw -forever -shared -bg -rfbport 5900\n\
\n\
# Start noVNC (web VNC client) on port 6080\n\
websockify --web /usr/share/novnc/ 6080 localhost:5900 &\n\
\n\
# Start the backend API\n\
npm run dev:server\n\
' > /app/start.sh && chmod +x /app/start.sh

# 3001 is backend API, 6080 is VNC web interface
EXPOSE 3001 6080

CMD ["/app/start.sh"]
