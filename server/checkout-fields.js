import { defaultCheckoutFields } from '../shared/checkoutFields.js';
export { defaultCheckoutFields };

const allowedTypes = new Set(['text', 'email', 'tel', 'number', 'textarea']);

export function getCheckoutFields(settings = {}) {
  return Array.isArray(settings.checkoutFields) ? settings.checkoutFields : defaultCheckoutFields;
}

export function validateCheckoutFields(fields) {
  if (!Array.isArray(fields) || fields.length > 20) throw new Error('Checkout fields must be a list with at most 20 entries');
  const keys = new Set();
  for (const field of fields) {
    if (!field || typeof field !== 'object' || !/^[a-z][a-zA-Z0-9_-]{1,39}$/.test(field.key || '')) throw new Error('Each checkout field needs a valid key');
    if (keys.has(field.key)) throw new Error('Checkout field keys must be unique');
    keys.add(field.key);
    if (typeof field.label !== 'string' || !field.label.trim() || field.label.length > 80) throw new Error('Each checkout field needs a label of 1 to 80 characters');
    if (!allowedTypes.has(field.type)) throw new Error('Choose a supported type for every checkout field');
    if (typeof field.required !== 'boolean' || typeof field.enabled !== 'boolean') throw new Error('Checkout field required and enabled values must be true or false');
  }
  return fields;
}

export function collectCheckoutDetails(fields, submitted) {
  const values = {};
  const labels = {};
  for (const field of fields.filter(item => item.enabled)) {
    const value = String(submitted[field.key] ?? '').trim().slice(0, 500);
    if (field.required && !value) throw new Error(`${field.label} is required`);
    if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`Enter a valid ${field.label.toLowerCase()}`);
    if (field.type === 'number' && value && !Number.isFinite(Number(value))) throw new Error(`Enter a number for ${field.label.toLowerCase()}`);
    if (value) {
      values[field.key] = value;
      labels[field.key] = field.label;
    }
  }
  return {
    values,
    labels,
    customerName: values.customerName || '',
    email: values.email || '',
    phone: values.phone || '',
    address: values.address || '',
    city: values.city || '',
    notes: values.notes || ''
  };
}
