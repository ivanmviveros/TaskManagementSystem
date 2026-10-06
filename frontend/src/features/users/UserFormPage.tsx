import { useNavigate, useParams } from "@tanstack/react-router";

import { UserForm, type UserFormValues } from "./components/UserForm";
import { useCreateUser, useUpdateUser, useUser } from "./hooks/useUsers";

export function UserCreatePage() {
  const navigate = useNavigate();
  const create = useCreateUser();

  async function handleSubmit(values: UserFormValues) {
    await create.mutateAsync({
      email: values.email,
      password: values.password,
      first_name: values.first_name,
      last_name: values.last_name,
      role: values.role,
    });
    await navigate({ to: "/users" });
  }

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">New user</h1>
      <div className="max-w-xl rounded-lg bg-white p-4 shadow-sm sm:p-6">
        <UserForm onSubmit={handleSubmit} onCancel={() => void navigate({ to: "/users" })} />
      </div>
    </section>
  );
}

export function UserEditPage() {
  const { userId } = useParams({ from: "/shell/users/$userId" });
  const navigate = useNavigate();
  const { data: user, isPending, isError } = useUser(userId);
  const update = useUpdateUser(userId);

  if (isPending) return <p role="status">Loading user…</p>;
  if (isError || user === undefined)
    return (
      <p role="alert" className="text-status-overdue">
        Could not load that user.
      </p>
    );

  async function handleSubmit(values: UserFormValues) {
    await update.mutateAsync({
      first_name: values.first_name,
      last_name: values.last_name,
      role: values.role,
      is_active: values.is_active,
      // Omitted entirely when blank: password is optional on update, and
      // sending "" would fail password validation.
      ...(values.password === "" ? {} : { password: values.password }),
    });
    await navigate({ to: "/users" });
  }

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Edit user</h1>
      <div className="max-w-xl rounded-lg bg-white p-4 shadow-sm sm:p-6">
        <UserForm
          user={user}
          onSubmit={handleSubmit}
          onCancel={() => void navigate({ to: "/users" })}
        />
      </div>
    </section>
  );
}
