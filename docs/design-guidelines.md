# Design Guidelines — HR Management System

UI/UX standards for consistent, accessible, and responsive interfaces.

---

## Color System

### Primary Colors

| Color | Hex | Usage | Tailwind Class |
|-------|-----|-------|---|
| **Indigo** | #4F46E5 | Buttons, links, active states | `bg-indigo-600`, `text-indigo-600` |
| **Indigo Light** | #818CF8 | Hover states, accents | `bg-indigo-500`, `hover:bg-indigo-700` |
| **Indigo Dark** | #312E81 | Pressed states, focus | `bg-indigo-900` |

### Neutral Colors

| Color | Hex | Usage | Tailwind Class |
|-------|-----|-------|---|
| **White** | #FFFFFF | Backgrounds, cards | `bg-white` |
| **Gray 50** | #F9FAFB | Light backgrounds | `bg-gray-50` |
| **Gray 100** | #F3F4F6 | Borders, dividers | `border-gray-100` |
| **Gray 200** | #E5E7EB | Secondary borders | `border-gray-200` |
| **Gray 400** | #9CA3AF | Disabled states | `text-gray-400` |
| **Gray 600** | #4B5563 | Secondary text | `text-gray-600` |
| **Gray 900** | #111827 | Primary text | `text-gray-900` |

### Semantic Colors

| Purpose | Color | Tailwind |
|---------|-------|----------|
| **Success** | Green 500 | `bg-green-500`, `text-green-600` |
| **Warning** | Amber 500 | `bg-amber-500`, `text-amber-600` |
| **Error** | Red 500 | `bg-red-500`, `text-red-600` |
| **Info** | Blue 500 | `bg-blue-500`, `text-blue-600` |

Example:
```typescript
// Button variants
const buttonVariants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-900',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-green-600 text-white hover:bg-green-700',
};
```

---

## Typography

### Font Family

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
  'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

### Font Sizes & Scales

| Scale | Size | Line Height | Usage | Tailwind |
|-------|------|-------------|-------|----------|
| **XS** | 12px | 16px | Captions, labels | `text-xs` |
| **SM** | 14px | 20px | Helper text, meta | `text-sm` |
| **Base** | 16px | 24px | Body text, default | `text-base` |
| **LG** | 18px | 28px | Subheadings | `text-lg` |
| **XL** | 20px | 28px | Section headers | `text-xl` |
| **2XL** | 24px | 32px | Page titles | `text-2xl` |
| **3XL** | 30px | 36px | Major headings | `text-3xl` |

### Font Weights

| Weight | Value | Usage | Tailwind |
|--------|-------|-------|----------|
| **Regular** | 400 | Body text, default | `font-normal` |
| **Medium** | 500 | Emphasis, labels | `font-medium` |
| **Semibold** | 600 | Subheadings, buttons | `font-semibold` |
| **Bold** | 700 | Page titles, highlights | `font-bold` |

Example:
```typescript
// Page title
<h1 className="text-3xl font-bold text-gray-900">Employees</h1>

// Section subheading
<h2 className="text-xl font-semibold text-gray-800">Active Employees</h2>

// Button text
<button className="text-base font-medium">Save Changes</button>

// Body text
<p className="text-base text-gray-600">No employees found</p>
```

---

## Spacing System

Consistent spacing based on 4px base unit:

| Scale | Pixels | Tailwind | Usage |
|-------|--------|----------|-------|
| **0** | 0 | `p-0`, `m-0` | Remove spacing |
| **1** | 4px | `p-1`, `gap-1` | Tight spacing |
| **2** | 8px | `p-2`, `gap-2` | Small gaps |
| **3** | 12px | `p-3` | Small padding |
| **4** | 16px | `p-4`, `gap-4` | Default padding |
| **6** | 24px | `p-6`, `gap-6` | Section spacing |
| **8** | 32px | `p-8` | Large spacing |

Example:
```typescript
// Card with consistent internal spacing
<div className="p-6 bg-white rounded-lg shadow">
  {/* Gap between elements */}
  <div className="flex flex-col gap-4">
    <h2 className="text-xl font-semibold">Title</h2>
    <p className="text-gray-600">Description</p>
  </div>
</div>

// Page-level spacing
<div className="flex flex-col gap-6">
  <Card />
  <Card />
</div>
```

---

## Buttons

### Button Variants

```typescript
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}
```

### Button Styles

```typescript
const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-900 disabled:bg-gray-300',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:bg-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300',
  ghost: 'text-indigo-600 hover:bg-indigo-50 disabled:text-gray-400',
};

const sizes = {
  sm: 'px-3 py-1 text-sm rounded',
  md: 'px-4 py-2 text-base rounded',
  lg: 'px-6 py-3 text-lg rounded',
};
```

### Button Examples

```typescript
// Primary button
<Button variant="primary" size="md">
  Save Changes
</Button>

// Danger button (delete)
<Button variant="danger" size="sm">
  Delete
</Button>

// Ghost button (secondary action)
<Button variant="ghost">
  Cancel
</Button>

// Loading state
<Button loading>
  Saving...
</Button>

// Full-width button
<Button fullWidth>
  Submit
</Button>
```

---

## Forms & Inputs

### Input Styles

```typescript
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  required,
  ...props
}) => (
  <div className="flex flex-col gap-2">
    {label && (
      <label className="text-sm font-medium text-gray-900">
        {label}
        {required && <span className="text-red-600">*</span>}
      </label>
    )}
    <input
      className={cn(
        'px-4 py-2 border rounded-lg bg-white text-gray-900',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
        'disabled:bg-gray-50 disabled:text-gray-400',
        error && 'border-red-500 focus:ring-red-500',
        !error && 'border-gray-200'
      )}
      {...props}
    />
    {error && <p className="text-sm text-red-600">{error}</p>}
    {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
  </div>
);
```

### Form Layout

```typescript
// Vertical stack (default)
<form className="flex flex-col gap-4">
  <Input label="Email" type="email" required />
  <Input label="Password" type="password" required />
  <Button>Login</Button>
</form>

// Two-column layout
<form className="grid grid-cols-2 gap-4">
  <Input label="First Name" />
  <Input label="Last Name" />
  <Input label="Email" className="col-span-2" />
</form>
```

---

## Tables

### Table Structure

```typescript
export const Table: React.FC<{ columns: Column[]; data: any[] }> = ({
  columns,
  data,
}) => (
  <div className="overflow-x-auto bg-white rounded-lg shadow">
    <table className="w-full text-left text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className="px-6 py-3 text-gray-900 font-semibold text-xs"
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, idx) => (
          <tr
            key={idx}
            className="border-b border-gray-100 hover:bg-gray-50 transition"
          >
            {columns.map((col) => (
              <td key={col.key} className="px-6 py-4 text-gray-900">
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
```

### Table Examples

```typescript
// Employees table
<Table
  columns={[
    { key: 'code', label: 'Code' },
    { key: 'fullName', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'department', label: 'Department' },
    { key: 'role', label: 'Role' },
  ]}
  data={employees}
/>
```

---

## Cards & Containers

### Card Component

```typescript
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn('bg-white rounded-lg shadow p-6', className)}>
    {children}
  </div>
);

// With sections
export const CardHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="pb-4 border-b border-gray-200">
    {children}
  </div>
);

export const CardBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="pt-4">
    {children}
  </div>
);
```

### Card Examples

```typescript
// Simple card
<Card>
  <h2 className="text-xl font-semibold">Statistics</h2>
  <p className="text-gray-600">150 total employees</p>
</Card>

// Card with sections
<Card>
  <CardHeader>
    <h2 className="text-xl font-semibold">Pending Approvals</h2>
  </CardHeader>
  <CardBody>
    <div className="flex flex-col gap-4">
      {approvals.map((approval) => (
        <div key={approval.id} className="p-4 bg-gray-50 rounded">
          {approval.title}
        </div>
      ))}
    </div>
  </CardBody>
</Card>
```

---

## Modals & Dialogs

### Modal Component

```typescript
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black opacity-50"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
```

### Modal Examples

```typescript
// Confirmation dialog
const [isOpen, setIsOpen] = useState(false);

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Delete Employee"
  footer={
    <>
      <Button variant="secondary" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleDelete}>
        Delete
      </Button>
    </>
  }
>
  <p className="text-gray-600">
    Are you sure you want to delete this employee? This action cannot be undone.
  </p>
</Modal>
```

---

## Alerts & Notifications

### Alert Component

```typescript
export interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  type,
  title,
  children,
  onClose,
}) => {
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  return (
    <div className={cn('border rounded-lg p-4', styles[type])}>
      {title && <h3 className="font-semibold">{title}</h3>}
      <p className="text-sm">{children}</p>
      {onClose && (
        <button onClick={onClose} className="text-sm underline mt-2">
          Dismiss
        </button>
      )}
    </div>
  );
};
```

### Alert Examples

```typescript
// Success
<Alert type="success" title="Success">
  Employee created successfully.
</Alert>

// Error
<Alert type="error" title="Error">
  Failed to save employee. Please try again.
</Alert>

// Info
<Alert type="info">
  3 pending approvals awaiting your action.
</Alert>
```

---

## Loading States

### Spinner Component

```typescript
export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({
  size = 'md',
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className={cn(sizes[size], 'animate-spin')}>
      <svg
        className="w-full h-full text-indigo-600"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v0a8 8 0 100 16v0a8 8 0 00-8-8z"
        />
      </svg>
    </div>
  );
};
```

---

## Badge Component

```typescript
export interface BadgeProps {
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'gray';
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'primary',
  children,
}) => {
  const styles = {
    primary: 'bg-indigo-100 text-indigo-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
    gray: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={cn('inline-block px-3 py-1 text-xs font-medium rounded-full', styles[variant])}>
      {children}
    </span>
  );
};
```

### Badge Examples

```typescript
// Status badges
<Badge variant="success">Approved</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Rejected</Badge>

// Role badges
<Badge>Admin</Badge>
<Badge>HR</Badge>
```

---

## Responsive Design

### Breakpoints

```typescript
// Tailwind breakpoints (default)
sm: '640px',   // Phones: >= 640px
md: '768px',   // Tablets: >= 768px
lg: '1024px',  // Desktops: >= 1024px
xl: '1280px',  // Large: >= 1280px
2xl: '1536px', // Extra large: >= 1536px
```

### Mobile-First Approach

```typescript
// Mobile first (base styles apply to all screens)
// Then override at larger breakpoints

// Stack on mobile, 2-column on tablet, 3-column on desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <Card />
  <Card />
  <Card />
</div>

// Hide on mobile, show on tablet+
<div className="hidden md:block">
  <Sidebar />
</div>

// Full width on mobile, max-width on larger screens
<div className="w-full max-w-4xl mx-auto px-4">
  Content
</div>
```

---

## Accessibility

### WCAG 2.1 AA Compliance

- **Color Contrast**: Text must have 4.5:1 contrast ratio (AA)
- **Focus Indicators**: All interactive elements have visible focus state
- **Keyboard Navigation**: All functionality accessible via keyboard
- **ARIA Labels**: Form inputs, buttons have proper labels/descriptions
- **Semantic HTML**: Use `<button>`, `<input>`, `<label>` tags correctly

Example:
```typescript
// Good: Semantic HTML + ARIA
<form>
  <label htmlFor="email">Email Address</label>
  <input
    id="email"
    type="email"
    aria-required="true"
    aria-invalid={!!error}
    aria-describedby={error ? 'email-error' : undefined}
  />
  {error && <p id="email-error">{error}</p>}
</form>

// Good: Focus indicator
<button className="focus:outline-none focus:ring-2 focus:ring-indigo-500">
  Action
</button>
```

---

## Dark Mode (Future)

Reserve Tailwind's dark: prefix for future dark mode support:

```typescript
// Prepare for dark mode (not active yet)
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  Content
</div>
```

---

## Icons

Use system icons or Heroicons (recommended):

```typescript
// SVG icon component
export const IconCheck = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

// Usage in component
<Button>
  <IconCheck className="mr-2" />
  Save
</Button>
```

---

## Animation Principles

- **Duration**: 150-300ms for UI interactions (no longer)
- **Easing**: `ease-out` for scale/fade, `ease-in-out` for movement
- **Avoid**: Excessive animations; keep focus on usability

Example:
```typescript
// Fade in
className="transition-opacity duration-200 opacity-0 hover:opacity-100"

// Scale
className="transition-transform duration-150 scale-100 hover:scale-105"

// Slide
className="transition-all duration-200 translate-x-0 group-hover:translate-x-2"
```

---

## Component Checklist

When creating new UI components:

- [ ] Follows color system (indigo primary, gray neutral)
- [ ] Responsive (mobile-first, tested on sm/md/lg breakpoints)
- [ ] Accessible (WCAG AA, focus indicators, ARIA labels)
- [ ] Consistent spacing (uses 4px unit system)
- [ ] Proper typography (font size, weight, line height)
- [ ] Error states (visual feedback for invalid input)
- [ ] Loading states (spinner or skeleton)
- [ ] Disabled states (reduced opacity, no cursor-pointer)
- [ ] Props typed (TypeScript, not `any`)
- [ ] Documented (JSDoc comments, Storybook optional)

---

## Implementation Example: Employee Form

```typescript
export const CreateEmployeeModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [formData, setFormData] = useState<CreateEmployeeDto>({
    fullName: '',
    email: '',
    role: 'employee',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await EmployeeService.create(formData);
      onClose();
    } catch (err) {
      setErrors({ submit: 'Failed to create employee' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Employee"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={loading} onClick={handleSubmit}>
            Create
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4">
        {errors.submit && (
          <Alert type="error">{errors.submit}</Alert>
        )}
        
        <Input
          label="Full Name"
          required
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
          error={errors.fullName}
        />
        
        <Input
          label="Email"
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={errors.email}
        />
        
        <Select
          label="Role"
          value={formData.role}
          onChange={(role) => setFormData({ ...formData, role })}
          options={[
            { value: 'employee', label: 'Employee' },
            { value: 'manager', label: 'Manager' },
            { value: 'hr', label: 'HR' },
          ]}
        />
      </form>
    </Modal>
  );
};
```

This demonstrates:
- Consistent spacing (gap-4)
- Proper color usage (indigo primary)
- Error handling (Alert component)
- Loading state (Button loading)
- Form validation
- Modal structure
- Accessible labels
