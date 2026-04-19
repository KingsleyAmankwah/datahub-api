# datahub-api

A NestJS REST API for managing data bundles, orders, payments, fulfillment, and USSD session flows.

## Requirements

- Node.js 20+
- npm 9+
- PostgreSQL (via Prisma 7)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/datahub

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=3600s

PORT=3000
CORS_ORIGIN=http://localhost:3001

# MTN MoMo
MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com
MOMO_COLLECTION_SUBSCRIPTION_KEY=your_subscription_key
MOMO_COLLECTION_API_USER=your_api_user
MOMO_COLLECTION_API_KEY=your_api_key
MOMO_TARGET_ENVIRONMENT=sandbox
MOMO_CALLBACK_URL=https://your-domain.com/api/payments/momo/callback

# Fulfillment
FULFILLMENT_MAX_RETRIES=3
FULFILLMENT_RETRY_DELAY_MS=5000

# Session (optional — defaults to 180s)
SESSION_TTL_SECONDS=180
```

### 3. Set up the database

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Run the application

```bash
# development
npm run start:dev

# production build
npm run build
npm run start:prod
```

### 5. Run with Docker (development)

```bash
docker-compose up -d

# verify containers are healthy
docker-compose ps
```

## Bundle Purchase Flow

### Via USSD
1. User dials the USSD code
2. Navigates menus: select network → select bundle → confirm order
3. Order is created with status `PENDING`
4. MoMo payment prompt sent to user's phone → order → `PAYMENT_INITIATED`
5. MTN posts callback to `/api/payments/momo/callback`
6. On approval → order → `PAYMENT_SUCCESS` → fulfillment triggered
7. RemaData delivers bundle → order → `FULFILLED` → SMS notification sent

### Via Web API
```http
POST /api/orders
Content-Type: application/json

{
  "bundleId": "uuid",
  "recipientPhone": "+233241234567",
  "recipientNetwork": "MTN",
  "payerPhone": "+233241234567"
}
```
Same payment and fulfillment chain follows.

### Order Status Lifecycle
```
PENDING → PAYMENT_INITIATED → PAYMENT_SUCCESS → FULFILLMENT_INITIATED → FULFILLED
                            ↘ PAYMENT_FAILED
                                                                       ↘ FULFILLMENT_FAILED (auto-retried)
```

## Project Structure

```
src/
├── common/
│   ├── filters/          # Global exception filters
│   ├── guards/           # Dev-only guard
│   └── interceptors/     # Global interceptors
├── database/             # Prisma service and database module
└── modules/
    ├── auth/             # JWT authentication, login, token handling
    ├── bundles/          # Data bundle catalog and management
    ├── fulfillment/
    │   └── providers/    # RemaData fulfillment provider
    ├── notifications/    # Notification dispatch (SMS, etc.)
    ├── orders/           # Order creation and lifecycle management
    │   └── dto/          # CreateOrderDto
    ├── payments/
    │   └── providers/    # MTN MoMo payment provider
    ├── session/          # In-memory USSD session management
    ├── users/            # User accounts (auto-created from phone number)
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
| `prisma` + `@prisma/client`             | Database ORM (Prisma 7)                 |
| `@prisma/adapter-pg` + `pg`             | PostgreSQL driver adapter               |
| `bcrypt`                                | Password hashing                        |
| `helmet`                                | HTTP security headers                   |
| `class-validator` + `class-transformer` | DTO validation and transformation       |
| `axios`                                 | HTTP client for external provider calls |
| `uuid`                                  | ID generation                           |

## API Documentation

Swagger UI is available at `http://localhost:3000/docs` in development only.

Not available in production (disabled when `NODE_ENV=production`).

## Dev Payment Testing

A set of dev-only endpoints (blocked in production) for testing the full payment flow without a real MoMo prompt:

| Endpoint | Description |
|---|---|
| `POST /api/dev/payment/initiate` | Create order and initiate MoMo payment |
| `POST /api/dev/payment/simulate-callback` | Simulate MTN MoMo callback (SUCCESSFUL or FAILED) |
| `GET /api/dev/payment/status/:providerRef` | Poll MoMo sandbox for live payment status |
| `GET /api/dev/payment/order/:id` | Full order snapshot with payment, fulfillment and audit trail |
| `GET /api/dev/payment/bundles` | List all bundles for picking a bundleId |

## Deployment (Render)

The app is deployed on [Render](https://render.com) using Docker.

- Migrations run automatically on every deploy via the Dockerfile CMD
- PostgreSQL is provisioned on Render
- USSD sessions are stored in-memory (no Redis required)

### Environment variables to set on Render

```env
NODE_ENV=production
DATABASE_URL=<Render internal database URL>
JWT_SECRET=<secret>
JWT_EXPIRES_IN=3600s
PORT=3000
CORS_ORIGIN=https://your-frontend.vercel.app
MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com
MOMO_COLLECTION_SUBSCRIPTION_KEY=<yours>
MOMO_COLLECTION_API_USER=<yours>
MOMO_COLLECTION_API_KEY=<yours>
MOMO_TARGET_ENVIRONMENT=sandbox
MOMO_CALLBACK_URL=https://<your-render-app>.onrender.com/api/payments/momo/callback
FULFILLMENT_MAX_RETRIES=3
FULFILLMENT_RETRY_DELAY_MS=5000
```

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

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `npm run start:dev`  | Start in watch mode                |
| `npm run build`      | Compile TypeScript                 |
| `npm run start:prod` | Run compiled output                |
| `npm run lint`       | Run ESLint                         |
| `npm run format`     | Run Prettier                       |
