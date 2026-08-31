import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { TextField } from "../components/TextField";
import { Alert } from "../components/Alert";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await register(form);
      navigate("/app", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        setFormError(err.fields ? null : err.message);
      } else {
        setFormError("Unable to create your account. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join Maddy Chats in less than a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField
          label="Display name"
          type="text"
          autoComplete="name"
          value={form.displayName}
          onChange={update("displayName")}
          error={errors.displayName}
          placeholder="Maddy Rivera"
          required
        />

        <TextField
          label="Username"
          type="text"
          autoComplete="username"
          value={form.username}
          onChange={update("username")}
          error={errors.username}
          hint="Lowercase letters, numbers and underscores."
          placeholder="maddy"
          required
        />

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update("email")}
          error={errors.email}
          placeholder="you@example.com"
          required
        />

        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update("password")}
          error={errors.password}
          hint="At least 8 characters."
          placeholder="••••••••"
          required
        />

        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={update("confirmPassword")}
          error={errors.confirmPassword}
          placeholder="••••••••"
          required
        />

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
