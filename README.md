# Suppliers Service

Manages suppliers, invoices, and supplier products for Maingoo. Listens to `documents.analyzed` events from documents-analyzer to auto-create invoice records.

## Setup

```bash
npm install
cp .env.example .env
npx prisma:generate
npx prisma:migrate
npm run start:dev
```

Ensure a PostgreSQL instance is available and `DATABASE_URL` points to it (port 5436).

## Environment variables

- `PORT`: optional, used for local debugging.
- `NATS_SERVERS`: comma-separated list of NATS URLs.
- `DATABASE_URL`: PostgreSQL connection string.

## Prisma schema

**Entities:**

- `Supplier { id, name, cifNif, address, phoneNumber, commercialName, commercialPhoneNumber, deliveryDays, minPriceDelivery, sanitaryRegistrationNumber, createdAt, updatedAt }`
- `Invoice { id, restaurantId, supplierId, type, invoiceNumber, imageUrl, amount, date, createdAt }`
- `InvoiceLine { id, invoiceId, suppliersProductId, quantity, unitPrice, price, tax, createdAt }`
- `SupplierProduct { id, productReference, masterProductId, supplierId, createdAt, updatedAt }`

Run migrations with `npm prisma:migrate`.

## NATS Contracts

### Request/Reply

| Subject                  | Payload                                     | Response           |
| ------------------------ | ------------------------------------------- | ------------------ |
| `suppliers.create`       | `{ name, cifNif, address?, ... }`           | `{ supplier }`     |
| `suppliers.getById`      | `{ id }`                                    | `{ supplier }`     |
| `suppliers.list`         | `void`                                      | `{ suppliers[] }`  |
| `invoices.create`        | `{ restaurantId, supplierId, amount, ... }` | `{ invoice }`      |
| `invoices.getById`       | `{ id }`                                    | `{ invoice }`      |
| `invoices.list`          | `{ restaurantId? }`                         | `{ invoices[] }`   |
| `suppliers.health.check` | `void`                                      | `{ status: 'ok' }` |

### Events Consumed

| Event                       | Payload                                         | Action                                    |
| --------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `documents.analyzed`        | `{ documentId, businessId, extraction: {...} }` | Auto-create Supplier + Invoice with lines |
| `documents.analysis.failed` | `{ documentId, reason }`                        | Log warning                               |

### Events Published

| Event                        | Payload                                                      | Description                        |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| `suppliers.supplier.created` | `{ supplierId, name, cifNif, createdAt }`                    | Emitted when a supplier is created |
| `suppliers.invoice.created`  | `{ invoiceId, restaurantId, supplierId, amount, createdAt }` | Emitted when an invoice is created |

## Auto-create Flow

1. **Documents-Analyzer** extracts invoice data with OpenAI
2. **Emits event**: `documents.analyzed` with supplier info and line items
3. **Suppliers Service** listens to the event
4. **Auto-creates**:
   - Supplier (if doesn't exist, based on CIF/NIF)
   - Invoice linked to the supplier
   - Invoice lines
5. **Emits**: `suppliers.invoice.created`

## Testing

```bash
# Via NATS (using nats CLI or from Gateway)
# Create supplier manually
nats req suppliers.create '{"name":"Proveedor Test","cifNif":"B12345678"}'

# List suppliers
nats req suppliers.list '{}'

# Create invoice
nats req invoices.create '{"restaurantId":"rest-1","supplierId":"<id>","amount":1500.50,"date":"2024-01-15"}'
```

## Architecture Notes

- ✅ **Event-driven**: Listens to documents-analyzer events
- ✅ **Autonomous**: Can create suppliers automatically
- ✅ **Idempotent**: Won't duplicate suppliers (checks CIF/NIF)
- ✅ **Scalable**: Independent database and service instance
