export default function PreviewShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      {children}
    </div>
  )
}
