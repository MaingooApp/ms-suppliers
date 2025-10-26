export const NATS_SERVICE = 'NATS_SERVICE';

export const SuppliersSubjects = {
  createSupplier: 'suppliers.create',
  getSupplier: 'suppliers.getById',
  listSuppliers: 'suppliers.list',
  updateSupplier: 'suppliers.update',
  deleteSupplier: 'suppliers.delete',

  createInvoice: 'invoices.create',
  getInvoice: 'invoices.getById',
  listInvoices: 'invoices.list',

  healthCheck: 'suppliers.health.check'
} as const;

export const SuppliersEvents = {
  supplierCreated: 'suppliers.supplier.created',
  invoiceCreated: 'suppliers.invoice.created',
  invoiceProcessed: 'suppliers.invoice.processed'
} as const;

export const DocumentsEvents = {
  analyzed: 'documents.analyzed',
  failed: 'documents.analysis.failed'
} as const;
