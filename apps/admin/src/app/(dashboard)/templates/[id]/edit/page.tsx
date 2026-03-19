import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { TemplateForm } from '../../TemplateForm'
import { updateTemplate } from '../../actions'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditTemplatePage({ params }: PageProps) {
  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any
  const { data: template } = await supabase
    .from('legal_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (!template) notFound()

  const action = updateTemplate.bind(null, id)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Edit Template</h1>
      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <TemplateForm
          action={action}
          mode="edit"
          defaultValues={{
            title: template.title,
            type: template.type,
            language: template.language,
            content: template.content,
          }}
        />
      </div>
    </div>
  )
}
