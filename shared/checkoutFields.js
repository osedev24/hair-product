export const defaultCheckoutFields = [
  { key: 'customerName', label: 'Full name', type: 'text', required: true, enabled: true },
  { key: 'email', label: 'Email address', type: 'email', required: true, enabled: true },
  { key: 'phone', label: 'Phone number', type: 'tel', required: true, enabled: true },
  { key: 'address', label: 'Delivery address', type: 'textarea', required: true, enabled: true },
  { key: 'city', label: 'City', type: 'text', required: true, enabled: true },
  { key: 'notes', label: 'Delivery note (optional)', type: 'textarea', required: false, enabled: true }
];
