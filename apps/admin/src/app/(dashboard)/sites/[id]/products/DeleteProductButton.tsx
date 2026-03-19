"use client";

import { useTransition } from "react";
import { deleteProduct } from "./actions";

interface Props {
  siteId: string;
  productId: string;
  asin: string;
}

export function DeleteProductButton({ siteId, productId, asin }: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Delete product ${asin}? This action cannot be undone.`)) return;
    startTransition(async () => {
      await deleteProduct(siteId, productId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
