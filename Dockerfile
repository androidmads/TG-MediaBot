# Base image
FROM node:18

# Create app folder
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy source
COPY . .

# Expose port
EXPOSE 8080

# Start bot
CMD ["node", "index.js"]
