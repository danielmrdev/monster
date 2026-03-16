# S03 UAT — Global Chat Sidebar

**When to run:** After deploying S03 changes.

---

## Test 1: Sidebar toggle

1. Navigate to `/dashboard`
2. Look for the "Ask Monster" button at the bottom of the left nav sidebar
3. Click it
4. **Expected:** A 340px chat panel slides in from the right side of the screen
5. Click the "Ask Monster" button again (or the X button in the chat panel header)
6. **Expected:** Panel closes
7. Reload the page
8. **Expected:** Panel remains in the same state it was when you left (open = stays open, closed = stays closed)
9. **Pass if:** Toggle works; state persists after reload

---

## Test 2: Page context in chat

1. Navigate to `/sites` — the Sites page
2. Open the chat sidebar
3. Look at the header of the chat panel
4. **Expected:** A small badge shows "Sites" (the current page context)
5. Send a message: "What am I looking at?"
6. **Expected:** The assistant's response is aware you're on the Sites page
7. Navigate to `/analytics` (with sidebar open)
8. **Expected:** Badge changes to "Analytics"; next message will have the new context
9. **Pass if:** Page context badge updates on navigation; assistant mentions the page context

---

## Test 3: Chat works from non-chat pages

1. Navigate to `/finances`
2. Open the chat sidebar
3. Ask: "Summarize my portfolio status"
4. **Expected:** Streaming response appears in the right panel — assistant responds with portfolio info
5. **Pass if:** Full conversation works (send → stream → markdown render) without navigating to /monster

---

## Test 4: /monster page unchanged

1. Navigate to `/monster`
2. **Expected:** The full-page chat page still works exactly as before
3. **Expected:** The "Monster Chat" nav item still highlights when on /monster
4. **Pass if:** Full-page chat and sidebar chat coexist without conflicts

---

## Test 5: Layout integrity

1. Open the sidebar on `/sites`
2. Scroll down in the main content area (if sites list is long enough)
3. **Expected:** Main content scrolls independently; sidebar stays fixed at full height
4. Open on mobile-width viewport (if applicable)
5. **Pass if:** No layout overflow or broken scrolling
