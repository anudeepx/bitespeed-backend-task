# Bitespeed Backend Task - Identity Reconciliation

## Deployed links:
 - On Render: https://bitespeed-backend-task-bv30.onrender.com/identify
 - On AWS: http://13.62.103.167/identify

## Endpoint

- `POST /identify`
- Content-Type: `application/json`

Request body:
  At least one of the following fields must be provided:
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

```bash
cp .env.example .env
```
2. Run schema in `db/schema.sql`.
```bash 
psql -d your_database_name -f db/schema.sql
```
3. Install and run:
```bash
npm install
npm run dev
```

## Run tests

```bash
npm test
```
