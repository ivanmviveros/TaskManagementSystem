import { useState } from "react";

import type { UserListSearch } from "../../../app/search-params";
import { useAppForm } from "../../../components/form/app-form";
import type { SelectOption } from "../../../components/form/fields/SelectField";
import { useUrlFieldSync } from "../../../lib/useUrlFieldSync";
import { ROLE_LABEL, ROLES, type Role } from "../../auth/types";

/** What this panel edits. Paging belongs to the list. */
export type UserFilterPatch = Partial<Pick<UserListSearch, "role" | "is_active" | "search">>;

/** The panel's fields, shaped for its inputs: "" is "All roles". */
type UserFilterDraft = { search: string; role: Role | ""; inactiveOnly: boolean };

const ROLE_OPTIONS: readonly SelectOption<Role | "">[] = [
  { value: "", label: "All roles" },
  ...ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
];

interface UserFiltersProps {
  filters: Pick<UserListSearch, "role" | "is_active" | "search">;
  /** A patch, not a snapshot: typed text commits up to 300 ms later (D46). */
  onChange: (patch: UserFilterPatch) => void;
}

export function UserFilters({ filters, onChange }: UserFiltersProps) {
  const committed: UserFilterDraft = {
    search: filters.search ?? "",
    role: filters.role ?? "",
    inactiveOnly: filters.is_active === false,
  };
  // D81: the URL as it was on mount. After that, useUrlFieldSync carries every
  // URL change into the fields.
  const [defaults] = useState(() => committed);
  const form = useAppForm({ defaultValues: defaults });

  // Typed text goes through a draft: the router's transition would revert a
  // controlled input bound straight to the URL (D50).
  const search = useUrlFieldSync({
    committed: committed.search,
    commit: (value: string) => onChange({ search: value === "" ? undefined : value }),
    write: (value) => form.setFieldValue("search", value, { dontRunListeners: true }),
  });
  const role = useUrlFieldSync({
    committed: committed.role,
    commit: (value: Role | "") => onChange({ role: value === "" ? undefined : value }),
    write: (value) => form.setFieldValue("role", value, { dontRunListeners: true }),
    delayMs: 0,
  });
  const inactiveOnly = useUrlFieldSync({
    committed: committed.inactiveOnly,
    commit: (on: boolean) => onChange({ is_active: on ? false : undefined }),
    write: (value) => form.setFieldValue("inactiveOnly", value, { dontRunListeners: true }),
    delayMs: 0,
  });

  return (
    <section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form.AppField name="search" listeners={{ onChange: ({ value }) => search.onChange(value) }}>
          {(field) => <field.TextField id="search" label="Search" type="search" density="compact" />}
        </form.AppField>
        <form.AppField name="role" listeners={{ onChange: ({ value }) => role.onChange(value) }}>
          {(field) => (
            <field.SelectField id="role-filter" label="Role" options={ROLE_OPTIONS} density="compact" />
          )}
        </form.AppField>
        <form.AppField
          name="inactiveOnly"
          listeners={{ onChange: ({ value }) => inactiveOnly.onChange(value) }}
        >
          {(field) => <field.CheckboxField label="Inactive only" density="compact" />}
        </form.AppField>
      </div>
    </section>
  );
}
