"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import ProvisionModal from "./ProvisionModal";

export default function ProvisionSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      {!open && (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-4" data-icon="inline-start" />
          Provision New Server
        </Button>
      )}
      <ProvisionModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
