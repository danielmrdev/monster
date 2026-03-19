# BuilderMonster — Vision & Financial Modeling

> Ultima actualizacion: 2026-03-13

---

## Concepto

Un unico panel de control desde el que gestionar el ciclo de vida completo de una cartera de sitios web: generacion, optimizacion, despliegue y mantenimiento continuo. La IA es el motor central — genera contenido, imagenes, propone nichos, recomienda mejoras, y mantiene los sites actualizados. El objetivo es posicionar los sites lo mas alto y rapido posible en buscadores.

No se vende la plataforma — se generan ingresos pasivos explotando la cartera de sites propia.

### Pilares

1. **Un panel, todo el control.** Generacion, monitoring, finanzas, research, chat con IA — sin salir del admin panel.
2. **AI-first.** La IA no es un complemento: genera contenido, imagenes, investiga nichos, puntua SEO, sugiere mejoras, y mantiene los datos al dia. El usuario decide y aprueba; la IA ejecuta.
3. **SEO maximo desde el primer dia.** Cada pagina generada esta optimizada para rankear: estructura, contenido, meta tags, schema, velocidad, readability. SEO Scorer valida que todo cumpla antes de desplegar.
4. **Mantenimiento autonomo.** Los sites no se abandonan post-deploy: refresh de productos, actualizacion de precios/disponibilidad, alertas de degradacion, y re-deploy automatico.

### Evolucion

Proyecto previo validado: `tsa-monster` (Laravel + FilamentPHP + Astro.js, sites TSA en produccion). BuilderMonster es la evolucion: stack moderno (Next.js 15 + Supabase + Astro.js), agentes AI nativos (Claude Agent SDK + Claude API), arquitectura extensible a multiples tipos de site.

---

## Site Types & Monetizacion

| Tipo                   | Monetizacion             | Dificultad | Success Rate | ROI/site/mes |
| ---------------------- | ------------------------ | ---------- | ------------ | ------------ |
| TSA (Amazon Affiliate) | Comision 2-10%           | Media      | 40-50%       | $50-200      |
| AdSense Blogs          | CPM $0.25-4/1k views     | Media-Alta | 35-45%       | $30-150      |
| Multi-Affiliate        | Comisiones SaaS 15-40%   | Media      | 45-55%       | $100-300     |
| Lead Gen               | $1-50 por lead           | Alta       | 30-40%       | $100-500     |
| Newsletter             | Sponsorship + affiliate  | Muy Alta   | 20-30%       | $200-1k      |
| Micro SaaS             | Tool sales (100% margen) | Muy Alta   | 15-25%       | $500-2k      |

---

## Coste por Site (Revisado — Hetzner)

### Costes Fijos de Infraestructura

| Componente                               | Coste/mes                                           |
| ---------------------------------------- | --------------------------------------------------- |
| Anthropic Plan Pro                       | $20 (Agent SDK + API. Upgrade a Max si rate limits) |
| Hetzner CX22 (200+ sites)                | €3.79                                               |
| DataForSEO (SEO research, sin backlinks) | ~$25-30                                             |
| DataForSEO Backlinks (opcional)          | $100 (saldo consumible en cualquier API)            |
| Supabase Free tier (admin)               | $0                                                  |
| Upstash Redis (queue)                    | $0 (free tier: 10k commands/day)                    |
| **Total infra (sin backlinks)**          | **~$50/mes**                                        |
| **Total infra (con backlinks)**          | **~$150/mes**                                       |

### Coste Variable por Site

| Componente                                          | Coste                             |
| --------------------------------------------------- | --------------------------------- |
| AI generacion contenido                             | $0 (incluido en Plan Max)         |
| Dominio (.com anual / 12)                           | ~$0.85/mes                        |
| Hosting (amortizado en VPS)                         | ~$0.02/mes (200 sites en CX22)    |
| DataForSEO Amazon data (setup, ~50 products)        | ~$0.08 (one-time)                 |
| DataForSEO product refresh (hibrida, cada 2-3 dias) | ~$2.50-5.50/mes                   |
| **Total por site**                                  | **~$3.37-6.37/mes + $0.08 setup** |

> Product refresh es el coste variable mas significativo. Estrategia hibrida: keyword search frecuente ($0.001/SERP) + ASIN lookup selectivo ($0.0015/req). Solo rebuild si hay cambios. Frecuencia configurable por site.

---

## Escenarios Financieros (Revisados)

### Conservador (50 sites, 50% success rate)

- 25 sites rentables x $92/mes = **$2,300/mes**
- Coste: $50 infra + 50 x $4/mes = **~$250/mes**
- **Beneficio neto: ~$2,050/mes → $24,600/ano**
- ROI primer ano: ~10x

### Moderado (100 sites, 50% success rate)

- 50 sites rentables x $92/mes = **$4,600/mes**
- Coste: $150 infra (con backlinks) + $200 Max + 100 x $4 = **~$750/mes**
- **Beneficio neto: ~$3,850/mes → $46,200/ano**

### Agresivo (200 sites, 55% success rate)

- 110 sites rentables x $92/mes = **$10,120/mes**
- Coste: $150 infra + $200 Max + €6.80 CX32 + 200 x $4 = **~$1,157/mes**
- **Beneficio neto: ~$8,963/mes → $107,556/ano**
- ROI primer ano: ~9x

### Break-even

- 3 sites rentables (~$276/mes) cubren infraestructura + refresh de 50 sites (~$250/mes)
- Alcanzable en los primeros 2 meses desde Phase 1

---

## Proyecciones Anuales

| Ano | Sites   | Ingresos | Coste   | Beneficio |
| --- | ------- | -------- | ------- | --------- |
| Y1  | 50-100  | $30-60k  | $3-9k   | $27-51k   |
| Y2  | 150-300 | $80-180k | $9-18k  | $71-162k  |
| Y3+ | 500+    | $250k+   | $28-35k | $215k+    |

---

## Riesgos & Mitigaciones

| Riesgo                              | Probabilidad | Impacto | Mitigacion                                          |
| ----------------------------------- | ------------ | ------- | --------------------------------------------------- |
| Google algorithm change             | Alta         | Alto    | Diversificar tipos de site, nichos long-tail        |
| Amazon affiliate ban                | Media        | Alto    | Multi-marketplace, multi-programa afiliados         |
| AI content detection / penalizacion | Media        | Medio   | Humanizacion, contenido unico por site, variaciones |
| VPS downtime                        | Baja         | Alto    | Backups automaticos, easy migration a otro VPS      |
| Competencia en nichos               | Alta         | Medio   | Nichos super-verticales, volumen de sites           |
| Cambio en comisiones Amazon         | Media        | Medio   | Diversificar a otros affiliate programs             |

---

## Success Gates por Fase

### Phase 1 Gate (mes 3)

- [ ] Pipeline completo: nicho → site desplegado en < 30 min
- [ ] 10+ sites TSA generados y desplegados
- [ ] Analytics funcionando en todos los sites
- [ ] SEO Scorer: todas las paginas generadas con score 70+ (Good o superior)
- [ ] Product refresh pipeline operativo (datos actualizados cada 2-3 dias)
- [ ] Monster Chat operativo con contexto del portfolio
- [ ] Research Lab generando informes utiles (DataForSEO + Spaceship)
- [ ] 50%+ sites TSA generan $30+/mes
- [ ] Coste/site <= $5/mes (incluye refresh de productos)

### Phase 2 Gate (mes 6)

- [ ] 2+ tipos de site en produccion
- [ ] 50+ sites en cartera
- [ ] ContentOptimizer mejora conversion en 20%+
- [ ] PerformanceMonitor detectando sites con problemas

### Phase 3 Gate (mes 12)

- [ ] $5k+/mes en ingresos recurrentes
- [ ] 5+ tipos de site activos
- [ ] Agentes con autonomia configurada funcionando
- [ ] 200+ sites operativos

---

## Decisiones Tomadas

1. **Sites separados por tipo** — un site = un modelo de monetizacion
2. **Taxonomy en Supabase** — DB relacional, queryable, integrada
3. **Hosting: Hetzner VPS + Caddy** — coste fijo, 20TB trafico, control total
4. **Analytics propio** — tracking ligero sin cookies, GDPR-friendly
5. **Stack: Next.js 15 + Supabase + Astro.js** — moderno, CC-native
6. **Dominios: Spaceship.com** — registro + DNS via API. Compra semi-auto (siempre requiere aprobacion del usuario)
7. **Agent autonomy: semi-autonomo** — agentes proponen, usuario aprueba. Acciones con coste real SIEMPRE requieren confirmacion explicita
8. **Amazon data: DataForSEO Merchant API** — 10 mercados, datos frescos, ~$0.08/site. Sin dependencia de PA-API
9. **SEO research: DataForSEO** — Labs + SERP + Keywords Data + Trends. ~$25-130/mes vs $250-500/mes de Ahrefs/SEMrush

## Decisiones Pendientes

1. **Multi-mercado Phase 1:** solo ES o incluir US/UK?
2. **Backlinks API:** activar DataForSEO Backlinks ($100/mes) desde Phase 1?
