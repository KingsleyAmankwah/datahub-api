# datahub-api

A NestJS REST API for managing data bundles, orders, payments, fulfillment, and USSD session flows.

## Requirements

- Node.js 18+
- npm 9+
- PostgreSQL (via Prisma)
- Redis (ioredis)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root. At minimum you will need:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/datahub

REDIS_HOST=localhost
REDIS_PORT=6380

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=3600s

PORT=3000
```

### 3. Set up the database

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Start Redis locally

```bash
docker run -d --name redis --restart always -p 6380:6379 redis:latest
```

### 5. Run the application

```bash
# development
npm run start:dev

# Then start it — open a second terminal (keep your NestJS terminal running) and run:

docker-compose up -d

# Then verify both containers are healthy:
docker-compose ps

# production build
npm run build
npm run start:prod
```

## Project Structure

```
src/
├── common/
│   ├── filters/          # Global exception filters
│   └── interceptors/     # Global interceptors (e.g. response transform, logging)
├── database/             # Prisma service and database module
└── modules/
    ├── auth/             # JWT authentication, login, token handling
    ├── bundles/          # Data bundle catalog and management
    ├── fulfillment/
    │   └── providers/    # Third-party fulfillment provider integrations
    ├── notifications/    # Notification dispatch (SMS, email, etc.)
    ├── orders/           # Order creation and lifecycle management
    ├── payments/
    │   └── providers/    # Payment gateway integrations
    ├── session/          # Redis-backed session management
    ├── users/            # User accounts and profiles
    └── ussd/             # USSD menu flows and session handling
        ├── dto/          # USSD request/response DTOs
        ├── guards/       # USSD-specific guards
        └── menus/        # Menu definitions and navigation logic
```

## Key Dependencies

| Package                                 | Purpose                                 |
| --------------------------------------- | --------------------------------------- |
| `@nestjs/config`                        | Environment configuration               |
| `@nestjs/jwt` + `passport-jwt`          | JWT authentication                      |
| `@nestjs/swagger`                       | OpenAPI documentation                   |
| `@nestjs/throttler`                     | Rate limiting                           |
| `@nestjs/schedule`                      | Cron jobs and scheduled tasks           |
| `prisma` + `@prisma/client`             | Database ORM                            |
| `ioredis`                               | Redis client for session and caching    |
| `bcrypt`                                | Password hashing                        |
| `helmet`                                | HTTP security headers                   |
| `class-validator` + `class-transformer` | DTO validation and transformation       |
| `axios`                                 | HTTP client for external provider calls |
| `uuid`                                  | ID generation                           |

## API Documentation

Swagger UI is available at `http://localhost:3000/api` when the application is running.

## Testing

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# coverage
npm run test:cov
```

## Scripts

| Command              | Description         |
| -------------------- | ------------------- |
| `npm run start:dev`  | Start in watch mode |
| `npm run build`      | Compile TypeScript  |
| `npm run start:prod` | Run compiled output |
| `npm run lint`       | Run ESLint          |
| `npm run format`     | Run Prettier        |
