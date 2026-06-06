# Use Node image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Expose Vite port
EXPOSE 5173

# Run dev server
CMD ["npm", "run", "dev", "--", "--host"]