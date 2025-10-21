# Gunakan base image Node.js
FROM node:18-alpine

# Tentukan direktori kerja di dalam container
WORKDIR /app

# Salin file package.json dan package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Salin semua file proyek ke container
COPY . .

# Build proyek React
RUN npm run build

# Jalankan server React (development)
CMD ["npm", "start"]

# Port yang akan dibuka
EXPOSE 3000
