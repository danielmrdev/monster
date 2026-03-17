-- Seed 8 legal template rows: 4 types × 2 languages (es + en)
-- Idempotent: ON CONFLICT (id) DO NOTHING
-- Placeholders: {{site.name}}, {{site.domain}}, {{site.contact_email}}, {{site.affiliate_tag}}

INSERT INTO legal_templates (id, title, type, language, content) VALUES

-- ============================================================
-- PRIVACY POLICY — ES
-- ============================================================
(
  '11111111-0000-0000-0000-000000000001',
  'Política de Privacidad',
  'privacy',
  'es',
  E'# Política de Privacidad de {{site.name}}\n\nEn **{{site.name}}** ({{site.domain}}) nos comprometemos a proteger tu privacidad. Esta política describe cómo recopilamos, usamos y protegemos tu información personal.\n\n## Información que recopilamos\n\n- Datos de navegación anónimos (páginas visitadas, tiempo en el sitio)\n- Dirección IP de forma anonimizada\n- Idioma y país del navegador\n\n## Uso de la información\n\nUsamos los datos únicamente para:\n\n- Mejorar la experiencia de navegación\n- Generar estadísticas de uso agregadas\n- Optimizar el rendimiento del sitio\n\n## Programa de afiliados\n\n**{{site.name}}** participa en el Programa de Afiliados de Amazon (tag: {{site.affiliate_tag}}). Al hacer clic en enlaces de productos, se deposita una cookie de seguimiento de Amazon en tu dispositivo, sujeta a la política de privacidad de Amazon.\n\n## Derechos del usuario\n\nPuedes ejercer tus derechos de acceso, rectificación y supresión contactando a: {{site.contact_email}}\n\n## Cambios en esta política\n\nNos reservamos el derecho de actualizar esta política. La versión vigente siempre estará disponible en {{site.domain}}/privacidad.'
),

-- ============================================================
-- PRIVACY POLICY — EN
-- ============================================================
(
  '11111111-0000-0000-0000-000000000002',
  'Privacy Policy',
  'privacy',
  'en',
  E'# Privacy Policy for {{site.name}}\n\nAt **{{site.name}}** ({{site.domain}}) we are committed to protecting your privacy. This policy describes how we collect, use, and safeguard your personal information.\n\n## Information We Collect\n\n- Anonymous browsing data (pages visited, time on site)\n- Anonymised IP address\n- Browser language and country\n\n## How We Use Your Information\n\nWe use data only to:\n\n- Improve the browsing experience\n- Generate aggregated usage statistics\n- Optimise site performance\n\n## Affiliate Programme\n\n**{{site.name}}** participates in the Amazon Associates Programme (tag: {{site.affiliate_tag}}). When you click product links, an Amazon tracking cookie is placed on your device, subject to Amazon''s privacy policy.\n\n## Your Rights\n\nYou may exercise your rights of access, rectification, and erasure by contacting: {{site.contact_email}}\n\n## Changes to This Policy\n\nWe reserve the right to update this policy at any time. The current version will always be available at {{site.domain}}/privacy.'
),

-- ============================================================
-- LEGAL NOTICE / TERMS — ES
-- ============================================================
(
  '11111111-0000-0000-0000-000000000003',
  'Aviso Legal',
  'terms',
  'es',
  E'# Aviso Legal — {{site.name}}\n\n## Titular del sitio web\n\nEste sitio web, **{{site.name}}**, accesible en {{site.domain}}, es operado por su titular. Para cualquier consulta legal puedes contactar a través de: {{site.contact_email}}\n\n## Objeto y condiciones de uso\n\nEl acceso y uso de {{site.domain}} implica la aceptación de las presentes condiciones. El titular se reserva el derecho a modificar los contenidos sin previo aviso.\n\n## Propiedad intelectual\n\nTodos los contenidos de **{{site.name}}** (textos, imágenes, diseño) están protegidos por derechos de propiedad intelectual. Queda prohibida su reproducción sin autorización expresa.\n\n## Exclusión de responsabilidad\n\n**{{site.name}}** no se responsabiliza de:\n\n- Los precios, disponibilidad o características de los productos mostrados\n- Los contenidos de sitios externos enlazados\n- Interrupciones temporales del servicio\n\n## Programa de afiliados Amazon\n\nComo participante del Programa de Afiliados de Amazon (tag: {{site.affiliate_tag}}), **{{site.name}}** obtiene una comisión por las compras realizadas a través de nuestros enlaces, sin coste adicional para el comprador.\n\n## Legislación aplicable\n\nLas presentes condiciones se rigen por la legislación española y europea vigente.'
),

-- ============================================================
-- LEGAL NOTICE / TERMS — EN
-- ============================================================
(
  '11111111-0000-0000-0000-000000000004',
  'Legal Notice',
  'terms',
  'en',
  E'# Legal Notice — {{site.name}}\n\n## Website Owner\n\nThis website, **{{site.name}}**, accessible at {{site.domain}}, is operated by its owner. For any legal enquiries please contact: {{site.contact_email}}\n\n## Purpose and Terms of Use\n\nAccessing and using {{site.domain}} implies acceptance of these terms. The owner reserves the right to modify content without prior notice.\n\n## Intellectual Property\n\nAll content on **{{site.name}}** (texts, images, design) is protected by intellectual property rights. Reproduction without express authorisation is prohibited.\n\n## Disclaimer\n\n**{{site.name}}** is not responsible for:\n\n- Prices, availability, or product specifications displayed\n- Content on external linked websites\n- Temporary service interruptions\n\n## Amazon Associates Programme\n\nAs a participant in the Amazon Associates Programme (tag: {{site.affiliate_tag}}), **{{site.name}}** earns a commission on purchases made through our links at no extra cost to the buyer.\n\n## Governing Law\n\nThese terms are governed by applicable law in the owner''s country of residence.'
),

-- ============================================================
-- COOKIE POLICY — ES
-- ============================================================
(
  '11111111-0000-0000-0000-000000000005',
  'Política de Cookies',
  'cookies',
  'es',
  E'# Política de Cookies de {{site.name}}\n\n**{{site.name}}** ({{site.domain}}) utiliza cookies y tecnologías similares para mejorar tu experiencia de navegación.\n\n## ¿Qué son las cookies?\n\nLas cookies son pequeños archivos de texto que los sitios web almacenan en tu dispositivo para recordar preferencias y analizar el uso.\n\n## Cookies que utilizamos\n\n- **Cookies de análisis:** Registramos visitas y páginas vistas de forma anónima para mejorar el sitio. No identifican a usuarios individuales.\n- **Cookies de afiliados:** Al hacer clic en un enlace de Amazon (afiliado: {{site.affiliate_tag}}), Amazon deposita cookies de seguimiento en tu navegador según sus propias políticas.\n\n## Cookies de terceros\n\n**{{site.name}}** no instala cookies propias de seguimiento o publicidad. Las únicas cookies de terceros son las generadas por Amazon al acceder a sus enlaces.\n\n## Control de cookies\n\nPuedes configurar tu navegador para bloquear o eliminar cookies. Ten en cuenta que esto puede afectar a la funcionalidad del sitio.\n\n## Contacto\n\nPara cualquier consulta sobre esta política: {{site.contact_email}}'
),

-- ============================================================
-- COOKIE POLICY — EN
-- ============================================================
(
  '11111111-0000-0000-0000-000000000006',
  'Cookie Policy',
  'cookies',
  'en',
  E'# Cookie Policy for {{site.name}}\n\n**{{site.name}}** ({{site.domain}}) uses cookies and similar technologies to improve your browsing experience.\n\n## What Are Cookies?\n\nCookies are small text files that websites store on your device to remember preferences and analyse usage.\n\n## Cookies We Use\n\n- **Analytics cookies:** We record visits and page views anonymously to improve the site. They do not identify individual users.\n- **Affiliate cookies:** When you click an Amazon link (affiliate tag: {{site.affiliate_tag}}), Amazon places tracking cookies in your browser according to its own policies.\n\n## Third-Party Cookies\n\n**{{site.name}}** does not set its own tracking or advertising cookies. The only third-party cookies are those generated by Amazon when you follow our links.\n\n## Cookie Control\n\nYou can configure your browser to block or delete cookies. Please note this may affect site functionality.\n\n## Contact\n\nFor any enquiries about this policy: {{site.contact_email}}'
),

-- ============================================================
-- CONTACT PAGE — ES
-- ============================================================
(
  '11111111-0000-0000-0000-000000000007',
  'Contacto',
  'contact',
  'es',
  E'# Contacto — {{site.name}}\n\nGracias por visitar **{{site.name}}**. Si tienes alguna pregunta, sugerencia o necesitas ponerte en contacto con nosotros, puedes hacerlo a través de los siguientes medios.\n\n## Correo electrónico\n\nPuedes escribirnos a: **{{site.contact_email}}**\n\nNos comprometemos a responder en un plazo máximo de 48 horas laborables.\n\n## Sobre este sitio\n\n**{{site.name}}** ({{site.domain}}) es un sitio de recomendaciones de productos. Participamos en el Programa de Afiliados de Amazon (tag: {{site.affiliate_tag}}), lo que significa que obtenemos una pequeña comisión si realizas una compra a través de nuestros enlaces, sin coste adicional para ti.\n\n## Aviso\n\nEste sitio no vende productos directamente. Toda compra se realiza directamente en Amazon y está sujeta a las políticas y condiciones de Amazon.'
),

-- ============================================================
-- CONTACT PAGE — EN
-- ============================================================
(
  '11111111-0000-0000-0000-000000000008',
  'Contact',
  'contact',
  'en',
  E'# Contact — {{site.name}}\n\nThank you for visiting **{{site.name}}**. If you have any questions, suggestions, or need to get in touch with us, you can do so through the following channels.\n\n## Email\n\nYou can write to us at: **{{site.contact_email}}**\n\nWe aim to reply within 48 working hours.\n\n## About This Site\n\n**{{site.name}}** ({{site.domain}}) is a product recommendation site. We participate in the Amazon Associates Programme (tag: {{site.affiliate_tag}}), which means we earn a small commission if you make a purchase through our links, at no extra cost to you.\n\n## Disclaimer\n\nThis site does not sell products directly. All purchases are made directly on Amazon and are subject to Amazon''s policies and terms of service.'
)

ON CONFLICT (id) DO NOTHING;
