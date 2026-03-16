'use client'

import { useTransition } from 'react'
import { deleteCategory } from './actions'

interface Props {
  siteId: string
  categoryId: string
  categoryName: string
}

export function DeleteCategoryButton({ siteId, categoryId, categoryName }: Props) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(`Delete category "${categoryName}"? Products will remain but won't be linked.`)) return
    startTransition(async () => {
      await deleteCategory(siteId, categoryId)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
