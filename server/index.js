import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { handleUpload } from '@vercel/blob/client';
import path from 'node:path';
import { pool, query } from './db.js';
import { login, logout, current, changePassword, changeAdminEmail, requireAdmin } from './auth.js';
import { productInput, checkoutInput } from './validation.js';
import { collectCheckoutDetails, getCheckoutFields, validateCheckoutFields } from './checkout-fields.js';

const app=express(), port=process.env.PORT||4000;
if(process.env.NODE_ENV==='production'&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32))throw new Error('Production requires a SESSION_SECRET of at least 32 characters');
app.set('trust proxy',1); app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({origin:process.env.CLIENT_ORIGIN||'http://localhost:5173',credentials:true})); app.use(express.json({limit:'1mb'}));
const PgStore=pgSession(session);
app.use(session({name:'botanical.sid',store:new PgStore({pool,tableName:'user_sessions',createTableIfMissing:true}),secret:process.env.SESSION_SECRET||'development-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*12}}));
const authLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false});
const admin=(req,res,next)=>requireAdmin(req,res,next);
app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.get('/api/health',async(_req,res)=>{try{await query('SELECT 1');res.json({ok:true,database:'connected'});}catch{res.status(503).json({ok:false});}});
app.get('/api/config',(_req,res)=>res.json({deliveryFee:Number(process.env.DELIVERY_FEE||0)}));
app.post('/api/admin/login',authLimiter,login); app.post('/api/admin/logout',admin,logout); app.get('/api/admin/me',current); app.put('/api/admin/password',admin,changePassword); app.put('/api/admin/email',admin,changeAdminEmail);
app.get('/api/categories',async(_req,res)=>{const {rows}=await query('SELECT id,name,slug FROM categories ORDER BY name');res.json(rows);});
app.post('/api/admin/categories',admin,async(req,res)=>{const name=String(req.body?.name||'').trim().slice(0,80),slug=String(req.body?.slug||'').trim().toLowerCase();if(name.length<2||! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return res.status(400).json({error:'Provide a category name and valid URL slug'});try{const {rows}=await query('INSERT INTO categories(name,slug) VALUES($1,$2) RETURNING id,name,slug',[name,slug]);res.status(201).json(rows[0]);}catch(e){res.status(409).json({error:'That category slug is already in use'});}});
app.put('/api/admin/categories/:id',admin,async(req,res)=>{const name=String(req.body?.name||'').trim().slice(0,80),slug=String(req.body?.slug||'').trim().toLowerCase();if(name.length<2||! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return res.status(400).json({error:'Provide a category name and valid URL slug'});try{const {rows}=await query('UPDATE categories SET name=$1,slug=$2 WHERE id=$3 RETURNING id,name,slug',[name,slug,req.params.id]);if(!rows[0])return res.status(404).json({error:'Category not found'});res.json(rows[0]);}catch(e){res.status(409).json({error:'That category slug is already in use'});}});
app.delete('/api/admin/categories/:id',admin,async(req,res)=>{const {rowCount}=await query('DELETE FROM categories WHERE id=$1',[req.params.id]);if(!rowCount)return res.status(404).json({error:'Category not found'});res.json({ok:true});});
app.get('/api/products',async(req,res)=>{const {rows}=await query(`SELECT p.id,p.name,p.slug,p.description,p.price,p.stock,p.low_stock_threshold,p.images,p.category_id,c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=true AND ($1::text IS NULL OR c.slug=$1) ORDER BY p.featured DESC,p.created_at DESC`,[req.query.category||null]);res.json(rows);});
app.get('/api/products/:slug',async(req,res)=>{const {rows}=await query('SELECT p.*,c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=$1 AND p.active=true',[req.params.slug]);if(!rows[0])return res.status(404).json({error:'Product not found'});res.json(rows[0]);});
app.post('/api/newsletter',rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{const email=String(req.body?.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return res.status(400).json({error:'Enter a valid email address'});await query('INSERT INTO newsletter_subscribers(email) VALUES($1) ON CONFLICT(email) DO NOTHING',[email]);res.status(201).json({ok:true});});
app.get('/api/admin/products',admin,async(_req,res)=>{const {rows}=await query('SELECT * FROM products ORDER BY created_at DESC');res.json(rows);});
app.post('/api/admin/products',admin,async(req,res)=>{const parsed=productInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid product',details:parsed.error.flatten()});const p=parsed.data;const {rows}=await query(`INSERT INTO products(name,slug,description,price,stock,low_stock_threshold,category_id,images,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[p.name,p.slug,p.description,p.price,p.stock,p.lowStockThreshold,p.categoryId||null,p.images,p.active]);res.status(201).json(rows[0]);});
app.put('/api/admin/products/:id',admin,async(req,res)=>{const parsed=productInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid product',details:parsed.error.flatten()});const p=parsed.data;const {rows}=await query(`UPDATE products SET name=$1,slug=$2,description=$3,price=$4,stock=$5,low_stock_threshold=$6,category_id=$7,images=$8,active=$9,updated_at=now() WHERE id=$10 RETURNING *`,[p.name,p.slug,p.description,p.price,p.stock,p.lowStockThreshold,p.categoryId||null,p.images,p.active,req.params.id]);if(!rows[0])return res.status(404).json({error:'Product not found'});res.json(rows[0]);});
app.delete('/api/admin/products/:id',admin,async(req,res)=>{await query('UPDATE products SET active=false,updated_at=now() WHERE id=$1',[req.params.id]);res.json({ok:true});});
const uploadDir=path.resolve(process.env.UPLOAD_DIR||'uploads');if(!process.env.VERCEL)mkdirSync(uploadDir,{recursive:true});
const imageExtensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'};
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(_req,file,cb)=>cb(null,`${randomUUID()}.${imageExtensions[file.mimetype]||'img'}`)}),limits:{fileSize:8*1024*1024},fileFilter:(_req,file,cb)=>cb(null,Boolean(imageExtensions[file.mimetype]))});
if(process.env.VERCEL){
  app.post('/api/admin/uploads',async(req,res)=>{
    try{
      const response=await handleUpload({request:req,body:req.body,onBeforeGenerateToken:async()=>{
        if(!req.session?.adminId)throw Object.assign(new Error('Admin sign-in required'),{status:401});
        return{allowedContentTypes:Object.keys(imageExtensions),maximumSizeInBytes:8*1024*1024,addRandomSuffix:true};
      },onUploadCompleted:async()=>{}});
      res.json(response);
    }catch(e){res.status(e.status||400).json({error:e.message||'Image upload failed'});}
  });
}else{
  app.post('/api/admin/uploads',admin,upload.single('file'),async(req,res)=>{if(!req.file)return res.status(400).json({error:'Choose a PNG, JPEG, WebP or AVIF image'});res.status(201).json({id:req.file.filename,url:`/uploads/${req.file.filename}`});});
}
app.post('/api/checkout',rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
  const parsed=checkoutInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Check your checkout details',details:parsed.error.flatten()});
  const settings=(await query('SELECT settings FROM site_settings WHERE id=1')).rows[0]?.settings||{};
  const fields=getCheckoutFields(settings);
  const submitted={...parsed.data.fields};
  for(const key of ['customerName','email','phone','address','city','notes'])if(submitted[key]===undefined&&parsed.data[key]!==undefined)submitted[key]=parsed.data[key];
  let customer;
  try{customer=collectCheckoutDetails(fields,submitted);}catch(e){return res.status(400).json({error:e.message});}
  const d={...customer,items:parsed.data.items},client=await pool.connect();
  try{
    await client.query('BEGIN');
    const quantities=new Map();
    for(const item of d.items)quantities.set(item.productId,(quantities.get(item.productId)||0)+item.quantity);
    const ids=[...quantities.keys()];
    const {rows:products}=await client.query('SELECT id,name,price,stock,images FROM products WHERE id=ANY($1::uuid[]) AND active=true FOR UPDATE',[ids]);
    if(products.length!==ids.length)throw Object.assign(new Error('A selected product is unavailable'),{status:409});
    const byId=new Map(products.map(p=>[p.id,p]));let subtotal=0;const snapshots=[];
    for(const [productId,quantity] of quantities){const p=byId.get(productId);if(p.stock<quantity)throw Object.assign(new Error(`${p.name} has only ${p.stock} in stock`),{status:409});subtotal+=Number(p.price)*quantity;snapshots.push({productId,quantity,name:p.name,unitPrice:p.price,image:p.images?.[0]||null});}
    const delivery=Number(process.env.DELIVERY_FEE||0),total=subtotal+delivery;
    const savedCustomerFields=Object.fromEntries(Object.entries(d.values).map(([key,value])=>[key,{label:d.labels[key]||key,value}]));
    const order=(await client.query(`INSERT INTO orders(customer_name,email,phone,address,city,notes,customer_fields,subtotal,delivery_fee,total,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING id,order_number`,[d.customerName,d.email,d.phone,d.address,d.city,d.notes,JSON.stringify(savedCustomerFields),subtotal,delivery,total])).rows[0];
    for(const item of snapshots)await client.query('INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price,image_snapshot) VALUES($1,$2,$3,$4,$5,$6)',[order.id,item.productId,item.name,item.quantity,item.unitPrice,item.image]);
    await client.query('COMMIT');
    const customerSummary=Object.entries(d.values).map(([key,value])=>`${d.labels[key]||key}: ${value}`).join('\n');
    const msg=`Hello! I'd like to confirm order ${order.order_number}.\n${snapshots.map(i=>`${i.name} × ${i.quantity}`).join('\n')}\nTotal: ₦${total.toLocaleString()}${customerSummary?`\n${customerSummary}`:''}`;
    const phone=(process.env.WHATSAPP_PHONE||'').replace(/\D/g,'');
    let whatsappUrl=null;
    if(settings.whatsappUrl){const target=new URL(settings.whatsappUrl);target.searchParams.set('text',msg);whatsappUrl=target.href;}
    else if(phone){const target=new URL(`https://wa.me/${phone}`);target.searchParams.set('text',msg);whatsappUrl=target.href;}
    res.status(201).json({order:{...order,total,subtotal,deliveryFee:delivery,items:snapshots,customerFields:d.values},whatsappUrl});
  }catch(e){await client.query('ROLLBACK');res.status(e.status||500).json({error:e.message||'Checkout failed'});}finally{client.release();}
});
app.get('/api/admin/orders',admin,async(_req,res)=>{const {rows}=await query('SELECT o.*,COALESCE(json_agg(json_build_object(\'name\',i.product_name,\'quantity\',i.quantity,\'unitPrice\',i.unit_price)) FILTER (WHERE i.id IS NOT NULL),\'[]\') items FROM orders o LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC');res.json(rows);});
app.patch('/api/admin/orders/:id/status',admin,async(req,res)=>{const allowed=['pending','confirmed','processing','shipped','cancelled'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status'});const client=await pool.connect();try{await client.query('BEGIN');const {rows}=await client.query('SELECT status FROM orders WHERE id=$1 FOR UPDATE',[req.params.id]);if(!rows[0])throw Object.assign(new Error('Order not found'),{status:404});const prior=rows[0].status,next=req.body.status,transitions={pending:['confirmed','cancelled'],confirmed:['processing','cancelled'],processing:['shipped','cancelled'],shipped:[],cancelled:[]};if(!transitions[prior].includes(next))throw Object.assign(new Error(`Cannot move an order from ${prior} to ${next}`),{status:409});if(prior==='pending'&&next==='confirmed'){const needed=await client.query('SELECT p.id,p.stock,i.quantity FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=$1 FOR UPDATE OF p',[req.params.id]);const short=needed.rows.find(item=>item.stock<item.quantity);if(short)throw Object.assign(new Error('Insufficient stock to confirm this order'),{status:409});for(const item of needed.rows)await client.query('UPDATE products SET stock=stock-$1,updated_at=now() WHERE id=$2',[item.quantity,item.id]);}if(['confirmed','processing'].includes(prior)&&next==='cancelled')await client.query('UPDATE products p SET stock=p.stock+i.quantity,updated_at=now() FROM order_items i WHERE i.order_id=$1 AND p.id=i.product_id',[req.params.id]);const out=await client.query('UPDATE orders SET status=$1,updated_at=now() WHERE id=$2 RETURNING *',[next,req.params.id]);await client.query('COMMIT');res.json(out.rows[0]);}catch(e){await client.query('ROLLBACK');res.status(e.status||500).json({error:e.message});}finally{client.release();}});
// CMS documents are always data. Content is size/type checked, then rendered only by the fixed frontend registry.
const validSections=new Set(['hero','story','benefits','products','testimonials','faq','newsletter','imageText']);
function cleanContent(value,depth=0){if(depth>5)throw new Error('Content nesting is too deep');if(typeof value==='string')return value.replace(/[\u0000-\u0008\u000B\u000C\u000E\u000F\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001A\u001B\u001C\u001D\u001E\u001F]/g,'').slice(0,5000);if(typeof value==='number'||typeof value==='boolean'||value===null)return value;if(Array.isArray(value))return value.slice(0,60).map(v=>cleanContent(v,depth+1));if(typeof value==='object'){const out={};for(const [k,v] of Object.entries(value).slice(0,80)){if(!/^[a-zA-Z0-9_-]{1,60}$/.test(k))continue;const clean=cleanContent(v,depth+1),urlField=/(href|url|image|logo)/i.test(k)&&!/(alt|caption)/i.test(k);if(typeof clean==='string'&&urlField&&clean&&!/^(https?:\/\/|\/|#|mailto:)/i.test(clean))throw new Error(`Unsafe URL in ${k}`);out[k]=clean;}return out;}return '';}
function validateSettings(input){const s=cleanContent(input);const colors=s.colors||{};for(const [key,value] of Object.entries(colors)){if(!['forest','sage','ivory','amber'].includes(key)||!/^#[0-9a-f]{6}$/i.test(String(value)))throw new Error('Use the approved brand color fields and 6-digit hex colors');}if(s.whatsappUrl){let target;try{target=new URL(s.whatsappUrl);}catch{throw new Error('Enter a valid WhatsApp contact URL');}if(target.protocol!=='https:'||!['wa.me','www.whatsapp.com','api.whatsapp.com'].includes(target.hostname))throw new Error('Use a WhatsApp HTTPS link such as https://wa.me/234...');}const fonts=['Cormorant Garamond','Playfair Display','DM Sans','Lato','Montserrat'];if(s.headingFont&&!fonts.includes(s.headingFont)||s.bodyFont&&!fonts.includes(s.bodyFont))throw new Error('Choose a font from the approved font list');for(const field of ['navigation','footerLinks'])if(s[field]&&!Array.isArray(s[field]))throw new Error(`${field} must be a list`);if(s.checkoutFields!==undefined)validateCheckoutFields(s.checkoutFields);return s;}
function validateStyles(input){const s=cleanContent(input||{}),out={};if(s.align!==undefined){if(!['left','center','right'].includes(s.align))throw new Error('Invalid section alignment');out.align=s.align;}if(s.background!==undefined){if(!['ivory','sage','forest','white'].includes(s.background))throw new Error('Invalid section background');out.background=s.background;}if(s.padding!==undefined){if(!['compact','normal','large'].includes(s.padding))throw new Error('Invalid section spacing');out.padding=s.padding;}return out;}
app.get('/api/site',async(req,res)=>{const page=String(req.query.page||'home');const {rows}=await query(`SELECT p.slug,p.title,p.seo_title,p.seo_description,published,s.section_type,s.content,s.styles,s.visible,s.sort_order FROM site_pages p LEFT JOIN page_sections s ON s.page_id=p.id WHERE p.slug=$1 AND p.published=true ORDER BY s.sort_order`,[page]);if(!rows.length)return res.status(404).json({error:'Page not found'});const settings=(await query('SELECT settings FROM site_settings WHERE id=1')).rows[0]?.settings||{};res.json({settings,page:{slug:rows[0].slug,title:rows[0].title,seoTitle:rows[0].seo_title,seoDescription:rows[0].seo_description,sections:rows.filter(r=>r.section_type).map(r=>({type:r.section_type,content:r.content,styles:r.styles,visible:r.visible,order:r.sort_order}))}});});
app.get('/api/admin/site',admin,async(_req,res)=>{const settings=(await query('SELECT settings,updated_at FROM site_settings WHERE id=1')).rows[0]||{settings:{}};const {rows}=await query(`SELECT p.*,COALESCE(json_agg(json_build_object('id',s.id,'type',s.section_type,'content',s.content,'styles',s.styles,'visible',s.visible,'order',s.sort_order) ORDER BY s.sort_order) FILTER(WHERE s.id IS NOT NULL),'[]') sections FROM site_pages p LEFT JOIN page_sections s ON s.page_id=p.id GROUP BY p.id ORDER BY p.slug`);res.json({settings:settings.settings,pages:rows});});
app.put('/api/admin/site/settings',admin,async(req,res)=>{try{const settings=validateSettings(req.body);if(JSON.stringify(settings).length>30000)return res.status(400).json({error:'Settings are too large'});const {rows}=await query('INSERT INTO site_settings(id,settings) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now() RETURNING settings',[settings]);res.json(rows[0]);}catch(e){res.status(400).json({error:e.message});}});
app.put('/api/admin/site/pages/:slug',admin,async(req,res)=>{const slug=String(req.params.slug).replace(/[^a-z0-9-]/g,'').slice(0,100);const d=req.body||{};try{const sections=(d.sections||[]).slice(0,30);for(const s of sections){if(!validSections.has(s.type))return res.status(400).json({error:`Unsupported section type: ${s.type}`});cleanContent(s.content);validateStyles(s.styles||{});}const client=await pool.connect();try{await client.query('BEGIN');const page=(await client.query('INSERT INTO site_pages(slug,title,seo_title,seo_description,published) VALUES($1,$2,$3,$4,$5) ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description,updated_at=now() RETURNING id',[slug,String(d.title||'').slice(0,160),String(d.seoTitle||'').slice(0,180),String(d.seoDescription||'').slice(0,320),Boolean(d.published)])).rows[0];await client.query('DELETE FROM page_sections WHERE page_id=$1',[page.id]);for(let i=0;i<sections.length;i++){const s=sections[i];await client.query('INSERT INTO page_sections(page_id,section_type,content,styles,visible,sort_order) VALUES($1,$2,$3,$4,$5,$6)',[page.id,s.type,cleanContent(s.content),validateStyles(s.styles||{}),s.visible!==false,i]);}await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/admin/site/preview',admin,async(req,res)=>{try{const d=req.body||{},rawPage=d.page||{};if(!Array.isArray(rawPage.sections)||rawPage.sections.length>30)throw new Error('Preview requires a section list');const page={slug:String(rawPage.slug||'home').replace(/[^a-z0-9-]/g,'').slice(0,100),title:String(rawPage.title||'').slice(0,160),seoTitle:String(rawPage.seoTitle||rawPage.seo_title||'').slice(0,180),seoDescription:String(rawPage.seoDescription||rawPage.seo_description||'').slice(0,320),sections:rawPage.sections.map(s=>{if(!validSections.has(s.type))throw new Error(`Unsupported section type: ${s.type}`);return{type:s.type,content:cleanContent(s.content||{}),styles:validateStyles(s.styles||{}),visible:s.visible!==false};})};res.json({settings:validateSettings(d.settings||{}),page:{...page,published:false}});}catch(e){res.status(400).json({error:e.message});}});
app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found'}));
if(!process.env.VERCEL){app.use('/uploads',express.static(uploadDir,{dotfiles:'deny',index:false,maxAge:'1d'}));app.use(express.static(path.resolve('dist')));app.get('*',(req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.resolve('dist/index.html')));}
export default app;
if(!process.env.VERCEL)app.listen(port,()=>console.log(`Botanical store API listening on ${port}`));
