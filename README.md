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
- `Invoice { id, enterpriseId, supplierId, type, invoiceNumber, blobName, amount, date, createdAt }`
- `InvoiceLine { id, invoiceId, suppliersProductId, masterProductId, description, quantity, unitPrice, price, tax, createdAt }`
  - `masterProductId`: Links to product in Products microservice (no FK constraint)
- `SupplierProduct { id, productReference, masterProductId, supplierId, createdAt, updatedAt }`
  - `masterProductId`: String reference to product ID in Products service

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

| Event                       | Payload                                                                                            | Action                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `documents.analyzed`        | `{ documentId, enterpriseId, extraction: { supplierName, lines: [{ description, productCode }] }}` | Auto-create Supplier + Invoice with lines + Link to Products MS |
| `documents.analysis.failed` | `{ documentId, reason }`                                                                           | Log warning                                                     |

### Events Published

| Event                         | Payload                                                      | Description                                 |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| `suppliers.supplier.created`  | `{ supplierId, name, cifNif, createdAt }`                    | Emitted when a supplier is created          |
| `suppliers.invoice.created`   | `{ invoiceId, enterpriseId, supplierId, amount, createdAt }` | Emitted when an invoice is created          |
| `suppliers.invoice.processed` | `{ documentId, invoiceId, enterpriseId, success }`           | Emitted after processing document → invoice |

### Calls to Other Services

| Service  | Subject                 | Payload                             | Response                               |
| -------- | ----------------------- | ----------------------------------- | -------------------------------------- |
| Products | `products.findOrCreate` | `{ name, eanCode?, categoryName? }` | `{ id, name, eanCode, category, ... }` |

## Auto-create Flow with Products Integration

1. **Documents-Analyzer** extracts invoice data with OpenAI
2. **Emits event**: `documents.analyzed` with supplier info and line items
3. **Suppliers Service** listens to the event
4. **For each invoice line**:
   - Calls **Products Service**: `products.findOrCreate` with product name and EAN
   - Products Service searches by EAN or name
   - If not found, creates new product in catalog
   - Returns product ID (`masterProductId`)
5. **Auto-creates**:
   - Supplier (if doesn't exist, based on CIF/NIF)
   - Invoice linked to the supplier
   - Invoice lines with `masterProductId` linking to products catalog
6. **Emits**: `suppliers.invoice.processed` with `documentId` and `invoiceId`
7. **Documents-Analyzer** updates document with `invoiceId`

### Flow Diagram

```
┌─────────────┐
│   Gateway   │
└──────┬──────┘
       │ POST /api/analyze/invoice
       ▼
┌──────────────────┐
│ Documents        │
│ Analyzer         │
│                  │
│ 1. Extract with  │
│    Azure AI      │
│ 2. Save document │
└────────┬─────────┘
         │ emit: documents.analyzed
         │ {documentId, extraction: {lines: [...]}}
         ▼
┌────────────────────────────┐
│ Suppliers Service          │
│                            │
│ 3. Listen to event         │
│ 4. For each line:          │
│    ┌──────────────────┐   │
│    │ Call Products MS │   │
│    │ findOrCreate     │◄──┼──┐
│    └──────────────────┘   │  │
│    Gets masterProductId   │  │
│ 5. Create invoice with    │  │
│    masterProductId        │  │
│ 6. Emit invoice.processed │  │
└────────────────────────────┘  │
         │                      │
         │                      │
         ▼                      │
┌──────────────────┐            │
│ Documents        │            │
│ Analyzer         │            │
│                  │            │
│ 7. Link invoiceId│            │
│    to document   │            │
└──────────────────┘            │
                                │
                         ┌──────┴────────┐
                         │ Products MS   │
                         │               │
                         │ - Search by   │
                         │   EAN/name    │
                         │ - Create if   │
                         │   not exists  │
                         │ - Return ID   │
                         └───────────────┘
```

### Benefits

- ✅ **Centralized Product Catalog**: All products in one place
- ✅ **Automatic Linking**: Products linked during invoice processing
- ✅ **Deduplication**: Prevents duplicate products (by EAN/name)
- ✅ **Cross-Analysis**: Compare prices across suppliers
- ✅ **Purchase History**: Track product purchases over time
- ✅ **Allergen Management**: Products include allergen information

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
