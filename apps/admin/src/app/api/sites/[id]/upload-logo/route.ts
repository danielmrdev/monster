import sharp from 'sharp'
import * as fs from 'fs'
import * as path from 'path'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg']

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/sites/[id]/upload-logo
 *
 * Accepts PNG or JPEG, converts to WebP via sharp, writes to
 * public/uploads/sites/[id]/logo.webp. Returns { logoUrl }.
 */
export async function POST(req: Request, { params }: Params) {
  const { id: siteId } = await params

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: 'Invalid multipart request' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json(
      { error: 'Invalid file type. PNG or JPEG required.' },
      { status: 415 }
    )
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'File too large. Maximum 5MB.' }, { status: 413 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer()

    const dir = path.join(process.cwd(), 'public', 'uploads', 'sites', siteId)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'logo.webp'), webpBuffer)

    return Response.json({ logoUrl: `/uploads/sites/${siteId}/logo.webp` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[upload-logo] siteId=${siteId} error: ${message}`)
    return Response.json({ error: 'Upload failed', detail: message }, { status: 500 })
  }
}
