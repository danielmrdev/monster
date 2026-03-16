# S06 UAT — Legal Page Templates

**When to run:** After deploying S06 changes and applying DB migrations.

---

## Pre-requisite: Apply DB migrations

Run on remote Supabase:
```sql
-- legal_templates table (see migration file)
-- legal_template_assignments table (see migration file)
```

---

## Test 1: Create a legal template

1. Navigate to `/templates`
2. Click **+ New Template**
3. Fill in: Title = "Privacy ES Custom", Type = "Privacy Policy", Language = "es", Content = "Custom privacy content here..."
4. Click **Create Template**
5. **Expected:** Redirected to /templates; new template appears in the Privacy Policy section
6. **Pass if:** Template is saved and listed

---

## Test 2: Edit a template

1. Click **Edit** on the template created in Test 1
2. Change the content
3. Click **Save Changes**
4. **Expected:** Redirected to /templates; changes reflected
5. **Pass if:** Updated content appears in the list

---

## Test 3: Assign a template to a site

1. Navigate to a site's edit page (`/sites/<id>/edit`)
2. Scroll to the **Legal Page Templates** section
3. Select "Privacy ES Custom" from the Privacy Policy dropdown
4. Click **Save Template Assignments**
5. **Expected:** Green "✓ Legal template assignments saved." message
6. Reload the page — the dropdown should still show the selected template
7. **Pass if:** Assignment persists across page reload

---

## Test 4: Template renders in generated site

1. With the template assigned, click **Generate Site** on the site detail page
2. Wait for generation to complete
3. Click **Preview** → navigate to the privacy page (`/privacidad`)
4. **Expected:** Page shows the custom template content, not the built-in default
5. **Pass if:** Custom content is visible

---

## Test 5: Default fallback works

1. On the same site, change Privacy Policy assignment back to "Default (built-in)"
2. Click Save Template Assignments
3. Generate the site again
4. Preview the privacy page
5. **Expected:** Original hardcoded Spanish privacy content appears
6. **Pass if:** Clearing the assignment restores the default

---

## Test 6: Delete a template

1. On /templates, delete the template created in Test 1
2. **Expected:** Template removed from list
3. **Pass if:** Template no longer appears
