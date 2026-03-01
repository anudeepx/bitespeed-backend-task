# Bitespeed Backend Task - Identity Reconciliation

## Endpoint

- `POST /identify`
- Content-Type: `application/json`

Request body:

```json
{
  "email": "string (optional)",
  "phoneNumber": "string (optional)"
}
```

Response body:

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["a@x.com"],
    "phoneNumbers": ["123"],
    "secondaryContactIds": [2, 3]
  }
}
```

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Run schema in `db/schema.sql`.
3. Install and run:

```bash
npm install
npm run dev
```

## Run tests

```bash
npm test
```
