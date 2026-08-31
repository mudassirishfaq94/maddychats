import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { TextField } from "../components/TextField";
import { Alert } from "../components/Alert";
import { api, ApiError } from "../lib/api";

type ForgotResponse = {
  success: boolean;
  emailConfigured: boolean;
  message: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ForgotResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const data = await api.post<ForgotResponse>("/auth/forgot-password", {
        email,
      });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        setFormError(err.fields ? null : err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Tell us the email associated with your account."
      footer={
        <>
          Remembered it?{" "}
          <Link
            to="/login"
            className="font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      {/* Honest V1 notice: no email provider is configured, so we don't pretend
          a reset link was sent. */}
      <Alert variant="info">
        Heads up: password reset emails aren’t available yet. Email delivery
        will be enabled once an email provider is configured for Maddy Chats.
      </Alert>

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}
        {result && (
          <Alert variant={result.emailConfigured ? "success" : "info"}>
            {result.message}
          </Alert>
        )}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          placeholder="you@example.com"
          required
        />

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Submitting…" : "Continue"}
        </button>
      </form>
    </AuthLayout>
  );
}
