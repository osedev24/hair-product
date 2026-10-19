import { z } from 'zod';
const productImageUrl=z.string().refine(value=>{
  if(/^\/uploads\/[a-zA-Z0-9-]+\.(?:jpg|png|webp|avif)$/.test(value))return true;
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
},{message:'Use a valid HTTPS image URL or a local uploaded image'});
export const productInput = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().min(2).max(140).regex(/^[a-z0-9-]+$/), description: z.string().trim().max(3000).default(''), price: z.coerce.number().positive(), stock: z.coerce.number().int().min(0), lowStockThreshold: z.coerce.number().int().min(0).default(5), categoryId: z.string().uuid().nullable().optional(), images: z.array(productImageUrl).max(8).default([]), active: z.boolean().default(true) });
export const checkoutInput = z.object({ fields: z.record(z.string(), z.string().max(500)).default({}), customerName: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), address: z.string().optional(), city: z.string().optional(), notes: z.string().optional(), items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(30) })).min(1).max(30) });
export const safeText = (value, max=2000) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
