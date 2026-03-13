# BuilderMonster — Product Requirements Document

> Multi-site automated generation platform. Stack: Next.js 15 + Supabase + Astro.js.
> Ultima actualizacion: 2026-03-13

---

## Vision

Un unico panel de control para gestionar el ciclo de vida completo de una cartera de sitios web: generacion, optimizacion, despliegue y mantenimiento continuo — todo asistido por IA.

La IA es el motor central: genera contenido e imagenes, investiga nichos, recomienda mejoras, puntua SEO, y mantiene los datos actualizados. El usuario decide y aprueba; la IA ejecuta. Cada pagina se optimiza al maximo para posicionar alto y rapido en buscadores.

Modelo de negocio: explotacion propia de la cartera (no venta del software). Evolucion del proyecto validado `tsa-monster` (Laravel + FilamentPHP + Astro.js, sites TSA en produccion).

---

## Tech Stack

### Admin Panel
- **Next.js 15** (App Router, Server Components, Server Actions)
- **shadcn/ui + Tailwind v4** (componentes pre-built)
- **React Hook Form + Zod** (formularios + validacion)

### Backend / DB
- **Next.js API routes** (sin servidor separado)
- **Supabase Cloud** (PostgreSQL + Auth + Real-time + Storage)
- **Hetzner VPS** (admin panel) protegido tras **Tailscale** (acceso solo via tailnet)

### Site Generation
- **Astro.js** (sitios estaticos optimizados para SEO)
- **Tailwind CSS** (styling de sites generados)

### AI
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — agentes autonomos e interactivos (Monster Chat, NicheResearcher)
- **Claude API** (`@anthropic-ai/sdk`) — generacion masiva de contenido en batch (ContentGenerator)
- **Plan Pro** de Anthropic ($20/mes). Upgrade a Max cuando rate limits lo requieran.

### Domains
- **Spaceship.com** (ICANN-accredited registrar)
- API REST: availability check, registration, DNS management, transfers, renewals
- Auth: API key + API secret via headers
- Docs: https://docs.spaceship.dev/

### Product & SEO Data
- **DataForSEO** (pay-as-you-go, sin suscripcion)
- **Merchant API (Amazon)**: product search, ASIN detail, sellers — $0.001-0.0015/req
- **Labs API**: keyword suggestions, difficulty, search intent, competitor analysis — $0.01/task + $0.0001/item
- **SERP API**: SERPs reales de Google — $0.0006/SERP (standard)
- **Keywords Data API**: search volume (Google Ads + clickstream), CPC, trends — $0.15/task (1000 kw)
- **Backlinks API** (opcional): $100/mes minimo (saldo consumible)
- Docs: https://docs.dataforseo.com/

### Queue & Cron
- **BullMQ** (cola de trabajos en Redis)
- **Vercel Cron** (tareas programadas)
- **Upstash Redis** (managed Redis para BullMQ)

### Hosting Sites Generados
- **Hetzner VPS** (CX22/CX32) con **Caddy** (auto-SSL, reverse proxy)
- Ver seccion "Analisis de Deployment" para justificacion

### Analytics
- Tracking script propio embebido en sites generados
- POST directo a Supabase Cloud (anon key + RLS: solo INSERT)
- Admin panel lee de Supabase (no necesita endpoint publico)

---

## Site Types Soportados

| Tipo | Monetizacion | Prioridad | ROI estimado |
|------|-------------|-----------|-------------|
| TSA (Amazon Affiliate) | Comision 2-10% | **P0 — Phase 1** | $50-200/mes por site |
| AdSense Blogs | CPM ads $0.25-4/1k views | P1 | $30-150/mes |
| Multi-Affiliate | Comisiones SaaS 15-40% | P1 | $100-300/mes |
| Lead Gen | $1-50 por lead | P2 | $100-500/mes |
| Newsletter | Sponsorship + affiliate | P2 | $200-1k/mes |
| Micro SaaS | Tool sales (100% margen) | P3 | $500-2k/mes |

> Phase 1 implementa SOLO TSA. La arquitectura debe ser extensible para los demas tipos.

---

## TSA Sites — Especificacion Detallada

### Concepto Validado
Sitios tipo catalogo de productos Amazon con enlaces de afiliado. Estructura simple, optimizada para SEO transaccional y conversion. Ya validado con sitio en produccion en el proyecto anterior (`tsa-monster`).

### Regla fundamental: 1 site = 1 idioma + 1 mercado Amazon

Cada site se genera integramente en **un unico idioma** y apunta a **un unico mercado Amazon**. Esto determina:

| Aspecto | Determinado por |
|---|---|
| Idioma de todo el contenido (textos SEO, descripciones, UI, legal) | `language` del site |
| Mercado Amazon para buscar productos (DataForSEO `location`) | `market` del site |
| Links de afiliado (`amazon.es`, `amazon.com`, `amazon.co.uk`, etc.) | `market` del site |
| Affiliate tag en los links | `affiliate_tag` del site (uno por mercado) |
| Moneda de precios | `currency` (derivada del market) |
| Audiencia SEO target (Google ES, Google US, etc.) | `language` + `market` |
| Contenido AI: idioma de generacion | `language` del site |

**Mercados Amazon soportados:**

| Market | Dominio Amazon | Idiomas habituales | Moneda |
|---|---|---|---|
| ES | amazon.es | es | EUR |
| US | amazon.com | en | USD |
| UK | amazon.co.uk | en | GBP |
| DE | amazon.de | de | EUR |
| FR | amazon.fr | fr | EUR |
| IT | amazon.it | it | EUR |
| MX | amazon.com.mx | es | MXN |
| CA | amazon.ca | en/fr | CAD |
| JP | amazon.co.jp | ja | JPY |
| AU | amazon.com.au | en | AUD |

> Un mismo nicho puede tener multiples sites (ej: "air fryers" en ES para amazon.es y en EN para amazon.com). Son sites independientes con dominio, contenido y productos distintos.

### Estructura de Paginas

#### Homepage
- Hero con nombre del nicho y CTA (imagen: stock Unsplash o AI a demanda)
- Grid de categorias (imagen: producto representativo de la categoria)
- Productos destacados (opcional)
- Texto SEO introductorio (~300-500 palabras)

#### Pagina de Categoria (`/category/[slug]`)
- H1 con nombre de categoria
- Texto SEO (~350-400 palabras, enfocado en ventas, sin comentarios/reviews)
- Imagen de categoria: producto representativo
- Grid de productos:
  - Imagen del producto (local, descargada de Amazon, optimizada)
  - Nombre/titulo
  - Precio actual (y precio original tachado si hay descuento)
  - Badge "Prime" si aplica
  - Boton "Comprar" → enlace Amazon con affiliate tag
  - Boton "Mas info" → pagina de detalle del producto

#### Pagina de Producto (`/product/[slug]`)
- Imagen grande del producto (local, descargada de Amazon, optimizada)
- Galeria de imagenes si disponibles (todas locales)
- Titulo, precio, disponibilidad
- Descripcion detallada (generada por AI)
- Pros y contras (generados por AI)
- Resumen de opiniones de usuarios (generado por AI)
- CTA principal → enlace Amazon con affiliate tag
- Productos relacionados de la misma categoria

#### Paginas Legales (obligatorias)
- Aviso Legal
- Politica de Privacidad
- Politica de Cookies
- Contacto

### Datos por Site TSA

```
Site:
  name, domain, niche
  market (ES/US/UK/DE/FR/IT/MX/CA/JP/AU) — determina Amazon domain + affiliate links
  language (es/en/de/fr/it/ja) — idioma de TODO el contenido generado
  currency (EUR/USD/GBP/MXN/CAD/JPY/AUD) — derivada del market
  affiliate_tag — tag de Amazon Associates para este mercado
  template (tsa/classic, tsa/modern, tsa/minimal)
  customization:
    colors (primary, secondary, accent, background, text) — CSS custom properties
    typography (heading_font, body_font) — Google Fonts o self-hosted
    logo (image_url o text + style)
    favicon (generated o custom)
  company_name, contact_email

Categories (10 por defecto):
  name, slug, description, image
  seo_description, keywords[], category_text (SEO ~400 words)

Products (por categoria):
  asin, title, slug
  current_price, original_price
  images[] (local paths, downloaded from Amazon, optimized WebP)
  rating, review_count
  availability, is_prime, condition
  detailed_description (AI), pros_cons (AI), user_opinions_summary (AI)
```

### Sistema de Templates Astro

Templates agrupadas por tipo de site. Cada template define **layout y estructura visual base**. Al crear un site nuevo, se selecciona template y se personalizan: colores, logo, tipografia, etc.

#### Anatomia de una Template
```
apps/generator/src/templates/
  tsa/
    classic/        — Layout estandar, grid 3 columnas
    modern/         — Gradientes, animaciones sutiles, UX premium
    minimal/        — Ultra-rapido, minimo peso, CSS inline
  blog/             — (Phase 2+)
    magazine/
    editorial/
  shared/
    components/     — Componentes compartidos cross-template
    layouts/        — Layouts base reutilizables
```

#### Que define una Template
- **Layout:** Estructura HTML de cada tipo de pagina (homepage, category, product, legal)
- **Grid system:** Columnas, spacing, responsive breakpoints
- **Estilo base:** Animaciones, transiciones, efectos visuales
- **Component variants:** Como se renderizan product cards, hero, navigation, footer

#### Que se personaliza por Site (no es parte de la template)
- **Colores:** primary, secondary, accent, background, text (CSS custom properties)
- **Tipografia:** font-family heading + body (Google Fonts o self-hosted)
- **Logo:** Imagen o texto estilizado
- **Favicon:** Generado o subido
- **Company name, contact info**

#### Templates TSA — Phase 1
1. **TSA Classic** — Layout estandar, grid 3 columnas, colores neutros, confiable
2. **TSA Modern** — Gradientes, animaciones sutiles, cards con sombra, UX premium
3. **TSA Minimal** — CSS inline, ultra-rapido, minimo peso, conversion-focused

### Estrategia de Imagenes

Todas las imagenes se sirven como **static assets locales** del site (nunca hotlinking a Amazon u otros). Esto mejora velocidad, SEO, y evita broken images si la fuente cambia.

#### Fuentes por tipo de imagen

| Imagen | Fuente | Proceso |
|---|---|---|
| **Producto** | Amazon (via DataForSEO `image_url`) | Descarga → resize (max 1280px) → optimizacion WebP → static asset |
| **Categoria thumbnail** | Imagen del producto representativo de la categoria | Seleccion automatica (producto con mejor rating/posicion) |
| **Hero / banners** | Unsplash API (stock gratuito, atribucion) | Busqueda por keywords del nicho → descarga → optimizacion |
| **Logo** | Texto estilizado (generado con CSS/SVG) o subido por usuario | — |
| **Favicon** | Generado desde logo/initial del site | SVG → PNG multi-size |
| **Imagenes AI** | A demanda del usuario (no automatico) | Usuario solicita desde admin panel → generacion → review → uso |

#### Pipeline de procesamiento
1. Descarga de imagen original (Amazon / Unsplash)
2. Resize: max 1280px ancho, mantener aspect ratio
3. Conversion a WebP (quality 80-85%, ~70% reduccion vs JPEG)
4. Generacion de srcset responsive (640w, 960w, 1280w)
5. Alt text: generado automaticamente (nombre producto + categoria para productos, descripcion para stock)
6. Lazy loading: `loading="lazy"` en todas excepto above-the-fold

#### Actualizacion de imagenes en refresh
- Si imagen de producto cambia en Amazon → descargar nueva, reoptimizar, rebuild
- Si producto no disponible → imagen se mantiene en cache pero no se muestra (producto oculto)

### Pipeline de Generacion (one-time)
1. Seleccion de nicho y mercado
2. NicheResearcher valida viabilidad (DataForSEO: keywords, competencia, tendencias)
3. NicheResearcher propone dominios + valida disponibilidad (Spaceship API)
4. **Usuario aprueba dominio** → compra automatica via Spaceship API
5. Generacion de categorias + keywords (AI + DataForSEO Labs)
6. Obtencion de productos Amazon por categoria (DataForSEO Merchant API)
7. Descarga de imagenes de producto desde Amazon → optimizacion (WebP, resize) → almacenamiento local
8. Obtencion de imagenes stock (Unsplash) para hero/banners. Imagenes AI solo a demanda del usuario.
9. Generacion de contenido SEO (AI): textos de categoria, descripciones de producto
10. Build Astro.js con template seleccionado + personalizacion (colores, tipografia, logo)
11. SEO Scorer valida todas las paginas (target: 70+ score)
12. DNS A record via Spaceship API → apuntar a VPS 2
13. Deploy a VPS via rsync + Caddy auto-SSL (imagenes incluidas como static assets)

### Pipeline de Actualizacion de Productos (cron, recurrente)

Sites Astro son estaticos — los datos de producto se quedan congelados en build time. Necesitan actualizacion periodica para mantener precios, disponibilidad y ofertas al dia.

**Frecuencia:** configurable por site (default: cada 2-3 dias)

**Estrategia hibrida (optimiza coste/precision):**
1. **Keyword search periodico** (DataForSEO Amazon Products, barato: $0.001/SERP) — detecta cambios gruesos, productos nuevos en ranking
2. **ASIN lookup selectivo** (DataForSEO Amazon ASIN, $0.0015/req) — validacion completa cada 3-5 dias o cuando keyword search detecta cambios
3. **Rebuild condicional** — solo regenera y despliega sites con cambios detectados

**Flujo por site:**
1. Cron (BullMQ scheduled job) lanza refresh para el site
2. Fetch datos actualizados de productos (DataForSEO Merchant API)
3. Comparar con datos en DB:
   - **Precio cambiado** → actualizar en DB
   - **Producto no disponible** → marcar como unavailable, excluir del site, crear alerta para el usuario
   - **Oferta/descuento nuevo** → actualizar precio original + descuento
   - **Rating/reviews** → actualizar
   - **Sin cambios** → no hacer nada
4. Si hay cambios → regenerar site (Astro build) → deploy a VPS 2
5. Si hay productos no disponibles → alerta en Dashboard + notificacion para buscar alternativas

**Alertas de producto:**
- Producto no disponible → alerta "warning" (site sigue funcionando sin ese producto)
- Categoria sin productos disponibles → alerta "critical" (categoria vacia)
- >30% productos de un site no disponibles → alerta "critical" (site degradado)

**Coste estimado de refresh:**

| Escenario | Estrategia | Coste/site/mes | 100 sites/mes |
|-----------|-----------|----------------|---------------|
| Keyword cada 2 dias (5 cats) | Solo keyword | $2.50 | $250 |
| Keyword diario + ASIN cada 5 dias | Hibrida | $5.50 | $550 |
| ASIN diario (50 prods) | Full precision | $2.25/dia → $67.50 | $6,750 |

> Recomendacion: estrategia hibrida. Keyword search frecuente + ASIN selectivo. Escala razonablemente.

---

## Admin Panel — Pantallas

### 1. Dashboard
- Total de sites activos / pausados / en generacion
- Ingresos estimados totales (mes actual, mes anterior, tendencia)
- Visitas totales agregadas (hoy, semana, mes)
- Clicks en enlaces de afiliado (agregado)
- Top 5 sites por ingresos
- Top 5 sites por visitas
- Alertas: sites caidos, sites sin trafico, errores de deploy, productos no disponibles, sites degradados (>30% productos unavailable)
- Coste total de infraestructura (hosting + AI + dominios + DataForSEO)

### 2. Sites
- Listado con: nombre, dominio, nicho, estado, visitas, ingresos estimados
- Filtros: por tipo, estado, mercado
- Acciones: crear, editar, pausar, redesplegar, eliminar
- Vista detalle de site:
  - Estadisticas del site (visitas, clicks, conversiones)
  - Categorias y productos (con estado: available/unavailable, ultimo precio, last_checked)
  - Alertas de producto activas
  - Estado de deploy + ultimo refresh de productos
  - Configuracion SEO
  - Historial de generaciones y refreshes

### 3. Monster Chat
- Chat conversacional con el agente Monster
- El agente tiene contexto completo: todos los sites, estadisticas, rendimiento
- Casos de uso:
  - "Que sites rinden peor este mes?"
  - "Sugiere 3 nichos nuevos para mercado US"
  - "Optimiza el contenido SEO de [site X]"
  - "Pausar sites que no generan trafico en 30 dias"
  - Consultas generales sobre el portfolio
- Historial de conversaciones persistente

### 4. Research Lab
- Input: idea de nicho o prompt de investigacion libre
- El agente NicheResearcher trabaja de forma autonoma en background
- **Data sources:** DataForSEO (keywords, SERPs, competencia, trends) + Spaceship (domain availability)
- Proceso:
  1. Analiza competencia real en SERPs (DataForSEO SERP API)
  2. Keyword research: volumen, dificultad, CPC, search intent (DataForSEO Labs + Keywords Data)
  3. Analisis de productos disponibles en Amazon (DataForSEO Merchant API)
  4. Validacion de tendencia del nicho (Google Trends via DataForSEO)
  5. Analisis de competidores: dominios que rankean, keywords compartidas, trafico estimado (DataForSEO Labs)
  6. Propuesta de dominios disponibles (verificados contra Spaceship API)
  7. IA sintetiza todo en informe: viabilidad (score), keywords, categorias, competidores, dominios disponibles
- **Herramientas del Research Lab:**
  - **Niche Prospector** — descubrir nichos por categoria + volumen + tendencia
  - **Keyword Analyzer** — clusters de keywords, dificultad, oportunidades
  - **Competitor Scanner** — analizar dominios competidores, content gaps
  - **Domain Suggester** — proponer dominios disponibles con potencial SEO
- El usuario puede aprobar el research → aprobar dominio → crear site directamente desde los resultados
- Historial de investigaciones previas

### 5. Analytics
- Vista global: metricas agregadas de todos los sites
- Vista por site: metricas individuales
- Metricas principales:
  - Visitas (unicas, totales)
  - Paginas vistas
  - Clicks en enlaces de afiliado
  - Conversiones estimadas (click → compra, ratio estandar por mercado)
  - Pais de origen
  - Idioma del navegador
  - Fuente de trafico (organic, direct, referral)
  - Paginas mas visitadas
- Periodos: hoy, 7d, 30d, custom

### 6. Finances
Panel completo de costes e ingresos del portfolio.

#### Costes (manuales + automaticos)
- Registro de costes fijos mensuales: Anthropic Pro/Max, Hetzner VPS, otros servicios
- Registro de costes por site: dominios (coste anual, fecha renovacion, registrar)
- Costes one-time: setup, herramientas puntuales
- Vista mensual: total costes fijos + variables, desglose por categoria
- Alertas: dominios proximos a expirar, cambios de precio

#### Ingresos — Amazon Associates (API automatica)
- Integracion con Amazon Associates Reporting API
- Sync automatico (diario via cron): earnings, clicks, conversiones, items vendidos
- Datos por site (mapeado via affiliate tag por site o subtag)
- Metricas: comisiones ganadas, items ordered, conversion rate
- Desglose por mercado (ES, US, UK, etc.)
- Historico mensual con tendencias

#### Ingresos — Google AdSense (API automatica, Phase 2+)
- Integracion con AdSense Management API v2
- OAuth 2.0 para autenticacion
- Sync automatico: earnings, RPM, clicks, impressions
- Datos por site (via ad unit o URL channel)
- Historico mensual

#### Ingresos — Manual
- Input manual para fuentes sin API (otros affiliate programs, sponsorships)
- Registro: fuente, site, monto, fecha, notas

#### P&L Dashboard
- **Revenue total** (Amazon + AdSense + manual) vs **Costes totales**
- **Beneficio neto** mensual con tendencia
- **ROI por site**: ingresos vs coste (dominio + hosting prorrateado)
- **Sites rentables vs no rentables** (threshold configurable)
- Grafico temporal: evolucion de P&L
- Export CSV/JSON

### 7. Settings
- Configuracion de affiliate tags por mercado
- API keys: Claude, Amazon Associates, Spaceship, DataForSEO, AdSense OAuth (Phase 2+)
- Configuracion de deployment (VPS, DNS)
- Preferencias de generacion (template default, colores default)
- Gestion de dominios (Spaceship account balance visible)
- Configuracion de costes fijos (para panel Finances)

---

## Sistema de Analytics

### Requisitos
- Ligero, sin impacto en rendimiento de los sites
- Minimas implicaciones GDPR (no cookies, no datos personales identificables)
- Datos: visitas, paginas vistas, clicks en affiliate links, pais, idioma, referrer

### Arquitectura

```
[Site generado] → script tracking (~2KB) → POST directo a Supabase Cloud
                                            (anon key + RLS: solo INSERT)
                                                    ↓
                                            [Supabase: analytics_events]
                                                    ↓
                                            [Cron: agregar daily → analytics_daily]
                                                    ↓
                                            [Dashboard: leer analytics_daily]
```

### Tracking Script (embebido en sites)
- Vanilla JS, ~2KB minificado
- Sin cookies — fingerprint ligero basado en: dia + IP hash + user-agent hash
- Eventos: `pageview`, `click_affiliate`, `click_category`
- Datos enviados: site_id, event_type, page_path, referrer, country (via header), language
- Batch: agrupa eventos y envia cada 5s o al salir de la pagina (sendBeacon)

### Modelo de Datos

```sql
-- Eventos raw (particionado por mes, retencion 90 dias)
analytics_events:
  id, site_id, event_type, page_path, referrer,
  country, language, visitor_hash, created_at

-- Agregados diarios (retencion indefinida)
analytics_daily:
  id, site_id, date, page_path,
  pageviews, unique_visitors, affiliate_clicks,
  top_countries (jsonb), top_referrers (jsonb)
```

### GDPR
- No cookies → no consent banner necesario
- IP se hashea en el servidor, nunca se almacena raw
- visitor_hash = hash(date + IP + user-agent) — no trackea entre dias
- No datos personales identificables almacenados
- Retencion de raw events: 90 dias, luego solo agregados

---

## SEO Scorer — Analisis On-Page Automatizado

### Concepto
Herramienta interna (`packages/seo-scorer/`) que calcula un score SEO 0-100 por pagina generada. Analisis puramente estatico del HTML (sin APIs externas). Se ejecuta post-build y almacena scores en Supabase. Umbrales adaptados por tipo de pagina.

### Escala de Scoring

| Rango | Label | Color | Significado |
|---|---|---|---|
| 90-100 | Excellent | Green | Totalmente optimizado |
| 70-89 | Good | Light Green | Bien optimizado, mejoras menores posibles |
| 50-69 | Needs Work | Orange | Oportunidades significativas |
| 30-49 | Poor | Red/Orange | Problemas que afectan ranking |
| 0-29 | Critical | Red | Problemas fundamentales |

### Factores y Pesos

| Categoria | Peso | Factores |
|---|---|---|
| **Content Quality** | 30% | Content length (por tipo de pagina), keyword density (0.5-3%), keyword en primer parrafo, distribucion de keyword, readability (Flesch > 60) |
| **Meta Elements** | 20% | Title tag (50-60 chars, keyword al inicio), meta description (120-157 chars, keyword), canonical tag, robots directives |
| **Structure** | 15% | H1 unico con keyword, jerarquia H2/H3, subheadings cada 250-300 palabras, URL structure (< 60 chars, keyword) |
| **Links** | 12% | Internal links (min 1, dofollow), external links, affiliate links con rel="sponsored" |
| **Media** | 8% | Imagenes con alt text (keyword en 30-75%), formato WebP/AVIF, lazy loading |
| **Schema** | 8% | Tipo correcto por pagina, propiedades requeridas, BreadcrumbList |
| **Technical** | 5% | Viewport meta, page weight, CSS/JS optimizacion |
| **Social** | 2% | OG tags (title, type, image, url), Twitter Card |

### Umbrales por Tipo de Pagina

| Factor | Homepage | Category | Product | Blog Article | Legal |
|---|---|---|---|---|---|
| Content length (min) | 400 words | 200 words | 300 words | 1,500 words | 500 words |
| Content length (optimo) | 400-800 | 200-400 | 300-500 | 1,500-2,500 | 500-1,000 |
| Internal links (min) | Links a todas las categorias | Productos + categorias relacionadas | Categoria + relacionados | 5-10+ | Links a home + legal |
| Images (min) | Hero + category thumbnails | Product thumbnails | 1 imagen grande | 4+ imagenes | No critico |
| Schema tipo | Organization, WebSite | CollectionPage, ItemList | Product (snippet, NO Merchant), Review | Article/BlogPosting | WebPage |
| External links | Opcional | No critico | Amazon (rel="sponsored") | 2-5 citas (dofollow) | Reguladores |

### Factores Especificos de Affiliate Sites
- Amazon links DEBEN tener `rel="sponsored"` → Red si falta
- Disclaimer de afiliado visible en paginas de producto → Red si falta
- Product schema tipo "snippet" (NO Merchant Listing) → Red si incorrecto
- No keyword stuffing en alt text de imagenes (> 75% con keyword = over-optimization)

### Integracion en Pipeline
1. **Post-build:** Astro genera HTML → seo-scorer analiza cada pagina → scores en DB
2. **Dashboard:** Score promedio por site, peores paginas, sugerencias de mejora
3. **Sites detail:** Score por pagina individual con desglose de factores
4. **Alertas:** Sites con score < 50 generan alerta en Dashboard
5. **ContentGenerator feedback:** scores bajos pueden disparar regeneracion de contenido

### Modelo de Datos

```
seo_scores:
  id, site_id, page_path, page_type
  overall_score (0-100), grade (excellent/good/needs_work/poor/critical)
  content_quality_score, meta_elements_score, structure_score
  links_score, media_score, schema_score, technical_score, social_score
  factors (jsonb) — detalle por factor individual
  suggestions (jsonb) — mejoras accionables
  created_at, build_id
```

### Implementacion
- Package: `packages/seo-scorer/`
- Factores modulares (un archivo por categoria)
- HTML parsing con `cheerio`
- Readability con `flesch` / `text-readability`
- Config de umbrales por tipo de pagina
- Zero external dependencies en runtime (solo analisis de HTML string)

> Research completo con umbrales exactos (basados en Yoast open-source + Rank Math + First Page Sage ranking factors): `docs/research/seo-scoring-research.md`

---

## Arquitectura de Infraestructura

```
                    TAILSCALE (red privada)
                    ┌─────────────────────────────────┐
                    │                                 │
                    │  VPS 1 — Monster (privado)      │
                    │  ┌───────────────────────────┐  │
                    │  │ Next.js 15 (admin panel)   │  │
                    │  │ BullMQ workers             │  │
                    │  │ Astro build (generator)    │  │
                    │  │ Agent SDK (Monster, Niche) │  │
                    │  └──────────┬────────────────┘  │
                    │             │ rsync via SSH      │
                    │             ▼                    │
                    │  VPS 2 — Sites (publico)         │
                    │  ┌───────────────────────────┐  │
                    │  │ Caddy (reverse proxy)     │  │
                    │  │ Sites estaticos            │  │
                    │  │ Auto-SSL (Let's Encrypt)   │  │
                    │  └───────────────────────────┘  │
                    └─────────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │  Supabase Cloud (publico)   │
                    │  PostgreSQL + Auth + Storage │
                    │  Analytics (POST directo)    │
                    └─────────────────────────────┘
```

- **VPS 1 (Monster)**: admin panel, generation engine, AI agents, queue workers. Solo accesible via Tailscale.
- **VPS 2 (Sites)**: Caddy sirviendo sites estaticos. IP publica, dominios apuntando aqui.
- **Supabase Cloud**: DB compartida, accesible desde ambos VPS y desde los sites (analytics via anon key + RLS).
- **Comunicacion VPS 1 → VPS 2**: rsync via SSH sobre Tailscale (red interna, sin exponer SSH publico).
- **Analytics flow**: sites publicos → POST directo a Supabase Cloud (no pasa por VPS 1).

---

## Analisis de Deployment — Sites Generados

### Opcion A: Netlify (Free Tier)
| Aspecto | Detalle |
|---------|---------|
| Coste | $0/mes (free tier) |
| Limite | 500 sites, 100GB bandwidth compartido |
| SSL | Automatico |
| Deploy | API push (ya implementado en tsa-monster) |
| Custom domains | Si, con DNS config manual |
| Riesgo | Suspension si se excede bandwidth. A 100 sites con trafico real → ~45-100GB/mes |

### Opcion B: Hetzner VPS + Caddy
| Aspecto | Detalle |
|---------|---------|
| Coste CX22 | €3.79/mes (2 vCPU, 4GB RAM, 40GB SSD, 20TB traffic) |
| Coste CX32 | €6.80/mes (4 vCPU, 8GB RAM, 80GB SSD, 20TB traffic) |
| Capacidad | Un CX22 sirve comodamente 200+ sites estaticos |
| SSL | Automatico via Caddy (Let's Encrypt) |
| Deploy | rsync/scp + reload Caddy config |
| Custom domains | DNS apuntando al VPS, Caddy auto-configura |
| Bandwidth | 20TB incluidos — practicamente ilimitado |

### Comparativa de Costes a Escala

| Sites | Netlify Free | Netlify Pro | Hetzner CX22 | Hetzner CX32 |
|-------|-------------|-------------|---------------|---------------|
| 10 | $0 | $19 | €3.79 | €6.80 |
| 50 | $0 | $19 | €3.79 | €6.80 |
| 100 | $0 (riesgo BW) | $19+ | €3.79 | €6.80 |
| 200 | Excede free | $19++ | €3.79 | €6.80 |
| 500 | N/A | $19+++ | €7.58 (x2) | €6.80 |

### Recomendacion: Hetzner VPS + Caddy

**Razon:** coste fijo predecible, 20TB de trafico, control total, sin riesgo de suspension. A 100+ sites, Netlify free se queda corto y Pro no compensa. Un CX22 a €3.79/mes maneja 200+ sites estaticos sin despeinarse.

**Complejidad adicional:** necesitamos un servicio de deployment que:
1. Suba archivos al VPS (rsync via SSH)
2. Configure el virtualhost en Caddy (API de Caddy o config file)
3. Apunte DNS del dominio al VPS
4. Caddy auto-gestiona SSL con Let's Encrypt

---

## AI Agents

### Agentes con Agent SDK (interactivos, autonomos)

Usan `@anthropic-ai/claude-agent-sdk`. Tienen acceso a built-in tools (WebSearch, WebFetch, Bash, etc.) y custom tools via MCP. Plan Pro ($20/mes).

#### 1. Monster (Chat Agent)
- Interfaz: `ClaudeSDKClient` con streaming para chat en tiempo real
- Acceso a todos los datos via MCP server custom (Supabase queries)
- System prompt con schema de datos + resumen del portfolio
- Tools: WebSearch, WebFetch, custom MCP tools (query sites, analytics, deploy)
- Capacidades: consultas, recomendaciones, acciones (crear/pausar/optimizar sites)
- Historial: conversaciones persistentes en Supabase

#### 2. NicheResearcher
- Interfaz: `query()` con `maxTurns` limit, ejecutado en BullMQ job
- Input: idea de nicho + mercado
- Proceso autonomo en background
- Tools:
  - DataForSEO Labs API (keyword research, competitor analysis, search intent)
  - DataForSEO SERP API (SERPs reales de Google)
  - DataForSEO Keywords Data (search volume, CPC, trends)
  - DataForSEO Merchant API (Amazon product search/availability)
  - Spaceship API (domain availability check)
  - WebSearch, WebFetch (complementario)
- Output: informe con score de viabilidad, keywords, categorias sugeridas, estimacion de ingresos, dominios disponibles
- **Restriccion: NUNCA ejecuta compras de dominio. Solo verifica disponibilidad. La compra requiere aprobacion explicita del usuario.**
- Resultado streamed a Supabase conforme avanza

### Agentes con Claude API (generacion de contenido en batch)

Usan `@anthropic-ai/sdk` con structured outputs (Zod schemas). Ejecutados en BullMQ jobs.

#### 3. ContentGenerator
- Genera todo el contenido de un site TSA via API calls en batch:
  - Textos SEO por categoria (~400 palabras)
  - Descripciones de producto detalladas
  - Pros y contras por producto
  - Resumen de opiniones
  - Texto de homepage
  - Meta descriptions
- Usa structured outputs para formato consistente
- Model: `claude-sonnet-4-6` (optimo coste/calidad para contenido)
- Optimizado para SEO transaccional y conversion (no informativo, no reviews)

#### 4. ContentOptimizer (Phase 2+)
- Analiza contenido existente vs metricas de rendimiento
- Sugiere mejoras de copy, keywords, estructura

#### 5. PerformanceMonitor (Phase 2+)
- Monitorea metricas de todos los sites
- Alertas: caida de trafico, site sin visitas, errores
- Sugiere acciones: pausar, optimizar, redesplegar

---

## Roadmap por Fases

### Phase 1: Foundation MVP
**Scope:** Solo sites TSA. Infraestructura extensible.

**Features:**
- Admin panel (Next.js 15 + Supabase):
  - Dashboard con KPIs del portfolio
  - CRUD de sites TSA
  - Vista detalle de site con categorias y productos
  - Settings basicos
- Site generation engine:
  - 3 templates Astro (classic, modern, minimal)
  - Pipeline: nicho → categorias → productos → contenido AI → build → deploy
  - Product refresh pipeline (cron): DataForSEO → diff → rebuild si cambios → redeploy
  - Alertas de producto (unavailable, categoria vacia, site degradado)
- Deployment a Hetzner VPS + Caddy
- SEO Scorer: score 0-100 por pagina post-build, umbrales por tipo, alertas en dashboard
- Sistema de analytics embebido (tracking script + dashboard)
- Monster Chat (agente conversacional con contexto del portfolio)
- Research Lab (investigacion autonoma de nichos)
- AI agents: NicheResearcher + ContentGenerator

**Arquitectura extensible:**
- Site type como concepto abstracto (TSA = primera implementacion)
- Templates organizados por tipo de site
- Content generation pipeline configurable por tipo
- Analytics generico (no acoplado a TSA)

**Gate:**
- 50%+ de TSA sites generan $30+/mes en mes 3
- 3+ sites en $100+/mes
- Coste por site <= $2.75/mes
- NicheResearcher + ContentGenerator operativos

### Phase 2: Multi-Type + Optimization
- AdSense blogs + Multi-Affiliate site types
- ContentOptimizer agent
- PerformanceMonitor agent
- SEO monitoring avanzado
- **Gate:** 3+ sites en $100+/mes, 2+ tipos de site en produccion

### Phase 3: Scale
- 5-7 tipos de site
- Agentes semi-autonomos
- Target: $5-10k/mes
- Advanced analytics con predicciones AI

---

## Modelo de Datos (Supabase)

### Core
- `sites` — site principal (tipo, nicho, mercado, dominio, estado, config)
- `site_types` — tipos de site (TSA, AdSense, etc.) — extensible
- `site_templates` — templates Astro disponibles por tipo
- `categories` — categorias de un site (TSA: categorias de producto)
- `products` — productos de Amazon (ASIN, precio, imagen, datos AI, availability, last_checked_at, price_history jsonb)
- `product_alerts` — alertas de producto (product_id, site_id, type: unavailable|category_empty|site_degraded, status: open|resolved, created_at)
- `category_products` — pivot table con posicion

### Analytics
- `analytics_events` — eventos raw (pageview, click, etc.)
- `analytics_daily` — agregados diarios por site + page

### SEO
- `seo_scores` — scores por pagina (site_id, page_path, page_type, overall_score, grade, category scores, factors jsonb, suggestions jsonb, build_id)

### AI
- `research_sessions` — sesiones de investigacion de nichos
- `research_results` — resultados de NicheResearcher
- `chat_conversations` — conversaciones con Monster
- `chat_messages` — mensajes individuales
- `ai_jobs` — trabajos de AI en cola (estado, resultado, coste)

### Finances
- `costs` — costes registrados (tipo, categoria, monto, moneda, periodicidad, site_id nullable, fecha)
- `cost_categories` — categorias de coste (hosting, domains, ai, tools, other)
- `revenue_amazon` — earnings de Amazon Associates (sync via API: date, site_id, clicks, items_ordered, earnings, market)
- `revenue_adsense` — earnings de AdSense (sync via API: date, site_id, earnings, clicks, impressions, rpm) — Phase 2+
- `revenue_manual` — ingresos manuales (source, site_id, amount, date, notes)
- `revenue_daily` — agregados diarios de todas las fuentes (site_id, date, total_revenue, breakdown jsonb)

### System
- `deployments` — historial de deployments por site
- `domains` — dominios gestionados (nombre, registrar, fecha_compra, fecha_expiracion, coste_anual, site_id, dns_status, spaceship_id)
- `settings` — configuracion global y por usuario

---

## Decisiones Tomadas

1. **Monetizacion:** Sites separados por tipo. Un site = un modelo de monetizacion.
2. **Taxonomy:** Supabase (DB). Queryable, relacional, integrado.
3. **Deployment sites:** Hetzner VPS + Caddy (ver analisis arriba).
4. **Analytics:** Tracking propio ligero, sin cookies, GDPR-friendly.
5. **Dominios:** Spaceship.com via API REST. Registro + DNS automatizado.
6. **Agent autonomy:** Semi-autonomo. Agentes proponen, usuario aprueba. Cualquier accion con coste real (compra de dominio, suscripciones) requiere aprobacion explicita. Sin excepciones.
7. **Amazon data source:** DataForSEO Merchant API. Cubre los 10 mercados Amazon, datos frescos (scraping on-demand), ~$0.08/site. No requiere cuenta Amazon Associates.
8. **Research data:** DataForSEO (Labs + SERP + Keywords Data + Google Trends). Sustituye Ahrefs/SEMrush a ~$25-30/mes sin backlinks, ~$100-130/mes con backlinks. Pay-as-you-go.

## Decisiones Pendientes

1. **Multi-mercado Phase 1:** Empezar solo con ES o incluir US/UK desde el inicio?
2. **Backlinks API:** Activar DataForSEO Backlinks ($100/mes min) desde Phase 1 o posponer?
