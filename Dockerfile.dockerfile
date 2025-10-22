# Gunakan base image Node.js
FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

# Tentukan direktori kerja di dalam container
WORKDIR /app

# Salin file package.json dan pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Salin semua file proyek ke container
COPY . .

# Build proyek React
RUN pnpm run build

# Jalankan server React (development)
CMD ["pnpm", "start"]

# Port yang akan dibuka
EXPOSE 3000
